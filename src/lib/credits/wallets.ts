import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  wallets,
  type Project,
  type Wallet,
} from "@/db/schema";
import { createCreditCode } from "@/lib/id";
import {
  activeProducts,
  activeProductsTx,
  creditBearingProductIds,
  expireCodeWalletIfNeeded,
  initBalanceRows,
  syncBalance,
  viewOf,
} from "./balances";
import { WalletExpiredError } from "./errors";
import { isUniqueViolation, type BalanceView, type Tx, type WalletWithBalances } from "./shared";
import { computeWalletAccess, readWalletById } from "./access";

const EMPTY_ACCESS = { features: [], subscriptions: [] };

/**
 * Insert a wallet with a fresh unique code. Each attempt runs in a nested
 * transaction (savepoint) so a code collision aborts only that attempt - a
 * plain retry inside an aborted Postgres transaction would always fail.
 */
async function insertCodeWallet(tx: Tx, project: Project): Promise<Wallet> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await tx.transaction(async (inner) => {
        const [wallet] = await inner
          .insert(wallets)
          .values({
            projectId: project.id,
            kind: "code",
            code: createCreditCode(project.codePrefix),
          })
          .returning();
        return wallet;
      });
    } catch (e) {
      lastError = e;
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw lastError ?? new Error("Could not allocate a unique code");
}

/** Transaction-aware variant of {@link createCodeWallet} (used by fulfillment). */
export async function createCodeWalletTx(
  tx: Tx,
  project: Project,
): Promise<WalletWithBalances> {
  const prods = await activeProductsTx(tx, project.id);
  const wallet = await insertCodeWallet(tx, project);
  const grants = await initBalanceRows(tx, wallet.id, prods);
  const bearing = await creditBearingProductIds(tx, prods);
  const balances: BalanceView[] = prods
    .filter((product) => bearing.has(product.id))
    .map((product) => {
      const g = grants.get(product.id)!;
      return viewOf(product, g.balance, g.resetAt);
    });
  // A brand-new wallet has no subscriptions or feature grants yet.
  return { wallet, balances, ...EMPTY_ACCESS };
}

/** Create a fresh anonymous wallet with a code + a balance row per product. */
export async function createCodeWallet(
  projectId: string,
): Promise<WalletWithBalances> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) throw new Error("Project not found");
  return db.transaction((tx) => createCodeWalletTx(tx, project));
}

/**
 * Transaction-aware active-code lookup. Throws WalletExpiredError when the
 * code just expired (the expiry ledger writes stay in `tx` - catch the error
 * inside the transaction callback if the transaction should still commit).
 */
export async function findActiveCodeWalletTx(
  tx: Tx,
  projectId: string,
  code: string,
): Promise<Wallet | null> {
  const wallet = await tx.query.wallets.findFirst({
    where: and(eq(wallets.projectId, projectId), eq(wallets.code, code)),
  });
  if (!wallet) return null;
  const expiredAt = await expireCodeWalletIfNeeded(tx, wallet);
  if (expiredAt) throw new WalletExpiredError(expiredAt);
  return wallet;
}

export async function findActiveCodeWallet(
  projectId: string,
  code: string,
): Promise<Wallet | null> {
  let expired: WalletExpiredError | null = null;
  // Catch inside the callback so the expiry ledger entries commit, then rethrow.
  const wallet = await db.transaction(async (tx) => {
    try {
      return await findActiveCodeWalletTx(tx, projectId, code);
    } catch (e) {
      if (e instanceof WalletExpiredError) {
        expired = e;
        return null;
      }
      throw e;
    }
  });
  if (expired) throw expired;
  return wallet;
}

/** Get-or-create a wallet keyed by external user id (server-side projects). */
export async function getOrCreateExternalWallet(
  projectId: string,
  externalUserId: string,
): Promise<WalletWithBalances> {
  const existing = await db.query.wallets.findFirst({
    where: and(
      eq(wallets.projectId, projectId),
      eq(wallets.externalUserId, externalUserId),
    ),
  });
  if (existing) return readWalletById(existing.id);

  const prods = await activeProducts(projectId);
  return db.transaction(async (tx) => {
    const bearing = await creditBearingProductIds(tx, prods);
    const creditProds = prods.filter((p) => bearing.has(p.id));
    const [wallet] = await tx
      .insert(wallets)
      .values({ projectId, kind: "external", externalUserId })
      .onConflictDoNothing()
      .returning();
    if (!wallet) {
      const existing = await tx.query.wallets.findFirst({
        where: and(
          eq(wallets.projectId, projectId),
          eq(wallets.externalUserId, externalUserId),
        ),
      });
      if (!existing) throw new Error("Could not create external wallet");
      const balances: BalanceView[] = [];
      for (const p of creditProds) {
        balances.push(viewOf(p, await syncBalance(tx, existing.id, p), null));
      }
      // Existed after a create race - surface its real access, not empty.
      return {
        wallet: existing,
        balances,
        ...(await computeWalletAccess(tx, existing.id)),
      };
    }
    const grants = await initBalanceRows(tx, wallet.id, prods);
    const balances: BalanceView[] = creditProds.map((product) => {
      const g = grants.get(product.id)!;
      return viewOf(product, g.balance, g.resetAt);
    });
    return { wallet, balances, ...EMPTY_ACCESS };
  });
}

/** Read an existing external-auth wallet without creating one. */
export async function readExternalWallet(
  projectId: string,
  externalUserId: string,
): Promise<WalletWithBalances | null> {
  const wallet = await db.query.wallets.findFirst({
    where: and(
      eq(wallets.projectId, projectId),
      eq(wallets.externalUserId, externalUserId),
    ),
  });
  return wallet ? readWalletById(wallet.id) : null;
}

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creditBalances,
  ledgerEntries,
  products,
  wallets,
  type LedgerReason,
  type Price,
  type Product,
  type Wallet,
} from "@/db/schema";
import { expireCodeWalletIfNeeded, syncBalance } from "./balances";
import {
  InsufficientCreditsError,
  ProductNotFoundError,
  WalletExpiredError,
  WalletNotFoundError,
} from "./errors";
import { fmt, toNum, type Tx } from "./shared";

/**
 * Deduct credits from a (wallet, product) balance. Idempotent per
 * (wallet, idempotencyKey); locks the balance row for the transaction.
 * The wallet is resolved inside the transaction via `findWallet`.
 */
async function deductFromWallet(
  findWallet: (tx: Tx) => Promise<Wallet | undefined | null>,
  productId: string,
  amount: number,
  idempotencyKey: string,
  metadata?: Record<string, unknown>,
): Promise<{ balance: number; deducted: boolean }> {
  if (amount <= 0) throw new Error("Deduction amount must be positive");

  let expiredAt: Date | null = null;
  const result = await db.transaction(async (tx) => {
    const wallet = await findWallet(tx);
    if (!wallet) throw new WalletNotFoundError();
    expiredAt = await expireCodeWalletIfNeeded(tx, wallet);
    if (expiredAt) return null;

    const product = await tx.query.products.findFirst({
      where: and(
        eq(products.id, productId),
        eq(products.projectId, wallet.projectId),
      ),
    });
    if (!product) throw new ProductNotFoundError();

    const balance = await syncBalance(tx, wallet.id, product);

    const prior = await tx.query.ledgerEntries.findFirst({
      where: and(
        eq(ledgerEntries.walletId, wallet.id),
        eq(ledgerEntries.idempotencyKey, idempotencyKey),
      ),
    });
    if (prior) return { balance, deducted: false };

    if (balance < amount) throw new InsufficientCreditsError(balance, amount);

    // The unique index also backstops a concurrent same-key request that
    // slipped past the prior-entry check - treat that as the idempotent no-op
    // it is instead of failing the transaction.
    const inserted = await tx
      .insert(ledgerEntries)
      .values({
        walletId: wallet.id,
        productId: product.id,
        delta: fmt(-amount),
        reason: "deduction",
        idempotencyKey,
        metadata,
      })
      .onConflictDoNothing({
        target: [ledgerEntries.walletId, ledgerEntries.idempotencyKey],
      })
      .returning({ id: ledgerEntries.id });
    if (inserted.length === 0) return { balance, deducted: false };

    const [updated] = await tx
      .update(creditBalances)
      .set({ balance: sql`${creditBalances.balance} - ${fmt(amount)}` })
      .where(
        and(
          eq(creditBalances.walletId, wallet.id),
          eq(creditBalances.productId, product.id),
        ),
      )
      .returning({ balance: creditBalances.balance });
    // Deducting is activity - keep the wallet from expiring as "inactive".
    await tx
      .update(wallets)
      .set({ lastSeenAt: new Date() })
      .where(eq(wallets.id, wallet.id));
    return { balance: toNum(updated.balance), deducted: true };
  });
  if (expiredAt) throw new WalletExpiredError(expiredAt);
  if (!result) throw new WalletNotFoundError();
  return result;
}

/** Deduct from an anonymous wallet by its credit code. */
export async function deductByCode(
  code: string,
  productId: string,
  amount: number,
  idempotencyKey: string,
  metadata?: Record<string, unknown>,
): Promise<{ balance: number; deducted: boolean }> {
  return deductFromWallet(
    (tx) => tx.query.wallets.findFirst({ where: eq(wallets.code, code) }),
    productId,
    amount,
    idempotencyKey,
    metadata,
  );
}

/** Deduct from an external-auth wallet keyed by the app's own user id. */
export async function deductByExternalId(
  projectId: string,
  externalUserId: string,
  productId: string,
  amount: number,
  idempotencyKey: string,
  metadata?: Record<string, unknown>,
): Promise<{ balance: number; deducted: boolean }> {
  return deductFromWallet(
    (tx) =>
      tx.query.wallets.findFirst({
        where: and(
          eq(wallets.projectId, projectId),
          eq(wallets.externalUserId, externalUserId),
        ),
      }),
    productId,
    amount,
    idempotencyKey,
    metadata,
  );
}

/** Transaction-aware variant of {@link creditWallet} (used by fulfillment). */
export async function creditWalletTx(
  tx: Tx,
  walletId: string,
  productId: string,
  amount: number,
  reason: LedgerReason,
  opts: { orderId?: string; idempotencyKey?: string; metadata?: Record<string, unknown> } = {},
): Promise<{ balance: number; applied: boolean }> {
  if (amount === 0) return { balance: 0, applied: false };

  const [row] = await tx
    .select()
    .from(creditBalances)
    .where(
      and(
        eq(creditBalances.walletId, walletId),
        eq(creditBalances.productId, productId),
      ),
    )
    .for("update");

  if (opts.idempotencyKey) {
    const prior = await tx.query.ledgerEntries.findFirst({
      where: and(
        eq(ledgerEntries.walletId, walletId),
        eq(ledgerEntries.idempotencyKey, opts.idempotencyKey),
      ),
    });
    if (prior) return { balance: row ? toNum(row.balance) : 0, applied: false };
  }

  if (!row) {
    await tx
      .insert(creditBalances)
      .values({ walletId, productId, balance: "0" })
      .onConflictDoNothing();
  }
  const insert = tx.insert(ledgerEntries).values({
    walletId,
    productId,
    delta: fmt(amount),
    reason,
    orderId: opts.orderId,
    idempotencyKey: opts.idempotencyKey,
    metadata: opts.metadata,
  });
  if (opts.idempotencyKey) {
    const inserted = await insert
      .onConflictDoNothing({
        target: [ledgerEntries.walletId, ledgerEntries.idempotencyKey],
      })
      .returning({ id: ledgerEntries.id });
    if (inserted.length === 0) {
      return { balance: row ? toNum(row.balance) : 0, applied: false };
    }
  } else {
    await insert;
  }
  const [updated] = await tx
    .update(creditBalances)
    .set({ balance: sql`${creditBalances.balance} + ${fmt(amount)}` })
    .where(
      and(
        eq(creditBalances.walletId, walletId),
        eq(creditBalances.productId, productId),
      ),
    )
    .returning({ balance: creditBalances.balance });
  return { balance: toNum(updated.balance), applied: true };
}

/** Add credits to a (wallet, product) balance (purchase, manual, refund). */
export async function creditWallet(
  walletId: string,
  productId: string,
  amount: number,
  reason: LedgerReason,
  opts: { orderId?: string; idempotencyKey?: string; metadata?: Record<string, unknown> } = {},
): Promise<{ balance: number; applied: boolean }> {
  return db.transaction((tx) =>
    creditWalletTx(tx, walletId, productId, amount, reason, opts),
  );
}

/**
 * Apply a subscription price's included credits for one paid cycle (or the
 * first purchase), honoring the product's renewal mode:
 * - "add": add the full included amount (credits accumulate).
 * - "refresh": top the balance UP TO the included amount (never reduce, never
 *   stack) - "you get N per cycle". Computed under a row lock so a concurrent
 *   deduct can't skew the top-up.
 * Idempotent via `opts.idempotencyKey` (delegated to {@link creditWalletTx}).
 */
export async function applyIncludedCredits(
  tx: Tx,
  walletId: string,
  product: Product,
  price: Price,
  opts: { orderId?: string; idempotencyKey?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  const included = toNum(price.creditsGranted);
  if (included <= 0) return;

  if (product.renewalMode === "add") {
    await creditWalletTx(tx, walletId, product.id, included, "purchase", opts);
    return;
  }

  const [row] = await tx
    .select({ balance: creditBalances.balance })
    .from(creditBalances)
    .where(
      and(
        eq(creditBalances.walletId, walletId),
        eq(creditBalances.productId, product.id),
      ),
    )
    .for("update");
  const current = row ? toNum(row.balance) : 0;
  const topUp = Math.max(0, included - current);
  // Nothing to add (balance already at/above the included amount). Naturally
  // idempotent: a replay recomputes 0 and also no-ops.
  if (topUp <= 0) return;
  await creditWalletTx(tx, walletId, product.id, topUp, "purchase", opts);
}

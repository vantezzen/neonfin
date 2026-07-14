import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creditBalances,
  ledgerEntries,
  orders,
  prices,
  products,
  projects,
  type Product,
  type Project,
  type Wallet,
} from "@/db/schema";
import { fmt, toNum, type BalanceView, type Tx } from "./shared";

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function codeExpiryDate(wallet: Wallet, project: Project): Date | null {
  const days = project.codeExpiresInDays;
  if (wallet.kind !== "code" || !days || days <= 0) return null;
  return addDays(wallet.lastSeenAt, days);
}

async function hasPaidOrder(tx: Tx, walletId: string): Promise<boolean> {
  const order = await tx.query.orders.findFirst({
    where: and(eq(orders.walletId, walletId), eq(orders.status, "paid")),
    columns: { id: true },
  });
  return Boolean(order);
}

async function expireWalletBalances(tx: Tx, walletId: string): Promise<void> {
  const rows = await tx
    .select()
    .from(creditBalances)
    .where(eq(creditBalances.walletId, walletId))
    .for("update");

  for (const row of rows) {
    const balance = toNum(row.balance);
    if (balance <= 0) continue;

    await tx
      .insert(ledgerEntries)
      .values({
        walletId,
        productId: row.productId,
        delta: fmt(-balance),
        reason: "expiry",
        idempotencyKey: `expiry_${row.id}`,
      })
      .onConflictDoNothing();
    await tx
      .update(creditBalances)
      .set({ balance: "0" })
      .where(eq(creditBalances.id, row.id));
  }
}

export async function expireCodeWalletIfNeeded(
  tx: Tx,
  wallet: Wallet,
): Promise<Date | null> {
  const project = await tx.query.projects.findFirst({
    where: eq(projects.id, wallet.projectId),
  });
  if (!project) throw new Error("Project not found");

  const expiresAt = codeExpiryDate(wallet, project);
  if (!expiresAt || expiresAt > new Date()) return null;
  if (await hasPaidOrder(tx, wallet.id)) return null;

  await expireWalletBalances(tx, wallet.id);
  return expiresAt;
}

export function initialGrant(product: Product): { balance: number; resetAt: Date | null } {
  const grant = product.freeGrant;
  if (!grant) return { balance: 0, resetAt: null };
  return {
    balance: grant.credits,
    resetAt: grant.period === "monthly" ? addMonths(new Date(), 1) : null,
  };
}

/**
 * Create the (wallet, product) balance row, applying the product's free grant.
 * Returns null when a concurrent request created the row first - the caller
 * re-reads instead of failing on the unique index.
 */
export async function initBalanceRow(
  tx: Tx,
  walletId: string,
  product: Product,
): Promise<number | null> {
  const { balance, resetAt } = initialGrant(product);
  const inserted = await tx
    .insert(creditBalances)
    .values({
      walletId,
      productId: product.id,
      balance: fmt(balance),
      freeGrantResetAt: resetAt,
    })
    .onConflictDoNothing()
    .returning({ id: creditBalances.id });
  if (inserted.length === 0) return null;
  if (balance > 0) {
    await tx.insert(ledgerEntries).values({
      walletId,
      productId: product.id,
      delta: fmt(balance),
      reason: "free_grant",
    });
  }
  return balance;
}

/**
 * Batch variant of initBalanceRow: inserts all (wallet, product) balance rows
 * in a single statement and emits free_grant ledger entries (also batched) only
 * for products that were actually inserted and have a non-zero grant.
 * Returns a Map<productId, { balance, resetAt }> for every input product.
 */
export async function initBalanceRows(
  tx: Tx,
  walletId: string,
  products: Product[],
): Promise<Map<string, { balance: number; resetAt: Date | null }>> {
  const grants = new Map(
    products.map((p) => [p.id, { product: p, grant: initialGrant(p) }]),
  );
  if (products.length === 0) return new Map();
  const inserted = await tx
    .insert(creditBalances)
    .values(
      products.map((p) => {
        const { balance, resetAt } = grants.get(p.id)!.grant;
        return { walletId, productId: p.id, balance: fmt(balance), freeGrantResetAt: resetAt };
      }),
    )
    .onConflictDoNothing()
    .returning({ productId: creditBalances.productId });
  const insertedIds = new Set(inserted.map((r) => r.productId));
  const grantRows = products
    .filter((p) => insertedIds.has(p.id) && grants.get(p.id)!.grant.balance > 0)
    .map((p) => ({
      walletId,
      productId: p.id,
      delta: fmt(grants.get(p.id)!.grant.balance),
      reason: "free_grant" as const,
    }));
  if (grantRows.length > 0) {
    await tx.insert(ledgerEntries).values(grantRows);
  }
  return new Map(products.map((p) => [p.id, grants.get(p.id)!.grant]));
}

/**
 * Lock (or lazily create) the (wallet, product) balance row and apply any due
 * monthly free-grant refill. Tops up *to* the grant amount (never additive) so
 * unused free credits don't accumulate. Returns the current balance.
 */
export async function syncBalance(
  tx: Tx,
  walletId: string,
  product: Product,
): Promise<number> {
  const lockRow = () =>
    tx
      .select()
      .from(creditBalances)
      .where(
        and(
          eq(creditBalances.walletId, walletId),
          eq(creditBalances.productId, product.id),
        ),
      )
      .for("update");

  let [row] = await lockRow();
  if (!row) {
    const created = await initBalanceRow(tx, walletId, product);
    if (created !== null) return created;
    // Lost a create race - the row exists now; lock and continue.
    [row] = await lockRow();
    if (!row) throw new Error("Could not create credit balance row");
  }

  let balance = toNum(row.balance);
  const grant = product.freeGrant;
  const due =
    grant?.period === "monthly" &&
    row.freeGrantResetAt != null &&
    row.freeGrantResetAt <= new Date();
  if (grant && due) {
    const topUp = Math.max(0, grant.credits - balance);
    if (topUp > 0) {
      await tx.insert(ledgerEntries).values({
        walletId,
        productId: product.id,
        delta: fmt(topUp),
        reason: "free_grant",
      });
      // Top-up-to semantics: the post-refill balance is exactly the grant.
      balance = grant.credits;
    }
    await tx
      .update(creditBalances)
      .set({ balance: fmt(balance), freeGrantResetAt: addMonths(new Date(), 1) })
      .where(eq(creditBalances.id, row.id));
  }
  return balance;
}

/**
 * Of the given products, the ones that can actually hold a credit balance:
 * metered credit packs (`type === "credits"`), anything with a free grant, and
 * subscription / one-time products whose price includes credits
 * (`creditsGranted > 0`). Feature-only products (plain subscriptions, one-time
 * unlocks) are excluded so they never surface as meaningless "0 credits"
 * balances - their access lives in `features`/`subscriptions` instead.
 */
export async function creditBearingProductIds(
  exec: typeof db | Tx,
  prods: Product[],
): Promise<Set<string>> {
  const bearing = new Set(
    prods
      .filter((p) => p.type === "credits" || p.freeGrant != null)
      .map((p) => p.id),
  );
  const rest = prods.filter((p) => !bearing.has(p.id)).map((p) => p.id);
  if (rest.length > 0) {
    const rows = await exec
      .selectDistinct({ productId: prices.productId })
      .from(prices)
      .where(
        and(inArray(prices.productId, rest), sql`${prices.creditsGranted} > 0`),
      );
    for (const r of rows) bearing.add(r.productId);
  }
  return bearing;
}

export async function activeProducts(projectId: string): Promise<Product[]> {
  return db.query.products.findMany({
    where: and(eq(products.projectId, projectId), eq(products.active, true)),
    orderBy: [asc(products.createdAt), asc(products.id)],
  });
}

export async function activeProductsTx(tx: Tx, projectId: string): Promise<Product[]> {
  return tx.query.products.findMany({
    where: and(eq(products.projectId, projectId), eq(products.active, true)),
    orderBy: [asc(products.createdAt), asc(products.id)],
  });
}

export function viewOf(product: Product, balance: number, resetAt: Date | null): BalanceView {
  return {
    productId: product.id,
    productName: product.name,
    creditUnit: product.creditUnit,
    balance,
    freeGrantResetAt: resetAt,
  };
}

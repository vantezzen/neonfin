import "server-only";
import { addDays, addMonths } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creditBalances,
  featureGrants,
  ledgerEntries,
  orders,
  prices,
  products,
  projects,
  subscriptions,
  wallets,
  type LedgerReason,
  type Price,
  type Product,
  type Project,
  type SubscriptionStatus,
  type Wallet,
} from "@/db/schema";
import { assertCreditDelta } from "@/lib/amounts";
import { createCreditCode } from "@/lib/id";

// Credits are numeric(20,6). Postgres holds the source of truth AND does the
// arithmetic (`balance = balance ± delta` in SQL); JS only compares/formats,
// rounding to the column scale so stored strings never carry float noise.
const SCALE = 6;
export function toNum(v: string | number): number {
  return typeof v === "number" ? v : parseFloat(v);
}
function fmt(n: number): string {
  assertCreditDelta(n);
  return n.toFixed(SCALE);
}

/** True for a Postgres unique-constraint violation (optionally a specific one). */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  for (const c of [e, (e as { cause?: unknown } | null)?.cause]) {
    if (!c || typeof c !== "object") continue;
    if ((c as { code?: unknown }).code !== "23505") continue;
    if (!constraint) return true;
    const name = (c as { constraint_name?: unknown }).constraint_name;
    if (String(name ?? "").includes(constraint)) return true;
    if (c instanceof Error && c.message.includes(constraint)) return true;
  }
  return false;
}

export class InsufficientCreditsError extends Error {
  constructor(public readonly balance: number, public readonly requested: number) {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
  }
}
export class WalletNotFoundError extends Error {
  constructor() {
    super("Wallet not found");
    this.name = "WalletNotFoundError";
  }
}
export class WalletExpiredError extends Error {
  constructor(public readonly expiredAt: Date) {
    super("Wallet expired");
    this.name = "WalletExpiredError";
  }
}
export class ProductNotFoundError extends Error {
  constructor() {
    super("Product not found for this project");
    this.name = "ProductNotFoundError";
  }
}

export type BalanceView = {
  productId: string;
  productName: string;
  creditUnit: string;
  balance: number;
  freeGrantResetAt: Date | null;
};

export type SubscriptionView = {
  id: string;
  productId: string;
  priceId: string | null;
  label: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
};

/** A wallet's derived access: feature slugs it holds + its active subscriptions. */
export type WalletAccess = {
  features: string[];
  subscriptions: SubscriptionView[];
};

export type WalletWithBalances = {
  wallet: Wallet;
  balances: BalanceView[];
  features: string[];
  subscriptions: SubscriptionView[];
};

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Either the pooled db or an open transaction - both share the query builder. */
type Exec = typeof db | Tx;

const EMPTY_ACCESS: WalletAccess = { features: [], subscriptions: [] };

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

async function expireCodeWalletIfNeeded(
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

function initialGrant(product: Product): { balance: number; resetAt: Date | null } {
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
async function initBalanceRow(
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
 * Lock (or lazily create) the (wallet, product) balance row and apply any due
 * monthly free-grant refill. Tops up *to* the grant amount (never additive) so
 * unused free credits don't accumulate. Returns the current balance.
 */
async function syncBalance(
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

async function activeProducts(projectId: string): Promise<Product[]> {
  return db.query.products.findMany({
    where: and(eq(products.projectId, projectId), eq(products.active, true)),
  });
}

async function activeProductsTx(tx: Tx, projectId: string): Promise<Product[]> {
  return tx.query.products.findMany({
    where: and(eq(products.projectId, projectId), eq(products.active, true)),
  });
}

function viewOf(product: Product, balance: number, resetAt: Date | null): BalanceView {
  return {
    productId: product.id,
    productName: product.name,
    creditUnit: product.creditUnit,
    balance,
    freeGrantResetAt: resetAt,
  };
}

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
  const balances: BalanceView[] = [];
  for (const product of prods) {
    const balance = (await initBalanceRow(tx, wallet.id, product)) ?? 0;
    balances.push(viewOf(product, balance, initialGrant(product).resetAt));
  }
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
      for (const p of prods) {
        balances.push(viewOf(p, await syncBalance(tx, existing.id, p), null));
      }
      // Existed after a create race - surface its real access, not empty.
      return {
        wallet: existing,
        balances,
        ...(await computeWalletAccess(tx, existing.id)),
      };
    }
    const balances: BalanceView[] = [];
    for (const product of prods) {
      const balance = (await initBalanceRow(tx, wallet.id, product)) ?? 0;
      balances.push(viewOf(product, balance, initialGrant(product).resetAt));
    }
    return { wallet, balances, ...EMPTY_ACCESS };
  });
}

/**
 * Derive a wallet's access from its data (never stored as state, so cancel /
 * refund revoke automatically). Sources: active subscriptions' price features,
 * paid non-refunded one-time purchases' price features, and manual grants.
 */
export async function computeWalletAccess(
  exec: Exec,
  walletId: string,
): Promise<WalletAccess> {
  const [subRows, orderRows, grantRows] = await Promise.all([
    exec
      .select({
        id: subscriptions.id,
        productId: subscriptions.productId,
        priceId: subscriptions.priceId,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        label: sql<string | null>`case when ${orders.productIdSnapshot} is not null or ${orders.creditsGrantedSnapshot} is not null or ${orders.intervalSnapshot} is not null then ${orders.priceLabelSnapshot} else ${prices.label} end`,
        features: sql<string[]>`case when ${orders.productIdSnapshot} is not null or ${orders.creditsGrantedSnapshot} is not null or ${orders.intervalSnapshot} is not null then ${orders.featuresSnapshot} else coalesce(${prices.features}, '{}') end`,
      })
      .from(subscriptions)
      .leftJoin(prices, eq(subscriptions.priceId, prices.id))
      .leftJoin(orders, eq(subscriptions.orderId, orders.id))
      .where(
        and(
          eq(subscriptions.walletId, walletId),
          eq(subscriptions.status, "active"),
        ),
      ),
    // One-time unlocks grant their features permanently once paid. Recurring
    // prices' features come via the subscriptions join above, not here.
    exec
      .select({
        features: sql<string[]>`case when ${orders.productIdSnapshot} is not null or ${orders.creditsGrantedSnapshot} is not null or ${orders.intervalSnapshot} is not null then ${orders.featuresSnapshot} else coalesce(${prices.features}, '{}') end`,
      })
      .from(orders)
      .leftJoin(prices, eq(orders.priceId, prices.id))
      .where(
        and(
          eq(orders.walletId, walletId),
          eq(orders.status, "paid"),
          sql`coalesce(${orders.intervalSnapshot}, ${prices.interval}) = 'one_time'`,
        ),
      ),
    exec
      .select({ feature: featureGrants.feature })
      .from(featureGrants)
      .where(eq(featureGrants.walletId, walletId)),
  ]);

  const features = new Set<string>();
  for (const s of subRows) for (const f of s.features ?? []) features.add(f);
  for (const o of orderRows) for (const f of o.features ?? []) features.add(f);
  for (const g of grantRows) features.add(g.feature);

  return {
    features: [...features].sort(),
    subscriptions: subRows.map((s) => ({
      id: s.id,
      productId: s.productId,
      priceId: s.priceId,
      label: s.label ?? null,
      status: s.status,
      currentPeriodEnd: s.currentPeriodEnd,
    })),
  };
}

/** Read a wallet + all per-product balances (applying refills), by code. */
export async function readWalletByCode(
  code: string,
  projectId?: string,
): Promise<WalletWithBalances> {
  const wallet = await db.query.wallets.findFirst({
    where: projectId
      ? and(eq(wallets.code, code), eq(wallets.projectId, projectId))
      : eq(wallets.code, code),
  });
  if (!wallet) throw new WalletNotFoundError();
  return readWalletById(wallet.id);
}

async function readWalletById(walletId: string): Promise<WalletWithBalances> {
  const wallet = await db.query.wallets.findFirst({ where: eq(wallets.id, walletId) });
  if (!wallet) throw new WalletNotFoundError();
  const prods = await activeProducts(wallet.projectId);

  let expiredAt: Date | null = null;
  const balances = await db.transaction(async (tx) => {
    expiredAt = await expireCodeWalletIfNeeded(tx, wallet);
    if (expiredAt) return [];

    const out: BalanceView[] = [];
    for (const product of prods) {
      const balance = await syncBalance(tx, wallet.id, product);
      const [row] = await tx
        .select({ resetAt: creditBalances.freeGrantResetAt })
        .from(creditBalances)
        .where(
          and(
            eq(creditBalances.walletId, wallet.id),
            eq(creditBalances.productId, product.id),
          ),
        );
      out.push(viewOf(product, balance, row?.resetAt ?? null));
    }
    await tx
      .update(wallets)
      .set({ lastSeenAt: new Date() })
      .where(eq(wallets.id, wallet.id));
    return out;
  });
  if (expiredAt) throw new WalletExpiredError(expiredAt);
  const access = await computeWalletAccess(db, wallet.id);
  return { wallet, balances, ...access };
}

/** The sole active product's id, or null if there are zero or many. */
export async function soleProductId(projectId: string): Promise<string | null> {
  const prods = await activeProducts(projectId);
  return prods.length === 1 ? prods[0].id : null;
}

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

import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  creditBalances,
  featureGrants,
  orders,
  prices,
  subscriptions,
  wallets,
} from "@/db/schema";
import {
  activeProducts,
  creditBearingProductIds,
  expireCodeWalletIfNeeded,
  syncBalance,
  viewOf,
} from "./balances";
import { WalletExpiredError, WalletNotFoundError } from "./errors";
import {
  type BalanceView,
  type Tx,
  type WalletAccess,
  type WalletWithBalances,
} from "./shared";

/** Either the pooled db or an open transaction - both share the query builder. */
type Exec = typeof db | Tx;

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

export async function readWalletById(walletId: string): Promise<WalletWithBalances> {
  const wallet = await db.query.wallets.findFirst({ where: eq(wallets.id, walletId) });
  if (!wallet) throw new WalletNotFoundError();
  const prods = await activeProducts(wallet.projectId);

  let expiredAt: Date | null = null;
  const balances = await db.transaction(async (tx) => {
    expiredAt = await expireCodeWalletIfNeeded(tx, wallet);
    if (expiredAt) return [];

    const bearing = await creditBearingProductIds(tx, prods);
    const out: BalanceView[] = [];
    for (const product of prods) {
      if (!bearing.has(product.id)) continue;
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

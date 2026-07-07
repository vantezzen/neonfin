import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  prices,
  products,
  projects,
  subscriptions,
  wallets,
  type Order,
  type Price,
  type PriceInterval,
  type Product,
  type Provider,
} from "@/db/schema";
import {
  applyIncludedCredits,
  createCodeWalletTx,
  creditWalletTx,
  findActiveCodeWalletTx,
  toNum,
  WalletExpiredError,
  type Tx,
} from "@/lib/credits";
import type { NormalizedEvent } from "@/lib/providers/types";

export type FulfillmentResult = "processed" | "skipped";

/**
 * Guard against cross-account fulfillment: an event verified with account A's
 * webhook secret may only fulfill orders whose product belongs to account A.
 * Without this, a developer who controls one provider account could craft a
 * signed event referencing an order under a different account.
 */
function assertAccountMatch(
  orderAccountId: string | null | undefined,
  expectedAccountId: string | undefined,
): void {
  if (expectedAccountId && orderAccountId !== expectedAccountId) {
    throw new Error(
      "Webhook account does not match the order's provider account",
    );
  }
}

/**
 * Find the event's order and lock its row for the transaction. The lock is the
 * fulfillment mutex: concurrent deliveries of the same order serialize here,
 * so the paid-status check that follows can't race.
 */
async function lockOrder(
  tx: Tx,
  event: NormalizedEvent,
): Promise<Order | undefined> {
  const orderId = event.metadata?.orderId;
  if (orderId) {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update");
    if (order) return order;
  }
  if (event.providerCheckoutId) {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.providerCheckoutId, event.providerCheckoutId))
      .for("update");
    return order;
  }
  return undefined;
}

/** Load a price with its full product, enforcing the cross-account guard. */
async function loadPrice(
  tx: Tx,
  priceId: string,
  expectedAccountId: string | undefined,
) {
  const price = await tx.query.prices.findFirst({
    where: eq(prices.id, priceId),
    with: { product: true },
  });
  if (!price) return undefined;
  assertAccountMatch(price.product.providerAccountId, expectedAccountId);
  return price;
}

function orderCredits(order: Order, price: { creditsGranted: string }): number {
  return order.creditsGrantedSnapshot != null
    ? toNum(order.creditsGrantedSnapshot)
    : toNum(price.creditsGranted);
}

function orderInterval(
  order: Order,
  price: { interval: PriceInterval },
): PriceInterval {
  return order.intervalSnapshot ?? price.interval;
}

function orderProduct(
  order: Order,
  price: { productId: string; product: Product },
): Product {
  return {
    ...price.product,
    id: order.productIdSnapshot ?? price.productId,
    creditUnit: order.creditUnitSnapshot ?? price.product.creditUnit,
    renewalMode: order.renewalModeSnapshot ?? price.product.renewalMode,
  };
}

function orderPrice(order: Order, price: Price): Price {
  const hasSnapshot =
    order.productIdSnapshot != null ||
    order.creditsGrantedSnapshot != null ||
    order.intervalSnapshot != null;
  return {
    ...price,
    productId: order.productIdSnapshot ?? price.productId,
    creditsGranted: String(orderCredits(order, price)),
    interval: orderInterval(order, price),
    label: hasSnapshot ? order.priceLabelSnapshot : price.label,
    features: hasSnapshot ? order.featuresSnapshot : price.features,
  };
}

/**
 * Create or refresh the wallet's subscription row for a recurring purchase.
 * Matched by the provider's subscription id when present, else by the order
 * that started it - so a renewal updates the same row instead of duplicating.
 */
async function upsertSubscription(
  tx: Tx,
  params: {
    walletId: string;
    productId: string;
    priceId: string;
    orderId: string;
    provider: Provider;
    providerSubscriptionId?: string;
    currentPeriodEnd?: Date;
  },
): Promise<void> {
  const { providerSubscriptionId } = params;
  let existing =
    providerSubscriptionId != null
      ? await tx.query.subscriptions.findFirst({
          where: and(
            eq(subscriptions.provider, params.provider),
            eq(subscriptions.providerSubscriptionId, providerSubscriptionId),
          ),
        })
      : undefined;
  if (!existing) {
    existing = await tx.query.subscriptions.findFirst({
      where: eq(subscriptions.orderId, params.orderId),
    });
  }

  if (existing) {
    await tx
      .update(subscriptions)
      .set({
        status: "active",
        priceId: params.priceId,
        providerSubscriptionId:
          providerSubscriptionId ?? existing.providerSubscriptionId,
        currentPeriodEnd: params.currentPeriodEnd ?? existing.currentPeriodEnd,
        canceledAt: null,
      })
      .where(eq(subscriptions.id, existing.id));
    return;
  }

  await tx
    .insert(subscriptions)
    .values({
      walletId: params.walletId,
      productId: params.productId,
      priceId: params.priceId,
      orderId: params.orderId,
      provider: params.provider,
      providerSubscriptionId,
      status: "active",
      currentPeriodEnd: params.currentPeriodEnd,
    })
    .onConflictDoNothing();
}

/**
 * Fulfill a locked, not-yet-paid order: resolve/create the wallet, grant the
 * price's credits and/or record its subscription, and mark the order paid -
 * all within the caller's transaction, so a mid-way failure leaves no partial
 * state (no credited-but-pending order, no orphan wallet).
 */
async function fulfillLockedOrder(
  tx: Tx,
  order: Order,
  event: NormalizedEvent,
  expectedAccountId: string | undefined,
): Promise<void> {
  if (!order.priceId) throw new Error("order.paid: order has no price");
  const price = await loadPrice(tx, order.priceId, expectedAccountId);
  if (!price) throw new Error("order.paid: price not found");
  const snapshotProduct = orderProduct(order, price);
  const snapshotPrice = orderPrice(order, price);
  const isRecurring = snapshotPrice.interval !== "one_time";

  // Resolve the target wallet, in order of specificity: a wallet pinned on the
  // order at checkout time (external-auth purchases), an existing code carried
  // through checkout metadata, or a fresh code wallet minted for this purchase.
  let wallet;
  if (order.walletId) {
    wallet = await tx.query.wallets.findFirst({
      where: eq(wallets.id, order.walletId),
    });
  }
  const code = event.metadata?.code;
  if (!wallet && code) {
    try {
      wallet = await findActiveCodeWalletTx(tx, order.projectId, code);
    } catch (e) {
      // Caught inside the transaction, so the expiry writes still commit.
      if (!(e instanceof WalletExpiredError)) throw e;
    }
  }
  if (!wallet) {
    const project = await tx.query.projects.findFirst({
      where: eq(projects.id, order.projectId),
    });
    if (!project) throw new Error("order.paid: project not found");
    wallet = (await createCodeWalletTx(tx, project)).wallet;
  }

  // Recurring offers honor the product's renewal mode for included credits;
  // one-time offers add their credits (if any) once. Features attached to the
  // price are derived from the subscription / order, not granted here.
  if (isRecurring) {
    await applyIncludedCredits(tx, wallet.id, snapshotProduct, snapshotPrice, {
      orderId: order.id,
      idempotencyKey: order.id,
    });
  } else {
    await creditWalletTx(
      tx,
      wallet.id,
      snapshotPrice.productId,
      toNum(snapshotPrice.creditsGranted),
      "purchase",
      { orderId: order.id, idempotencyKey: order.id },
    );
  }

  if (event.providerCustomerId) {
    await tx
      .update(wallets)
      .set({ providerCustomerId: event.providerCustomerId })
      .where(eq(wallets.id, wallet.id));
  }

  await tx
    .update(orders)
    .set({
      status: "paid",
      paidAt: new Date(),
      walletId: wallet.id,
      providerCustomerId: event.providerCustomerId ?? order.providerCustomerId,
      issuedCode: wallet.code,
    })
    .where(eq(orders.id, order.id));

  if (isRecurring) {
    await upsertSubscription(tx, {
      walletId: wallet.id,
      productId: snapshotProduct.id,
      priceId: price.id,
      orderId: order.id,
      provider: order.provider,
      providerSubscriptionId: event.providerSubscriptionId,
      currentPeriodEnd: event.currentPeriodEnd,
    });
  }
}

/** Fulfill a paid order. Safe to call repeatedly - a paid order short-circuits. */
export async function fulfillPaidOrder(
  event: NormalizedEvent,
  expectedAccountId?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const order = await lockOrder(tx, event);
    if (!order) throw new Error("order.paid: no matching order");
    if (order.status === "paid" || order.status === "refunded") return;
    await fulfillLockedOrder(tx, order, event, expectedAccountId);
  });
}

/**
 * Reverse a refunded order: claw back its credit grant and, if it started a
 * subscription, cancel that subscription (refunded first payment ⇒ no access).
 * Only full refunds reach this point (partial refunds normalize to `ignored`).
 */
export async function handleRefund(
  event: NormalizedEvent,
  expectedAccountId?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const order = await lockOrder(tx, event);
    if (!order || order.status === "refunded") {
      return;
    }
    if (order.status !== "paid" || !order.walletId || !order.priceId) {
      if (order.priceId) {
        const price = await loadPrice(tx, order.priceId, expectedAccountId);
        if (!price) return;
      }
      await tx
        .update(orders)
        .set({ status: "refunded" })
        .where(eq(orders.id, order.id));
      return;
    }
    const price = await loadPrice(tx, order.priceId, expectedAccountId);
    if (!price) return;
    const snapshotPrice = orderPrice(order, price);

    await creditWalletTx(
      tx,
      order.walletId,
      snapshotPrice.productId,
      -toNum(snapshotPrice.creditsGranted),
      "refund",
      {
        orderId: order.id,
        idempotencyKey: `refund_${order.id}`,
      },
    );
    // End any subscription this order started, so its features stop.
    await tx
      .update(subscriptions)
      .set({ status: "canceled", canceledAt: new Date() })
      .where(eq(subscriptions.orderId, order.id));
    await tx
      .update(orders)
      .set({ status: "refunded" })
      .where(eq(orders.id, order.id));
  });
}

/** Credit a subscription renewal against the wallet created by the first order. */
export async function handleSubscriptionRenewal(
  event: NormalizedEvent,
  expectedAccountId?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const order = await lockOrder(tx, event);
    if (!order) throw new Error("subscription.renewed: no matching order");
    if (order.status === "refunded") return;

    // A "renewal" for an order that never fulfilled is the subscription's
    // first real payment (e.g. a trial checkout completed unpaid) - run
    // first-purchase fulfillment so the wallet and subscription get set up.
    if (order.status !== "paid") {
      await fulfillLockedOrder(tx, order, event, expectedAccountId);
      return;
    }

    if (!order.walletId)
      throw new Error("subscription.renewed: order has no wallet");
    if (!order.priceId)
      throw new Error("subscription.renewed: order has no price");

    const price = await loadPrice(tx, order.priceId, expectedAccountId);
    if (!price) throw new Error("subscription.renewed: price not found");
    const snapshotProduct = orderProduct(order, price);
    const snapshotPrice = orderPrice(order, price);

    await applyIncludedCredits(tx, order.walletId, snapshotProduct, snapshotPrice, {
      orderId: order.id,
      idempotencyKey: `renewal_${event.providerEventId}`,
      metadata: {
        providerEventId: event.providerEventId,
        rawType: event.rawType,
      },
    });

    // Keep the subscription row active and extend its period.
    await upsertSubscription(tx, {
      walletId: order.walletId,
      productId: snapshotProduct.id,
      priceId: price.id,
      orderId: order.id,
      provider: order.provider,
      providerSubscriptionId: event.providerSubscriptionId,
      currentPeriodEnd: event.currentPeriodEnd,
    });

    if (event.providerCustomerId) {
      await tx
        .update(wallets)
        .set({ providerCustomerId: event.providerCustomerId })
        .where(eq(wallets.id, order.walletId));
    }
  });
}

/**
 * A subscription has actually ended: mark it canceled so its features stop.
 * Already-granted credits are never clawed back (existing policy).
 */
export async function handleSubscriptionEnded(
  event: NormalizedEvent,
  expectedAccountId?: string,
): Promise<void> {
  const subId = event.providerSubscriptionId;
  if (!subId) return;
  await db.transaction(async (tx) => {
    const sub = await tx.query.subscriptions.findFirst({
      where: eq(subscriptions.providerSubscriptionId, subId),
    });
    if (!sub) return;
    // Cross-account guard, mirroring the order handlers.
    const product = await tx.query.products.findFirst({
      where: eq(products.id, sub.productId),
      columns: { providerAccountId: true },
    });
    assertAccountMatch(product?.providerAccountId, expectedAccountId);
    await tx
      .update(subscriptions)
      .set({ status: "canceled", canceledAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
  });
}

export async function processNormalizedEvent(
  event: NormalizedEvent,
  expectedAccountId?: string,
): Promise<FulfillmentResult> {
  if (event.type === "order.paid") {
    await fulfillPaidOrder(event, expectedAccountId);
  } else if (event.type === "order.refunded") {
    await handleRefund(event, expectedAccountId);
  } else if (event.type === "subscription.renewed") {
    await handleSubscriptionRenewal(event, expectedAccountId);
  } else if (event.type === "subscription.ended") {
    await handleSubscriptionEnded(event, expectedAccountId);
  } else {
    return "skipped";
  }
  return "processed";
}

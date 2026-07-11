import "server-only";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, projects, subscriptions, type Provider } from "@/db/schema";
import type { NormalizedEvent } from "@/lib/provider-service/types";

type EventOrder = {
  id: string;
  projectId: string;
  status: string;
  priceId: string | null;
  walletId: string | null;
  amountCents: number;
  currency: string;
  productIdSnapshot: string | null;
  providerCheckoutId: string | null;
  paidAt: Date | null;
};

async function findEventOrder(event: NormalizedEvent): Promise<EventOrder | null> {
  const orderId = event.metadata?.orderId;
  if (!orderId && !event.providerCheckoutId) return null;
  return (
    (await db.query.orders.findFirst({
      where: orderId
        ? eq(orders.id, orderId)
        : eq(orders.providerCheckoutId, event.providerCheckoutId!),
      columns: {
        id: true,
        projectId: true,
        status: true,
        priceId: true,
        walletId: true,
        amountCents: true,
        currency: true,
        productIdSnapshot: true,
        providerCheckoutId: true,
        paidAt: true,
      },
    })) ?? null
  );
}

async function projectForSubscription(
  event: NormalizedEvent,
  provider: Provider,
): Promise<string | null> {
  if (!event.providerSubscriptionId) return null;
  const subscription = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.provider, provider),
      eq(subscriptions.providerSubscriptionId, event.providerSubscriptionId),
    ),
    with: { product: { columns: { projectId: true } } },
  });
  return subscription?.product.projectId ?? null;
}

function endpoint(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Deliver one normalized provider event to a project's configured HTTPS endpoint. */
export async function deliverProjectEvent(
  webhookEventId: string,
  event: NormalizedEvent,
  provider: Provider,
): Promise<void> {
  const order = await findEventOrder(event);
  const projectId =
    order?.projectId ?? (await projectForSubscription(event, provider));
  if (!projectId) return;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: {
      outboundWebhookUrl: true,
      outboundWebhookSecret: true,
    },
  });
  if (!project?.outboundWebhookUrl || !project.outboundWebhookSecret) return;
  const url = endpoint(project.outboundWebhookUrl);
  if (!url) throw new Error("Consumer webhook URL is invalid");

  const payload = JSON.stringify({
    id: webhookEventId,
    type: event.type,
    createdAt: new Date().toISOString(),
    data: {
      order: order
        ? {
            id: order.id,
            status: order.status,
            priceId: order.priceId,
            productId: order.productIdSnapshot,
            walletId: order.walletId,
            checkoutId: order.providerCheckoutId,
            amountCents: order.amountCents,
            currency: order.currency,
            paidAt: order.paidAt?.toISOString() ?? null,
          }
        : null,
      subscriptionId: event.providerSubscriptionId ?? null,
    },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", project.outboundWebhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Pay-Event": event.type,
      "Pay-Signature": `t=${timestamp},v1=${signature}`,
    },
    body: payload,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Consumer webhook returned ${response.status}`);
  }
}

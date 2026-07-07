import "server-only";
import type { PriceInterval } from "@/db/schema";

export type CatalogMode = "shared_product" | "price_product";

export type NormalizedEventType =
  | "order.paid"
  | "order.refunded"
  | "subscription.renewed"
  // The subscription has actually ended (access stops now), NOT merely
  // scheduled to cancel at period end.
  | "subscription.ended"
  | "ignored";

/** Provider-agnostic event consumed by the fulfillment layer. */
export interface NormalizedEvent {
  type: NormalizedEventType;
  /** Provider's unique event id - used for idempotency. */
  providerEventId: string;
  /** Raw provider event type, kept for the webhook log. */
  rawType: string;
  providerCheckoutId?: string;
  providerCustomerId?: string;
  /** Provider's subscription id - matches renewal/cancel events to a sub. */
  providerSubscriptionId?: string;
  /** End of the current paid period, when the event carries it. */
  currentPeriodEnd?: Date;
  /** Metadata we attached at checkout time (orderId, projectId, code). */
  metadata?: Record<string, string>;
}

export interface CreateProductInput {
  name: string;
  description?: string;
}

export interface CreatePriceInput {
  providerProductId?: string;
  productName: string;
  productDescription?: string;
  amountCents: number;
  currency: string;
  interval: PriceInterval;
}

export interface CreateCheckoutInput {
  providerPriceId: string;
  mode: "payment" | "subscription";
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  customerEmail?: string;
}

export interface PaymentProvider {
  /** Stripe-style catalogs share one provider product across many prices.
   * Polar-style catalogs create a provider product per purchasable price. */
  catalogMode: CatalogMode;
  createProduct?(
    input: CreateProductInput,
  ): Promise<{ providerProductId: string }>;
  createPrice(
    input: CreatePriceInput,
  ): Promise<{ providerPriceId: string; providerProductId?: string }>;
  createCheckout(
    input: CreateCheckoutInput,
  ): Promise<{ url: string; checkoutId: string }>;
  /** Verify signature and normalize, or throw on bad signature. */
  verifyAndNormalize(
    rawBody: string,
    headers: Headers,
  ): Promise<NormalizedEvent>;
  /** Normalize an already-verified payload from `webhookEvents` for replay. */
  normalizeStoredPayload(
    payload: unknown,
    providerEventId: string,
  ): NormalizedEvent;
  getPortalUrl(customerId: string, returnUrl: string): Promise<string>;
}

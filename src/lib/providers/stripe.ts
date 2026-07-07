import "server-only";
import Stripe from "stripe";
import type {
  CreateCheckoutInput,
  CreatePriceInput,
  CreateProductInput,
  NormalizedEvent,
  PaymentProvider,
} from "./types";

/** A Stripe reference field is either an id string or an expanded object. */
function readSubscriptionId(
  ref: string | { id: string } | null | undefined,
): string | undefined {
  if (!ref) return undefined;
  return typeof ref === "string" ? ref : ref.id;
}

function unixToDate(seconds: number | null | undefined): Date | undefined {
  return typeof seconds === "number" ? new Date(seconds * 1000) : undefined;
}

export class StripeProvider implements PaymentProvider {
  catalogMode = "shared_product" as const;

  private stripe: Stripe;
  constructor(
    secretKey: string,
    private webhookSecret: string | null,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createProduct(input: CreateProductInput) {
    const product = await this.stripe.products.create({
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
    });
    return { providerProductId: product.id };
  }

  async createPrice(input: CreatePriceInput) {
    if (!input.providerProductId) {
      throw new Error("Stripe price sync requires a provider product");
    }
    const price = await this.stripe.prices.create({
      product: input.providerProductId,
      unit_amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      ...(input.interval === "month" || input.interval === "year"
        ? { recurring: { interval: input.interval } }
        : {}),
    });
    return { providerPriceId: price.id };
  }

  async createCheckout(input: CreateCheckoutInput) {
    const session = await this.stripe.checkout.sessions.create({
      mode: input.mode,
      line_items: [{ price: input.providerPriceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      // Propagate metadata to the durable object so refunds/renewals can map back.
      ...(input.mode === "subscription"
        ? { subscription_data: { metadata: input.metadata } }
        : { payment_intent_data: { metadata: input.metadata } }),
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, checkoutId: session.id };
  }

  async verifyAndNormalize(
    rawBody: string,
    headers: Headers,
  ): Promise<NormalizedEvent> {
    if (!this.webhookSecret) {
      throw new Error("No webhook secret configured for this Stripe account");
    }
    const signature = headers.get("stripe-signature");
    if (!signature) throw new Error("Missing Stripe signature");
    const event = await this.stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      this.webhookSecret,
    );
    return this.normalizeStripeEvent(event);
  }

  normalizeStoredPayload(
    payload: unknown,
    _providerEventId: string,
  ): NormalizedEvent {
    void _providerEventId;
    return this.normalizeStripeEvent(payload as Stripe.Event);
  }

  private normalizeStripeEvent(event: Stripe.Event): NormalizedEvent {
    const base = { providerEventId: event.id, rawType: event.type };

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object;
        // Only genuinely paid sessions fulfill. Trials complete with
        // `no_payment_required` (their first real payment arrives later as an
        // `invoice.paid` and falls back to first-purchase fulfillment there);
        // async payment methods complete `unpaid` and fulfill via
        // `async_payment_succeeded`.
        if (s.payment_status !== "paid") {
          return { ...base, type: "ignored" };
        }
        return {
          ...base,
          type: "order.paid",
          providerCheckoutId: s.id,
          providerCustomerId: (s.customer as string) ?? undefined,
          providerSubscriptionId: readSubscriptionId(s.subscription),
          metadata: (s.metadata as Record<string, string>) ?? {},
        };
      }
      case "charge.refunded": {
        const c = event.data.object;
        // Fires for partial refunds too; `refunded` is true only when the
        // charge is fully refunded. Partial refunds intentionally don't claw
        // back credits - handle those manually via the wallet admin UI.
        if (!c.refunded) return { ...base, type: "ignored" };
        return {
          ...base,
          type: "order.refunded",
          providerCustomerId: (c.customer as string) ?? undefined,
          metadata: (c.metadata as Record<string, string>) ?? {},
        };
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        if (invoice.billing_reason !== "subscription_cycle") {
          return { ...base, type: "ignored" };
        }
        const details = invoice.parent?.subscription_details;
        return {
          ...base,
          type: "subscription.renewed",
          providerCustomerId:
            typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id,
          providerSubscriptionId: readSubscriptionId(details?.subscription),
          currentPeriodEnd: unixToDate(invoice.lines.data[0]?.period?.end),
          metadata:
            (details?.metadata as Record<string, string>) ??
            (invoice.metadata as Record<string, string>) ??
            {},
        };
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        return {
          ...base,
          type: "subscription.ended",
          providerCustomerId: (sub.customer as string) ?? undefined,
          providerSubscriptionId: sub.id,
          metadata: (sub.metadata as Record<string, string>) ?? {},
        };
      }
      default:
        return { ...base, type: "ignored" };
    }
  }

  async getPortalUrl(customerId: string, returnUrl: string) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }
}

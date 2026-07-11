import Stripe from "stripe";
import type {
  CreateCheckoutInput,
  CreatePriceInput,
  CreateProductInput,
  NormalizedEvent,
  PaymentProvider,
} from "../../contract";

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

  async validateCredentials() {
    try {
      // Product access is the minimum capability required for catalog sync.
      await this.stripe.products.list({ limit: 1 });
    } catch {
      throw new Error(
        "Stripe rejected this key or it cannot read products. Check the key and its catalog permissions.",
      );
    }
  }

  async createWebhook({ url }: { url: string }) {
    const endpoint = await this.stripe.webhookEndpoints.create({
      url,
      enabled_events: [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "invoice.paid",
        "charge.refunded",
        "customer.subscription.deleted",
      ],
      description: "vantezzen/pay fulfillment",
    });
    if (!endpoint.secret) throw new Error("Stripe did not return a webhook secret");
    return { webhookSecret: endpoint.secret };
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

  private async discountFromCode(discountCode: string) {
    const { data } = await this.stripe.promotionCodes.list({
      active: true,
      code: discountCode,
      limit: 1,
    });
    const promotionCode = data[0];
    if (!promotionCode) {
      throw new Error("Stripe promotion code not found");
    }
    return [{ promotion_code: promotionCode.id }];
  }

  async createCheckout(input: CreateCheckoutInput) {
    const discounts = input.discountCode
      ? await this.discountFromCode(input.discountCode)
      : undefined;
    const session = await this.stripe.checkout.sessions.create({
      mode: input.mode,
      line_items: [{ price: input.providerPriceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      ...(discounts
        ? { discounts }
        : input.allowPromotionCodes
          ? { allow_promotion_codes: true }
          : {}),
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
    return normalizeStripeEvent(event);
  }

  normalizeStoredPayload(
    payload: unknown,
    _providerEventId: string,
  ): NormalizedEvent {
    void _providerEventId;
    return normalizeStripeEvent(payload as Stripe.Event);
  }

  async getPortalUrl(customerId: string, returnUrl: string) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }
}

export async function verifyStripeWebhook(
  rawBody: string,
  headers: Headers,
  webhookSecret: string,
): Promise<NormalizedEvent> {
  const signature = headers.get("stripe-signature");
  if (!signature) throw new Error("Missing Stripe signature");
  const stripe = new Stripe("sk_test_webhook_verification_only");
  const event = await stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    webhookSecret,
  );
  return normalizeStripeEvent(event);
}

export function normalizeStripeEvent(event: Stripe.Event): NormalizedEvent {
  const base = { providerEventId: event.id, rawType: event.type };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.payment_status !== "paid") {
        return { ...base, type: "ignored" };
      }
      return {
        ...base,
        type: "order.paid",
        providerCheckoutId: s.id,
        providerCustomerId: (s.customer as string) ?? undefined,
        providerSubscriptionId: readSubscriptionId(s.subscription),
        customerEmail: s.customer_details?.email ?? s.customer_email ?? undefined,
        metadata: (s.metadata as Record<string, string>) ?? {},
      };
    }
    case "charge.refunded": {
      const c = event.data.object;
      if (!c.refunded) return { ...base, type: "ignored" };
      return {
        ...base,
        type: "order.refunded",
        providerCustomerId: (c.customer as string) ?? undefined,
        customerEmail: c.billing_details.email ?? undefined,
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
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id,
        providerSubscriptionId: readSubscriptionId(details?.subscription),
        customerEmail: invoice.customer_email ?? undefined,
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

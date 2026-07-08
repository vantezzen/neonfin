import "server-only";
import { Polar } from "@polar-sh/sdk";
import { validateEvent } from "@polar-sh/sdk/webhooks";
import type { PresentmentCurrency } from "@polar-sh/sdk/models/components/presentmentcurrency.js";
import type { SubscriptionRecurringInterval } from "@polar-sh/sdk/models/components/subscriptionrecurringinterval.js";
import type {
  CreateCheckoutInput,
  CreatePriceInput,
  NormalizedEvent,
  PaymentProvider,
} from "./types";

type PolarWebhookEvent = ReturnType<typeof validateEvent>;

function asCurrency(currency: string): PresentmentCurrency {
  return currency.toLowerCase() as PresentmentCurrency;
}

function asInterval(interval: "month" | "year"): SubscriptionRecurringInterval {
  return interval as SubscriptionRecurringInterval;
}

function stringMetadata(
  metadata: Record<string, string | number | boolean> | null | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).map(([key, value]) => [key, String(value)]),
  );
}

function header(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value) throw new Error(`Missing Polar ${name} header`);
  return value;
}

export class PolarProvider implements PaymentProvider {
  catalogMode = "price_product" as const;

  private polar: Polar;
  constructor(
    accessToken: string,
    private webhookSecret: string | null,
    environment: string,
  ) {
    this.polar = new Polar({
      accessToken,
      server: environment === "sandbox" ? "sandbox" : "production",
    });
  }

  async createPrice(input: CreatePriceInput) {
    const fixedPrice = {
      amountType: "fixed" as const,
      priceAmount: input.amountCents,
      priceCurrency: asCurrency(input.currency),
    };

    const shared = {
      name: input.productName,
      description: input.productDescription ?? null,
      prices: [fixedPrice],
    };
    const product = await this.polar.products.create(
      input.interval === "one_time"
        ? { ...shared, recurringInterval: null }
        : {
            ...shared,
            recurringInterval: asInterval(input.interval),
            recurringIntervalCount: 1,
          },
    );

    return {
      // Polar checkouts select products, not standalone price ids. Because this
      // adapter creates one Polar product per vantezzen/pay price, the product id is
      // the durable checkout reference stored in `prices.providerPriceId`.
      providerPriceId: product.id,
      providerProductId: product.id,
    };
  }

  async createCheckout(input: CreateCheckoutInput) {
    const checkout = await this.polar.checkouts.create({
      products: [input.providerPriceId],
      successUrl: input.successUrl,
      returnUrl: input.cancelUrl,
      customerEmail: input.customerEmail ?? null,
      metadata: input.metadata,
      allowDiscountCodes: false,
      requireBillingAddress: false,
      allowTrial: true,
      isBusinessCustomer: false,
    });
    return { url: checkout.url, checkoutId: checkout.id };
  }

  async verifyAndNormalize(
    rawBody: string,
    headers: Headers,
  ): Promise<NormalizedEvent> {
    if (!this.webhookSecret) {
      throw new Error("No webhook secret configured for this Polar account");
    }
    const event = validateEvent(
      rawBody,
      Object.fromEntries(headers.entries()),
      this.webhookSecret,
    );
    return this.normalizePolarEvent(event, header(headers, "webhook-id"));
  }

  normalizeStoredPayload(
    payload: unknown,
    providerEventId: string,
  ): NormalizedEvent {
    return this.normalizePolarEvent(payload as PolarWebhookEvent, providerEventId);
  }

  private normalizePolarEvent(
    event: PolarWebhookEvent,
    providerEventId: string,
  ): NormalizedEvent {
    const base = { providerEventId, rawType: event.type };

    switch (event.type) {
      case "order.paid":
        return {
          ...base,
          type:
            event.data.billingReason === "subscription_cycle"
              ? "subscription.renewed"
              : "order.paid",
          providerCheckoutId: event.data.checkoutId ?? undefined,
          providerCustomerId: event.data.customerId,
          providerSubscriptionId: event.data.subscriptionId ?? undefined,
          currentPeriodEnd: event.data.subscription?.currentPeriodEnd ?? undefined,
          metadata: stringMetadata(event.data.metadata),
        };
      case "order.refunded":
        return {
          ...base,
          type: "order.refunded",
          providerCheckoutId: event.data.checkoutId ?? undefined,
          providerCustomerId: event.data.customerId,
          providerSubscriptionId: event.data.subscriptionId ?? undefined,
          metadata: stringMetadata(event.data.metadata),
        };
      // A scheduled cancellation - access continues until the period ends, so
      // don't end it yet. Polar sends `subscription.revoked` at the real end.
      case "subscription.canceled":
        return { ...base, type: "ignored" };
      case "subscription.revoked":
        return {
          ...base,
          type: "subscription.ended",
          providerCustomerId: event.data.customerId,
          providerSubscriptionId: event.data.id,
          currentPeriodEnd: event.data.currentPeriodEnd ?? undefined,
          metadata: stringMetadata(event.data.metadata),
        };
      default:
        return { ...base, type: "ignored" };
    }
  }

  async getPortalUrl(customerId: string, returnUrl: string) {
    const session = await this.polar.customerSessions.create({
      customerId,
      returnUrl,
    });
    return session.customerPortalUrl;
  }
}

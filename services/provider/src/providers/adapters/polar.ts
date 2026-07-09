import { Polar } from "@polar-sh/sdk";
import type { PresentmentCurrency } from "@polar-sh/sdk/models/components/presentmentcurrency.js";
import type { SubscriptionRecurringInterval } from "@polar-sh/sdk/models/components/subscriptionrecurringinterval.js";
import { validateEvent } from "@polar-sh/sdk/webhooks";
import type {
  CreateCheckoutInput,
  CreatePriceInput,
  NormalizedEvent,
  PaymentProvider,
} from "../../contract";

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

function withDiscountCode(checkoutUrl: string, discountCode: string): string {
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set("discount_code", discountCode);
    return url.toString();
  } catch {
    const separator = checkoutUrl.includes("?") ? "&" : "?";
    return `${checkoutUrl}${separator}discount_code=${encodeURIComponent(
      discountCode,
    )}`;
  }
}

function customerEmail(
  customer: { email?: string | null } | null | undefined,
): string | undefined {
  return customer?.email ?? undefined;
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
      allowDiscountCodes:
        input.allowPromotionCodes === true || Boolean(input.discountCode),
      requireBillingAddress: false,
      allowTrial: true,
      isBusinessCustomer: false,
    });
    return {
      url: input.discountCode
        ? withDiscountCode(checkout.url, input.discountCode)
        : checkout.url,
      checkoutId: checkout.id,
    };
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
    return normalizePolarEvent(event, header(headers, "webhook-id"));
  }

  normalizeStoredPayload(
    payload: unknown,
    providerEventId: string,
  ): NormalizedEvent {
    return normalizePolarEvent(payload as PolarWebhookEvent, providerEventId);
  }

  async getPortalUrl(customerId: string, returnUrl: string) {
    const session = await this.polar.customerSessions.create({
      customerId,
      returnUrl,
    });
    return session.customerPortalUrl;
  }
}

export function verifyPolarWebhook(
  rawBody: string,
  headers: Headers,
  webhookSecret: string,
): NormalizedEvent {
  const event = validateEvent(
    rawBody,
    Object.fromEntries(headers.entries()),
    webhookSecret,
  );
  return normalizePolarEvent(event, header(headers, "webhook-id"));
}

export function normalizePolarEvent(
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
        customerEmail: customerEmail(event.data.customer),
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
        customerEmail: customerEmail(event.data.customer),
        metadata: stringMetadata(event.data.metadata),
      };
    case "subscription.canceled":
      return { ...base, type: "ignored" };
    case "subscription.revoked":
      return {
        ...base,
        type: "subscription.ended",
        providerCustomerId: event.data.customerId,
        providerSubscriptionId: event.data.id,
        customerEmail: customerEmail(event.data.customer),
        currentPeriodEnd: event.data.currentPeriodEnd ?? undefined,
        metadata: stringMetadata(event.data.metadata),
      };
    default:
      return { ...base, type: "ignored" };
  }
}

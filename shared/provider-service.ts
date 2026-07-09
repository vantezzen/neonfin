export type ProviderName = "stripe" | "polar";
export type CatalogMode = "shared_product" | "price_product";
export type PriceInterval = "one_time" | "month" | "year";

export type NormalizedEventType =
  | "order.paid"
  | "order.refunded"
  | "subscription.renewed"
  | "subscription.ended"
  | "ignored";

export interface NormalizedEvent {
  type: NormalizedEventType;
  providerEventId: string;
  rawType: string;
  providerCheckoutId?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  customerEmail?: string;
  currentPeriodEnd?: Date;
  metadata?: Record<string, string>;
}

export type NormalizedEventWire = Omit<NormalizedEvent, "currentPeriodEnd"> & {
  currentPeriodEnd?: string;
};

export function eventToWire(event: NormalizedEvent): NormalizedEventWire {
  const { currentPeriodEnd, ...rest } = event;
  return {
    ...rest,
    ...(currentPeriodEnd
      ? { currentPeriodEnd: currentPeriodEnd.toISOString() }
      : {}),
  };
}

export function eventFromWire(event: NormalizedEventWire): NormalizedEvent {
  const { currentPeriodEnd, ...rest } = event;
  return {
    ...rest,
    ...(currentPeriodEnd ? { currentPeriodEnd: new Date(currentPeriodEnd) } : {}),
  };
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
  allowPromotionCodes?: boolean;
  discountCode?: string;
}

export interface PaymentProvider {
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
  verifyAndNormalize(
    rawBody: string,
    headers: Headers,
  ): Promise<NormalizedEvent>;
  normalizeStoredPayload(
    payload: unknown,
    providerEventId: string,
  ): NormalizedEvent;
  getPortalUrl(customerId: string, returnUrl: string): Promise<string>;
}

export type ProviderServiceRequest =
  | {
      op: "create-provider-account";
      ownerId: string;
      provider: ProviderName;
      label: string;
      environment: string;
      secretKey: string;
    }
  | { op: "save-webhook-secret"; accountId: string; webhookSecret: string }
  | {
      op: "update-provider-account";
      accountId: string;
      label: string;
      environment: string;
      secretKey?: string;
      webhookSecret?: string;
    }
  | { op: "delete-provider-account"; accountId: string }
  | {
      op: "create-product";
      accountId: string;
      input: CreateProductInput;
    }
  | { op: "create-price"; accountId: string; input: CreatePriceInput }
  | {
      op: "create-checkout";
      accountId: string;
      input: CreateCheckoutInput;
    }
  | {
      op: "get-portal-url";
      accountId: string;
      customerId: string;
      returnUrl: string;
    }
  | {
      op: "verify-webhook";
      accountId: string;
      provider: ProviderName;
      rawBody: string;
      headers: Record<string, string>;
    }
  | {
      op: "normalize-webhook";
      provider: ProviderName;
      payload: unknown;
      providerEventId: string;
    };

export type ProviderServiceData<T extends ProviderServiceRequest["op"]> =
  T extends "create-provider-account"
    ? { id: string }
    : T extends "create-product"
      ? { providerProductId: string }
      : T extends "create-price"
        ? { providerPriceId: string; providerProductId?: string }
        : T extends "create-checkout"
          ? { url: string; checkoutId: string }
          : T extends "get-portal-url"
            ? { url: string }
            : T extends "verify-webhook" | "normalize-webhook"
              ? { event: NormalizedEventWire }
              : { ok: true };

export type ProviderServiceResponse<T extends ProviderServiceRequest["op"]> =
  | { ok: true; data: ProviderServiceData<T> }
  | { ok: false; error: string };

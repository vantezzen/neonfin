/**
 * vantezzen/pay server client - a tiny, zero-dependency wrapper around vantezzen/pay's
 * server-only API (`/api/v1`) for apps that already have their own user
 * accounts ("external auth"). It uses your SECRET key (`pay_sk_…`).
 *
 * Run this ONLY on the server (route handlers, server actions, background
 * jobs). Never import it into browser code or expose `pay_sk_…` to the client -
 * for the browser use the publishable-key client (`pay-client`) instead.
 *
 * Docs: https://pay.vantezzen.io/docs/concepts/external-auth
 */

export type PayServerClientConfig = {
  /** Base URL of your vantezzen/pay deployment, e.g. `https://pay.vantezzen.io`. */
  baseUrl: string;
  /** Secret API key (`pay_sk_…`). Server-only - never send it to the browser. */
  secretKey: string;
  /** Maximum time to wait for an API request. Defaults to 15 seconds. */
  requestTimeoutMs?: number;
};

export { PayError, type PayErrorOptions } from "./error";
import { PayError } from "./error";

export type Balance = {
  productId: string;
  productName: string;
  creditUnit: string;
  balance: number;
  freeGrantResetAt: string | null;
};

export type Subscription = {
  productId: string;
  priceId: string | null;
  label: string | null;
  status: "active" | "canceled";
  currentPeriodEnd: string | null;
};

export type ExternalWallet = {
  walletId: string;
  externalUserId: string;
  balances: Balance[];
  features: string[];
  subscriptions: Subscription[];
};

export type GrantResult = { balance: number; applied: boolean };

export type FeatureResult = { features: string[] };

export type DeductResult = { balance: number; deducted: boolean };

export type CheckoutResult = {
  url: string;
  checkoutId: string;
  orderId: string;
};

export type ProductPrice = {
  id: string;
  label: string | null;
  amountCents: number;
  currency: string;
  creditsGranted: number;
  features: string[];
  interval: "one_time" | "month" | "year";
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  type: "credits" | "subscription" | "one_time";
  creditUnit: string;
  freeGrant: { credits: number; period: "monthly" | "once" } | null;
  prices: ProductPrice[];
};

export type OrderStatus = {
  id: string;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  code: string | null;
  balance: number | null;
  amountCents: number;
  currency: string;
  productId: string | null;
  priceId: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type OrderPage = {
  orders: Array<Omit<OrderStatus, "code" | "balance">>;
  nextCursor: string | null;
};

export type PayIdentity = {
  projectId: string;
  project: string;
  mode: "credit_codes" | "external_auth";
  keyKind: "publishable" | "secret";
};

export type DeductInput = {
  /** The wallet's owner, keyed by your own user id. */
  externalUserId: string;
  /** Product to deduct from. Optional when the project has a single product. */
  productId?: string;
  /** Number of credits to deduct. */
  amount: number;
  /**
   * Stable key so retries of the same logical deduction charge exactly once.
   * Use a job/request id, not a random value.
   */
  idempotencyKey: string;
  /** Optional metadata stored on the ledger entry. */
  meta?: Record<string, unknown>;
};

export type CheckoutInput = {
  /** Credit the purchase to this user's wallet (created if needed). */
  externalUserId: string;
  /** Where the provider redirects after payment. */
  successUrl?: string;
  cancelUrl?: string;
  /** Pre-fill the checkout email. */
  customerEmail?: string;
  /** Let customers enter a provider promotion/discount code at checkout. */
  allowPromotionCodes?: boolean;
  /** Apply or prefill a provider promotion/discount code for this checkout. */
  discountCode?: string;
  /** Stable key for safely retrying checkout creation after a network failure. */
  idempotencyKey?: string;
};

export type PortalInput = {
  /** Where the provider returns after billing management. */
  returnUrl?: string;
};

export type GrantInput = {
  /** Target the wallet by your own user id (external auth). */
  externalUserId?: string;
  /** Or target an anonymous wallet by its recovery code. */
  code?: string;
  /** Product to credit. Optional when the project has a single product. */
  productId?: string;
  /** Number of credits to grant. */
  amount: number;
  /** Stable key so retries of the same logical grant apply exactly once. */
  idempotencyKey?: string;
  /** Optional metadata stored on the ledger entry. */
  meta?: Record<string, unknown>;
};

export type PayServerClient = ReturnType<typeof createPayServerClient>;

export function createPayServerClient(config: PayServerClientConfig) {
  const configuredBaseUrl = config.baseUrl?.trim();
  if (!configuredBaseUrl) {
    throw new Error("[pay] baseUrl is missing. Set your vantezzen/pay URL.");
  }
  let baseUrl: string;
  try {
    const url = new URL(configuredBaseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
    baseUrl = url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(
      "[pay] baseUrl must be an absolute http(s) URL, for example https://pay.example.com.",
    );
  }
  const requestTimeoutMs =
    Number.isFinite(config.requestTimeoutMs) && config.requestTimeoutMs! >= 1_000
      ? config.requestTimeoutMs!
      : 15_000;

  async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function request<T>(
    path: string,
    body?: unknown,
    method: "GET" | "POST" = "POST",
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${baseUrl}/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new PayError(0, "Could not reach vantezzen/pay. Check your connection and try again.", {
        code: "network_error",
      });
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data ?? {}) as {
        error?: string;
        code?: string;
        balance?: number;
        requested?: number;
        requestId?: string;
      };
      throw new PayError(
        res.status,
        err.error ?? `Request failed (${res.status})`,
        {
          code: err.code,
          balance: err.balance,
          requested: err.requested,
          requestId: err.requestId,
        },
      );
    }
    return data as T;
  }

  /**
   * Get or create the wallet tied to your own user id. Idempotent by
   * `externalUserId` - safe to call on every login or billing page load.
   */
  async function getOrCreateWallet(
    externalUserId: string,
  ): Promise<ExternalWallet> {
    return request<ExternalWallet>("/wallets/external", { externalUserId });
  }

  /** Read an existing wallet without creating one. Returns null when absent. */
  async function getWallet(
    externalUserId: string,
  ): Promise<ExternalWallet | null> {
    try {
      return await request<ExternalWallet>(
        `/wallets/external?externalUserId=${encodeURIComponent(externalUserId)}`,
        undefined,
        "GET",
      );
    } catch (error) {
      if (error instanceof PayError && error.code === "wallet_not_found") {
        return null;
      }
      throw error;
    }
  }

  /** List the project's active product catalog and purchasable prices. */
  async function getProducts(): Promise<Product[]> {
    const { products } = await request<{ products: Product[] }>(
      "/products",
      undefined,
      "GET",
    );
    return products;
  }

  /** Read one order by its vantezzen/pay or provider checkout id. */
  async function getOrder(ref: string): Promise<OrderStatus> {
    return request<OrderStatus>(
      `/orders/${encodeURIComponent(ref)}`,
      undefined,
      "GET",
    );
  }

  /** List recent project orders using the API's opaque cursor. */
  async function listOrders(
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<OrderPage> {
    const params = new URLSearchParams();
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.limit) params.set("limit", String(opts.limit));
    const query = params.size ? `?${params}` : "";
    return request<OrderPage>(`/orders${query}`, undefined, "GET");
  }

  /** Inspect the project and key mode configured for this server client. */
  async function getMe(): Promise<PayIdentity> {
    return request<PayIdentity>("/me", undefined, "GET");
  }

  /**
   * Grant credits to an external user (or an anonymous recovery code). Pass a
   * stable `idempotencyKey` so retries never double-grant.
   */
  async function grantCredits(input: GrantInput): Promise<GrantResult> {
    return request<GrantResult>("/credit", input);
  }

  /**
   * Deduct credits from an external user's wallet when they run paid work.
   * Throws `PayError` with `isInsufficientCredits` when the balance is too
   * low. The required `idempotencyKey` makes retries charge exactly once.
   */
  async function deduct(input: DeductInput): Promise<DeductResult> {
    return request<DeductResult>("/wallets/external/deduct", input);
  }

  /**
   * Start a provider checkout that credits the external user's wallet when
   * paid. Redirect the user to the returned `url`; poll `orderId` via the
   * public API or wait for your success page if you need confirmation.
   */
  async function createCheckout(
    priceId: string,
    input: CheckoutInput,
  ): Promise<CheckoutResult> {
    return request<CheckoutResult>("/checkout", { priceId, ...input });
  }

  /**
   * Create a provider portal URL for an external-auth user. Use this for
   * managing subscriptions, payment methods, and invoices.
   */
  async function createPortalUrl(
    externalUserId: string,
    input: PortalInput = {},
  ): Promise<string> {
    const { url } = await request<{ url: string }>("/wallets/external/portal", {
      externalUserId,
      ...input,
    });
    return url;
  }

  /**
   * Manually grant a feature to a user (comps, support, promos). Idempotent.
   * Returns the wallet's full feature list after the change.
   */
  async function grantFeature(
    externalUserId: string,
    feature: string,
  ): Promise<FeatureResult> {
    return request<FeatureResult>("/features", {
      externalUserId,
      feature,
      action: "grant",
    });
  }

  /**
   * Revoke a MANUAL feature grant. Access from an active subscription or a
   * one-time purchase is derived and cannot be revoked here.
   */
  async function revokeFeature(
    externalUserId: string,
    feature: string,
  ): Promise<FeatureResult> {
    return request<FeatureResult>("/features", {
      externalUserId,
      feature,
      action: "revoke",
    });
  }

  /** Whether a user's wallet currently has a feature unlocked. */
  async function hasFeature(
    externalUserId: string,
    feature: string,
  ): Promise<boolean> {
    const { features } = await getOrCreateWallet(externalUserId);
    return features.includes(feature);
  }

  return {
    baseUrl,
    getOrCreateWallet,
    getWallet,
    getProducts,
    getOrder,
    listOrders,
    getMe,
    grantCredits,
    deduct,
    createCheckout,
    createPortalUrl,
    grantFeature,
    revokeFeature,
    hasFeature,
  };
}

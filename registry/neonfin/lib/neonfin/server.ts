/**
 * neonFin server client - a tiny, zero-dependency wrapper around neonFin's
 * server-only API (`/api/v1`) for apps that already have their own user
 * accounts ("external auth"). It uses your SECRET key (`nf_sk_…`).
 *
 * Run this ONLY on the server (route handlers, server actions, background
 * jobs). Never import it into browser code or expose `nf_sk_…` to the client -
 * for the browser use the publishable-key client (`neonfin-client`) instead.
 *
 * Docs: https://pay.vantezzen.io/docs/concepts/external-auth
 */

export type NeonfinServerConfig = {
  /** Base URL of your neonFin deployment, e.g. `https://pay.vantezzen.io`. */
  baseUrl: string;
  /** Secret API key (`nf_sk_…`). Server-only - never send it to the browser. */
  secretKey: string;
};

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

/**
 * Error thrown for any non-2xx API response. Carries the HTTP status and the
 * API's stable machine-readable `code` - branch on those, not the message.
 */
export class NeonfinError extends Error {
  readonly status: number;
  /** Stable error code from the API, e.g. `"wallet_not_found"`. */
  readonly code?: string;
  /** Present on 402 (insufficient credits): the current wallet balance. */
  readonly balance?: number;
  /** Present on 402: the amount that was requested. */
  readonly requested?: number;

  constructor(
    status: number,
    message: string,
    opts: { code?: string; balance?: number; requested?: number } = {},
  ) {
    super(message);
    this.name = "NeonfinError";
    this.status = status;
    this.code = opts.code;
    this.balance = opts.balance;
    this.requested = opts.requested;
  }

  /** True when the wallet doesn't have enough credits. */
  get isInsufficientCredits(): boolean {
    return this.status === 402;
  }
}

export type NeonfinServer = ReturnType<typeof createNeonfinServer>;

export function createNeonfinServer(config: NeonfinServerConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data ?? {}) as {
        error?: string;
        code?: string;
        balance?: number;
        requested?: number;
      };
      throw new NeonfinError(
        res.status,
        err.error ?? `Request failed (${res.status})`,
        { code: err.code, balance: err.balance, requested: err.requested },
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

  /**
   * Grant credits to an external user (or an anonymous recovery code). Pass a
   * stable `idempotencyKey` so retries never double-grant.
   */
  async function grantCredits(input: GrantInput): Promise<GrantResult> {
    return request<GrantResult>("/credit", input);
  }

  /**
   * Deduct credits from an external user's wallet when they run paid work.
   * Throws `NeonfinError` with `isInsufficientCredits` when the balance is too
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
    grantCredits,
    deduct,
    createCheckout,
    grantFeature,
    revokeFeature,
    hasFeature,
  };
}

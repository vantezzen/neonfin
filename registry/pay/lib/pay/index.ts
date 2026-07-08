/**
 * vantezzen/pay client - a tiny, zero-dependency wrapper around the vantezzen/pay public
 * API (`/api/v1`). It handles credit-code storage (localStorage) so anonymous
 * users keep their balance across visits, and exposes typed helpers for reading
 * products, checking/deducting credits, and starting checkouts.
 *
 * Everything here is safe to run in the browser: only the *publishable* key
 * (`pay_pk_…`) is used. Never put a secret key (`pay_sk_…`) in client code.
 *
 * Docs: https://pay.vantezzen.io/docs
 */

export type PayClientConfig = {
  /** Base URL of your vantezzen/pay deployment, e.g. `https://pay.vantezzen.io`. */
  baseUrl: string;
  /** Publishable API key (`pay_pk_…`). Browser-safe. */
  publishableKey: string;
  /** localStorage key used to persist the credit code. */
  storageKey?: string;
};

export type FreeGrant = { credits: number; period: "monthly" | "once" } | null;

export type PriceInterval = "one_time" | "month" | "year";

export type Price = {
  id: string;
  /** Tier name for subscription prices, e.g. "Basic" / "Pro". */
  label: string | null;
  amountCents: number;
  currency: string;
  /** Credits granted on purchase / included each cycle (0 = none). */
  creditsGranted: number;
  /** Feature slugs this offer unlocks. */
  features: string[];
  interval: PriceInterval;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  type: "credits" | "subscription" | "one_time";
  creditUnit: string;
  freeGrant: FreeGrant;
  prices: Price[];
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
  /** Tier label of the subscribed price, if set. */
  label: string | null;
  status: "active" | "canceled";
  /** ISO timestamp the current paid period ends, if known. */
  currentPeriodEnd: string | null;
};

/** A wallet's full state: balances, unlocked features, active subscriptions. */
export type WalletInfo = {
  code: string;
  balances: Balance[];
  features: string[];
  subscriptions: Subscription[];
};

export type DeductResult = { balance: number; deducted: boolean };

export type CheckoutResult = {
  url: string;
  checkoutId: string;
  orderId: string;
};

export type CheckoutFlow = "auto" | "popup" | "redirect";

export type StartCheckoutOptions = {
  code?: string;
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  /**
   * `auto` opens checkout in a popup on desktop and redirects on touch/mobile.
   * Use `redirect` when your app cannot support popups.
   */
  flow?: CheckoutFlow;
};

export type OrderStatus = {
  id: string;
  status: "pending" | "paid" | "failed" | "refunded";
  code: string | null;
  balance: number | null;
};

/**
 * Error thrown for any non-2xx API response. Carries the HTTP status and the
 * API's stable machine-readable `code` (e.g. `"insufficient_credits"`,
 * `"wallet_expired"`) - branch on those, not on the message text.
 */
export class PayError extends Error {
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
    this.name = "PayError";
    this.status = status;
    this.code = opts.code;
    this.balance = opts.balance;
    this.requested = opts.requested;
  }

  /** True when the wallet doesn't have enough credits - show purchase UI. */
  get isInsufficientCredits(): boolean {
    return this.status === 402;
  }
}

const DEFAULT_STORAGE_KEY = "pay_code";
export const PENDING_ORDER_KEY = "pay_pending_order";
const POPUP_POLL_MS = 1500;

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function randomKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function checkoutError(code: string, message: string): PayError {
  return new PayError(0, message, { code });
}

function shouldUseRedirect(flow: CheckoutFlow): boolean {
  if (flow === "redirect") return true;
  if (flow === "popup") return false;
  if (typeof window === "undefined") return true;
  const ua = window.navigator.userAgent;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia?.(
    "(hover: none), (pointer: coarse)",
  )?.matches;
  return mobileUA || coarsePointer || window.innerWidth < 768;
}

function popupFeatures(): string {
  if (typeof window === "undefined") return "";
  const width = Math.min(520, window.outerWidth || 520);
  const height = Math.min(760, window.outerHeight || 760);
  const left =
    (window.screenX || 0) + Math.max(0, ((window.outerWidth || width) - width) / 2);
  const top =
    (window.screenY || 0) +
    Math.max(0, ((window.outerHeight || height) - height) / 2);
  return [
    "popup=yes",
    `width=${Math.round(width)}`,
    `height=${Math.round(height)}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
}

function openCheckoutPopup(): Window | null {
  if (typeof window === "undefined") return null;
  const popup = window.open("", "pay_checkout", popupFeatures());
  if (!popup) return null;

  try {
    popup.document.title = "Opening checkout";
    popup.document.body.style.cssText =
      "margin:0;min-height:100vh;display:grid;place-items:center;font:14px system-ui,sans-serif;color:#52525b;background:#fafafa";
    popup.document.body.textContent = "Opening secure checkout...";
  } catch {
    // Some browsers restrict writing even to the blank popup. Navigation below
    // still works, so this is only cosmetic.
  }
  popup.focus();
  return popup;
}

type CheckoutPopupMessage = {
  source?: unknown;
  type?: unknown;
  orderId?: unknown;
};

export type PayClient = ReturnType<typeof createPayClient>;

export function createPayClient(config: PayClientConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY;
  // Namespaced by storageKey so two projects on one origin don't clash.
  const pendingOrderKey =
    storageKey === DEFAULT_STORAGE_KEY
      ? PENDING_ORDER_KEY
      : `${storageKey}_pending_order`;
  const baseOrigin = new URL(baseUrl).origin;

  async function request<T>(
    path: string,
    init?: Omit<RequestInit, "body"> & { body?: unknown },
  ): Promise<T> {
    const { body, ...rest } = init ?? {};
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${config.publishableKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...rest.headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data ?? {}) as {
        error?: string;
        code?: string;
        balance?: number;
        requested?: number;
      };
      throw new PayError(
        res.status,
        err.error ?? `Request failed (${res.status})`,
        { code: err.code, balance: err.balance, requested: err.requested },
      );
    }
    return data as T;
  }

  // --- credit-code storage -------------------------------------------------

  /** The credit code stored in this browser, or null. */
  function getCode(): string | null {
    if (!hasStorage()) return null;
    return window.localStorage.getItem(storageKey);
  }

  /** Persist a credit code (e.g. after the user restores one). */
  function setCode(code: string): void {
    if (hasStorage()) window.localStorage.setItem(storageKey, code);
  }

  /** Forget the stored credit code. The next call mints a fresh wallet. */
  function clearCode(): void {
    if (hasStorage()) window.localStorage.removeItem(storageKey);
  }

  function shouldRecoverStoredCode(
    err: unknown,
    explicitCode: boolean,
  ): boolean {
    return (
      !explicitCode &&
      err instanceof PayError &&
      (err.status === 404 || err.status === 410)
    );
  }

  /**
   * Return the stored credit code, creating a fresh wallet (with its free
   * grant) if there isn't one yet. This is the anonymous "identity".
   * Concurrent callers (e.g. several components mounting at once, or React
   * StrictMode double-effects) share one in-flight creation instead of each
   * minting their own wallet.
   */
  let pendingCreate: Promise<string> | null = null;
  async function getOrCreateCode(): Promise<string> {
    const existing = getCode();
    if (existing) return existing;
    if (!pendingCreate) {
      pendingCreate = (async () => {
        const { code } = await request<WalletInfo>("/wallets", {
          method: "POST",
          body: {},
        });
        setCode(code);
        return code;
      })().finally(() => {
        pendingCreate = null;
      });
    }
    return pendingCreate;
  }

  // --- catalog & wallet ----------------------------------------------------

  /** The project's product catalog with purchasable prices. */
  async function getProducts(): Promise<Product[]> {
    const { products } = await request<{ products: Product[] }>("/products");
    return products;
  }

  /**
   * A wallet's full state (balances + features + subscriptions). Defaults to
   * this browser's code, creating one if needed. Recovers automatically if the
   * stored code was expired or deleted server-side.
   */
  async function getWallet(code?: string): Promise<WalletInfo> {
    const explicitCode = code !== undefined;
    const c = code ?? (await getOrCreateCode());
    try {
      return await request<WalletInfo>(`/wallets/${encodeURIComponent(c)}`);
    } catch (err) {
      if (!shouldRecoverStoredCode(err, explicitCode)) throw err;
      clearCode();
      return getWallet();
    }
  }

  /** All per-product balances for a wallet (see {@link getWallet}). */
  async function getBalances(code?: string): Promise<Balance[]> {
    return (await getWallet(code)).balances;
  }

  /** The feature slugs a wallet has unlocked. */
  async function getFeatures(code?: string): Promise<string[]> {
    return (await getWallet(code)).features;
  }

  /** Whether a wallet has unlocked a given feature. */
  async function hasFeature(feature: string, code?: string): Promise<boolean> {
    return (await getFeatures(code)).includes(feature);
  }

  /**
   * A single product's balance. When `productId` is omitted, returns the sole
   * product's balance (or the first, for multi-product projects).
   */
  async function getBalance(
    productId?: string,
    code?: string,
  ): Promise<Balance | null> {
    const balances = await getBalances(code);
    if (balances.length === 0) return null;
    if (!productId) return balances[0];
    return balances.find((b) => b.productId === productId) ?? null;
  }

  /** Whether the wallet has at least `amount` credits for a product. */
  async function hasCredits(
    amount: number,
    opts: { productId?: string; code?: string } = {},
  ): Promise<boolean> {
    const b = await getBalance(opts.productId, opts.code);
    return !!b && b.balance >= amount;
  }

  /**
   * Deduct `amount` credits. Idempotent: pass a stable `idempotencyKey` to make
   * retries safe (one is generated otherwise). Throws `PayError` with
   * status 402 when the balance is insufficient.
   */
  async function deduct(
    amount: number,
    opts: {
      productId?: string;
      idempotencyKey?: string;
      code?: string;
      meta?: Record<string, unknown>;
    } = {},
  ): Promise<DeductResult> {
    const explicitCode = opts.code !== undefined;
    const code = opts.code ?? (await getOrCreateCode());
    try {
      return await request<DeductResult>(
        `/wallets/${encodeURIComponent(code)}/deduct`,
        {
          method: "POST",
          body: {
            amount,
            idempotencyKey: opts.idempotencyKey ?? randomKey(),
            ...(opts.productId ? { productId: opts.productId } : {}),
            ...(opts.meta ? { meta: opts.meta } : {}),
          },
        },
      );
    } catch (err) {
      if (!shouldRecoverStoredCode(err, explicitCode)) throw err;
      clearCode();
      return deduct(amount, opts);
    }
  }

  async function checkoutWithCode(
    priceId: string,
    code: string,
    opts: {
      successUrl?: string;
      cancelUrl?: string;
      customerEmail?: string;
    },
  ): Promise<CheckoutResult> {
    return request<CheckoutResult>("/checkout", {
      method: "POST",
      body: {
        priceId,
        code,
        ...(opts.successUrl ? { successUrl: opts.successUrl } : {}),
        ...(opts.cancelUrl ? { cancelUrl: opts.cancelUrl } : {}),
        ...(opts.customerEmail ? { customerEmail: opts.customerEmail } : {}),
      },
    });
  }

  function rememberPendingOrder(orderId: string): void {
    if (hasStorage()) window.localStorage.setItem(pendingOrderKey, orderId);
  }

  function forgetPendingOrder(orderId: string): void {
    if (!hasStorage()) return;
    if (window.localStorage.getItem(pendingOrderKey) === orderId) {
      window.localStorage.removeItem(pendingOrderKey);
    }
  }

  async function waitForPopupCheckout(
    result: CheckoutResult,
    popup: Window,
  ): Promise<OrderStatus> {
    return new Promise((resolve, reject) => {
      let active = true;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      let closeTimer: ReturnType<typeof setInterval> | null = null;

      function cleanup() {
        active = false;
        if (pollTimer) clearTimeout(pollTimer);
        if (closeTimer) clearInterval(closeTimer);
        window.removeEventListener("message", onMessage);
      }

      function finish(order: OrderStatus) {
        cleanup();
        forgetPendingOrder(result.orderId);
        if (order.code) setCode(order.code);
        if (!popup.closed) popup.close();
        resolve(order);
      }

      function fail(error: unknown, closePopup = false) {
        cleanup();
        if (closePopup && !popup.closed) popup.close();
        reject(error);
      }

      async function poll() {
        if (!active) return;
        try {
          const order = await getOrder(result.orderId);
          if (order.status === "paid" && order.code) {
            finish(order);
            return;
          }
          if (order.status === "failed" || order.status === "refunded") {
            forgetPendingOrder(result.orderId);
            fail(
              checkoutError(
                `checkout_${order.status}`,
                `Checkout ${order.status}.`,
              ),
              true,
            );
            return;
          }
        } catch {
          // Transient network/API errors should not strand an in-progress
          // checkout. Keep polling while the popup remains open.
        }
        pollTimer = setTimeout(poll, POPUP_POLL_MS);
      }

      async function handleClosedPopup() {
        try {
          const order = await getOrder(result.orderId);
          if (order.status === "paid" && order.code) {
            finish(order);
            return;
          }
        } catch {
          // If the last status check fails after the user closes the popup,
          // report the close. A later redirect-resume can still recover.
        }
        fail(
          checkoutError(
            "checkout_closed",
            "Checkout window closed before payment completed.",
          ),
        );
      }

      function onMessage(event: MessageEvent<CheckoutPopupMessage>) {
        if (event.origin !== baseOrigin) return;
        const data = event.data;
        if (data?.source !== "pay") return;

        const matchesOrder = data.orderId === result.orderId;
        if (data.type === "checkout_paid" && matchesOrder) {
          void poll();
        }
        if (
          data.type === "checkout_cancelled" &&
          (data.orderId === undefined || matchesOrder)
        ) {
          forgetPendingOrder(result.orderId);
          fail(checkoutError("checkout_cancelled", "Checkout was cancelled."));
        }
      }

      window.addEventListener("message", onMessage);
      closeTimer = setInterval(() => {
        if (popup.closed) void handleClosedPopup();
      }, 500);
      void poll();
    });
  }

  // --- checkout ------------------------------------------------------------

  /**
   * Start a checkout for a price. Defaults to topping up this browser's wallet
   * (so a purchase adds to the existing balance). Returns the provider checkout
   * URL to redirect to.
   */
  async function createCheckout(
    priceId: string,
    opts: {
      code?: string;
      successUrl?: string;
      cancelUrl?: string;
      customerEmail?: string;
    } = {},
  ): Promise<CheckoutResult> {
    const explicitCode = opts.code !== undefined;
    const code = opts.code ?? (await getOrCreateCode());
    try {
      return await checkoutWithCode(priceId, code, opts);
    } catch (err) {
      if (!shouldRecoverStoredCode(err, explicitCode)) throw err;
      clearCode();
      return createCheckout(priceId, opts);
    }
  }

  /**
   * The one-call checkout for custom UI: creates the session, remembers the
   * order, and uses popup checkout on desktop or redirect checkout on mobile.
   * Browser-only - use `createCheckout` for manual control.
   */
  async function startCheckout(
    priceId: string,
    opts: StartCheckoutOptions = {},
  ): Promise<CheckoutResult> {
    const { flow = "auto", ...checkoutOpts } = opts;
    const redirect = shouldUseRedirect(flow);

    if (!redirect) {
      const popup = openCheckoutPopup();
      if (!popup) {
        if (flow === "popup") {
          throw checkoutError(
            "popup_blocked",
            "Checkout popup was blocked by the browser.",
          );
        }
      } else {
        try {
          const result = await createCheckout(priceId, checkoutOpts);
          rememberPendingOrder(result.orderId);
          if (popup.closed) {
            throw checkoutError(
              "checkout_closed",
              "Checkout window closed before payment completed.",
            );
          }
          popup.location.href = result.url;
          await waitForPopupCheckout(result, popup);
          return result;
        } catch (err) {
          if (!popup.closed) popup.close();
          throw err;
        }
      }
    }

    const successUrl =
      checkoutOpts.successUrl ??
      (typeof window !== "undefined" ? window.location.href : undefined);
    const result = await createCheckout(priceId, { ...checkoutOpts, successUrl });
    rememberPendingOrder(result.orderId);
    if (typeof window !== "undefined") {
      window.location.assign(result.url);
    }
    return result;
  }

  /** Poll an order by its id or provider checkout id. */
  async function getOrder(ref: string): Promise<OrderStatus> {
    return request<OrderStatus>(`/orders/${encodeURIComponent(ref)}`);
  }

  /**
   * A customer-portal URL for managing subscriptions / payment methods.
   * Requires a wallet that has completed at least one purchase.
   */
  async function getPortalUrl(
    opts: { code?: string; returnUrl?: string } = {},
  ): Promise<string> {
    const code = opts.code ?? getCode();
    if (!code) {
      throw new PayError(400, "No credit code for this browser", {
        code: "wallet_not_found",
      });
    }
    const q = opts.returnUrl
      ? `?returnUrl=${encodeURIComponent(opts.returnUrl)}`
      : "";
    const { url } = await request<{ url: string }>(
      `/wallets/${encodeURIComponent(code)}/portal${q}`,
    );
    return url;
  }

  return {
    baseUrl,
    /** localStorage key where a pending checkout's order id is stashed. */
    pendingOrderKey,
    getCode,
    setCode,
    clearCode,
    getOrCreateCode,
    getProducts,
    getWallet,
    getBalances,
    getBalance,
    getFeatures,
    hasFeature,
    hasCredits,
    deduct,
    createCheckout,
    startCheckout,
    getOrder,
    getPortalUrl,
  };
}

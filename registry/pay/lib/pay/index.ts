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
  /** Project identity mode. Defaults to anonymous credit-code wallets. */
  mode?: "credit_codes" | "external_auth";
  /** Your app's stable user id. Required when `mode` is `external_auth`. */
  externalUserId?: string;
  /**
   * Same-origin bridge for external-auth server calls. It should expose:
   * POST {base}/wallet, POST {base}/checkout, POST {base}/portal, and
   * optionally POST {base}/deduct. Defaults to `/api/pay`.
   */
  externalApiBasePath?: string;
  /** localStorage key used to persist the credit code. */
  storageKey?: string;
  /** Maximum time to wait for an API request. Defaults to 15 seconds. */
  requestTimeoutMs?: number;
};

export { PayError, type PayErrorOptions } from "./error";
import { PayError } from "./error";

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
  code: string | null;
  walletId?: string;
  externalUserId?: string;
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
  /** Let customers enter a provider promotion/discount code at checkout. */
  allowPromotionCodes?: boolean;
  /** Apply or prefill a provider promotion/discount code for this checkout. */
  discountCode?: string;
  /** Stable key for safely retrying checkout creation after network failures. */
  idempotencyKey?: string;
  /**
   * `auto` opens checkout in a popup on desktop and redirects on touch/mobile.
   * Use `redirect` when your app cannot support popups.
   */
  flow?: CheckoutFlow;
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

export type PayIdentity = {
  projectId: string;
  project: string;
  mode: "credit_codes" | "external_auth";
  keyKind: "publishable" | "secret";
};

export type OrderPage = {
  orders: Array<Omit<OrderStatus, "code" | "balance">>;
  nextCursor: string | null;
};

const DEFAULT_STORAGE_KEY = "pay_code";
const DEFAULT_EXTERNAL_API_BASE_PATH = "/api/pay";
export const PENDING_ORDER_KEY = "pay_pending_order";
const POPUP_POLL_MS = 1500;

function hasStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage;
  } catch {
    return false;
  }
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
  return mobileUA || window.innerWidth < 768;
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
  const popup = window.open("", `pay_checkout_${randomKey()}`, popupFeatures());
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
  const configuredBaseUrl = config.baseUrl?.trim();
  if (!configuredBaseUrl) {
    throw new Error(
      "[pay] baseUrl is missing. Did you set NEXT_PUBLIC_PAY_URL?",
    );
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
  if (config.publishableKey.startsWith("pay_sk_")) {
    console.warn(
      "[pay] publishableKey looks like a secret key. Use a pay_pk_… key in the browser.",
    );
  }
  const mode = config.mode ?? "credit_codes";
  const externalApiBasePath = (
    config.externalApiBasePath ?? DEFAULT_EXTERNAL_API_BASE_PATH
  ).replace(/\/$/, "");
  const storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY;
  const requestTimeoutMs =
    Number.isFinite(config.requestTimeoutMs) && config.requestTimeoutMs! >= 1_000
      ? config.requestTimeoutMs!
      : 15_000;
  // Namespaced by storageKey so two projects on one origin don't clash.
  const pendingOrderKey =
    storageKey === DEFAULT_STORAGE_KEY
      ? PENDING_ORDER_KEY
      : `${storageKey}_pending_order`;
  const baseOrigin = new URL(baseUrl).origin;

  async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const signal = init.signal;
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, requestTimeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  async function request<T>(
    path: string,
    init?: Omit<RequestInit, "body"> & { body?: unknown },
  ): Promise<T> {
    const { body, ...rest } = init ?? {};
    let res: Response;
    try {
      res = await fetchWithTimeout(`${baseUrl}/api/v1${path}`, {
        ...rest,
        headers: {
          Authorization: `Bearer ${config.publishableKey}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...rest.headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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

  async function externalRequest<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${externalApiBasePath}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new PayError(0, "Could not reach your billing endpoint. Check your connection and try again.", {
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

  function requireExternalUserId(): string {
    if (mode !== "external_auth") {
      throw new PayError(400, "This client is not in external auth mode", {
        code: "mode_mismatch",
      });
    }
    if (!config.externalUserId) {
      throw new PayError(400, "externalUserId is required", {
        code: "invalid_body",
      });
    }
    return config.externalUserId;
  }

  function requireCreditCodeMode() {
    if (mode !== "credit_codes") {
      throw new PayError(400, "This client is not in credit-code mode", {
        code: "mode_mismatch",
      });
    }
  }

  // --- credit-code storage -------------------------------------------------

  /** The credit code stored in this browser, or null. */
  function getCode(): string | null {
    if (mode !== "credit_codes") return null;
    if (!hasStorage()) return null;
    return window.localStorage.getItem(storageKey);
  }

  /** Persist a credit code (e.g. after the user restores one). */
  function setCode(code: string): void {
    if (mode !== "credit_codes") return;
    if (hasStorage()) window.localStorage.setItem(storageKey, code);
  }

  /** Forget the stored credit code. The next call mints a fresh wallet. */
  function clearCode(): void {
    if (mode !== "credit_codes") return;
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
    requireCreditCodeMode();
    if (typeof window === "undefined") {
      throw new Error(
        "[pay] getOrCreateCode() is browser-only. Use createPayServerClient for server-side wallet operations.",
      );
    }
    const existing = getCode();
    if (existing) return existing;
    if (!pendingCreate) {
      pendingCreate = (async () => {
        const { code } = await request<WalletInfo>("/wallets", {
          method: "POST",
          body: {},
        });
        if (!code) {
          throw new PayError(500, "Wallet creation did not return a code", {
            code: "wallet_not_found",
          });
        }
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
    if (mode === "external_auth") {
      if (code !== undefined) {
        throw new PayError(400, "code is not used in external auth mode", {
          code: "mode_mismatch",
        });
      }
      const wallet = await externalRequest<
        Omit<WalletInfo, "code"> & { code?: string | null }
      >("/wallet", { externalUserId: requireExternalUserId() });
      return { ...wallet, code: wallet.code ?? null };
    }

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
    if (mode === "external_auth") {
      return externalRequest<DeductResult>("/deduct", {
        externalUserId: requireExternalUserId(),
        amount,
        idempotencyKey: opts.idempotencyKey ?? randomKey(),
        ...(opts.productId ? { productId: opts.productId } : {}),
        ...(opts.meta ? { meta: opts.meta } : {}),
      });
    }

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
      allowPromotionCodes?: boolean;
      discountCode?: string;
      idempotencyKey?: string;
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
        ...(opts.allowPromotionCodes !== undefined
          ? { allowPromotionCodes: opts.allowPromotionCodes }
          : {}),
        ...(opts.discountCode ? { discountCode: opts.discountCode } : {}),
        ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
      },
    });
  }

  async function checkoutWithExternalUser(
    priceId: string,
    opts: {
      successUrl?: string;
      cancelUrl?: string;
      customerEmail?: string;
      allowPromotionCodes?: boolean;
      discountCode?: string;
      idempotencyKey?: string;
    },
  ): Promise<CheckoutResult> {
    return externalRequest<CheckoutResult>("/checkout", {
      externalUserId: requireExternalUserId(),
      priceId,
      ...(opts.successUrl ? { successUrl: opts.successUrl } : {}),
      ...(opts.cancelUrl ? { cancelUrl: opts.cancelUrl } : {}),
      ...(opts.customerEmail ? { customerEmail: opts.customerEmail } : {}),
      ...(opts.allowPromotionCodes !== undefined
        ? { allowPromotionCodes: opts.allowPromotionCodes }
        : {}),
      ...(opts.discountCode ? { discountCode: opts.discountCode } : {}),
      ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
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
      let popupClosed = false;
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
          if (
            order.status === "paid" &&
            (mode === "external_auth" || order.code)
          ) {
            finish(order);
            return;
          }
          if (
            order.status === "failed" ||
            order.status === "expired" ||
            order.status === "refunded"
          ) {
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
        if (!popupClosed) pollTimer = setTimeout(poll, POPUP_POLL_MS);
      }

      async function handleClosedPopup() {
        if (popupClosed) return;
        popupClosed = true;
        if (closeTimer) clearInterval(closeTimer);

        const deadline = Date.now() + 10_000;
        async function confirmPayment() {
          if (!active) return;
          try {
            const order = await getOrder(result.orderId);
            if (
              order.status === "paid" &&
              (mode === "external_auth" || order.code)
            ) {
              finish(order);
              return;
            }
        if (
          order.status === "failed" ||
          order.status === "expired" ||
          order.status === "refunded"
        ) {
              forgetPendingOrder(result.orderId);
              fail(
                checkoutError(
                  `checkout_${order.status}`,
                  `Checkout ${order.status}.`,
                ),
              );
              return;
            }
          } catch {
            // The pending-order resume poller will retry transient failures.
          }
          if (Date.now() < deadline) {
            pollTimer = setTimeout(confirmPayment, POPUP_POLL_MS);
            return;
          }
          fail(
            checkoutError(
              "checkout_closed",
              "Checkout closed before payment could be confirmed. We'll keep checking in the background.",
            ),
          );
        }
        void confirmPayment();
      }

      function onMessage(event: MessageEvent<CheckoutPopupMessage>) {
        if (event.origin !== baseOrigin) return;
        const data = event.data;
        if (data?.source !== "pay") return;

        const matchesOrder = data.orderId === result.orderId;
        if (data.type === "checkout_paid" && matchesOrder) {
          void poll();
        }
        if (data.type === "checkout_cancelled" && matchesOrder) {
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
      allowPromotionCodes?: boolean;
      discountCode?: string;
      idempotencyKey?: string;
    } = {},
  ): Promise<CheckoutResult> {
    if (mode === "external_auth") {
      if (opts.code !== undefined) {
        throw new PayError(400, "code is not used in external auth mode", {
          code: "mode_mismatch",
        });
      }
      return checkoutWithExternalUser(priceId, opts);
    }

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

    const returnUrl =
      typeof window !== "undefined" ? window.location.href : undefined;
    const result = await createCheckout(priceId, {
      ...checkoutOpts,
      successUrl: checkoutOpts.successUrl ?? returnUrl,
      cancelUrl: checkoutOpts.cancelUrl ?? returnUrl,
    });
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

  /** List project orders with an opaque cursor for pagination. */
  async function listOrders(opts: { cursor?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.limit) params.set("limit", String(opts.limit));
    const query = params.size ? `?${params}` : "";
    return request<OrderPage>(`/orders${query}`);
  }

  /** Inspect the project and key mode currently configured for this client. */
  async function getMe(): Promise<PayIdentity> {
    return request<PayIdentity>("/me");
  }

  /**
   * A customer-portal URL for managing subscriptions / payment methods.
   * Requires a wallet that has completed at least one purchase.
   */
  async function getPortalUrl(
    opts: { code?: string; returnUrl?: string } = {},
  ): Promise<string> {
    if (mode === "external_auth") {
      const { url } = await externalRequest<{ url: string }>("/portal", {
        externalUserId: requireExternalUserId(),
        ...(opts.returnUrl ? { returnUrl: opts.returnUrl } : {}),
      });
      return url;
    }

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
    mode,
    /** localStorage key where this browser's credit wallet code is stored. */
    storageKey,
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
    listOrders,
    getMe,
    getPortalUrl,
  };
}

"use client";

import * as React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createPayClient,
  PayError,
  type Balance,
  type CheckoutResult,
  type DeductResult,
  type OrderStatus,
  type PayClient,
  type Product,
  type StartCheckoutOptions,
  type Subscription,
} from "@/lib/pay";

export const PAY_CHECKOUT_PAID_EVENT = "pay:checkout-paid";

// Dev-only: slugs we already warned about, so each typo logs once.
const warnedFeatureSlugs = new Set<string>();

function notifyCheckoutPaid(order: OrderStatus): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PAY_CHECKOUT_PAID_EVENT, { detail: order }),
  );
}

type PayContextValue = {
  client: PayClient;
  mode: "credit_codes" | "external_auth";
  balances: Balance[];
  features: string[];
  subscriptions: Subscription[];
  /** The project catalog, or null before the first load completes. */
  products: Product[] | null;
  /** Message from the last failed catalog load, or null. */
  productsError: string | null;
  /** Load (and cache) the product catalog; pass `revalidate` to force a refetch. */
  loadProducts: (opts?: { revalidate?: boolean }) => Promise<Product[]>;
  loading: boolean;
  error: string | null;
  /** Re-fetch the wallet (balances, features, subscriptions) from the server. */
  refresh: () => Promise<void>;
  /** Start checkout and refresh this context when a popup checkout completes. */
  startCheckout: (
    priceId: string,
    opts?: StartCheckoutOptions,
  ) => Promise<CheckoutResult>;
  /** True while checkout started from this page is in progress. */
  confirming: boolean;
};

const PayContext = createContext<PayContextValue | null>(null);

export type PayProviderProps = {
  /** Base URL of your vantezzen/pay deployment, e.g. `https://pay.vantezzen.io`. */
  baseUrl: string;
  /** Publishable API key (`pay_pk_…`). */
  publishableKey: string;
  /** `credit_codes` for anonymous wallets, `external_auth` for logged-in users. */
  mode?: "credit_codes" | "external_auth";
  /** Your app's stable user id. Required for `external_auth`. */
  externalUserId?: string;
  /** Same-origin bridge path for external-auth server calls. */
  externalApiBasePath?: string;
  /** localStorage key used for credit-code wallets. */
  storageKey?: string;
  children: React.ReactNode;
};

export function PayProvider({
  baseUrl,
  publishableKey,
  mode = "credit_codes",
  externalUserId,
  externalApiBasePath,
  storageKey,
  children,
}: PayProviderProps) {
  const client = useMemo(
    () =>
      createPayClient({
        baseUrl,
        publishableKey,
        mode,
        externalUserId,
        externalApiBasePath,
        storageKey,
      }),
    [
      baseUrl,
      publishableKey,
      mode,
      externalUserId,
      externalApiBasePath,
      storageKey,
    ],
  );

  const [balances, setBalances] = useState<Balance[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeNonce, setResumeNonce] = useState(0);

  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  // Deduplicates concurrent loads (e.g. two dialogs opening at once).
  const productsInflight = useRef<Promise<Product[]> | null>(null);

  const loadProducts = useCallback(
    async (opts?: { revalidate?: boolean }): Promise<Product[]> => {
      if (products && !opts?.revalidate) return products;
      if (productsInflight.current) return productsInflight.current;
      const request = client
        .getProducts()
        .then((next) => {
          setProducts(next);
          setProductsError(null);
          return next;
        })
        .catch((error) => {
          setProductsError(
            error instanceof PayError
              ? error.message
              : "Failed to load products",
          );
          throw error;
        })
        .finally(() => {
          productsInflight.current = null;
        });
      productsInflight.current = request;
      return request;
    },
    [client, products],
  );

  // Reset the catalog cache when the client changes (a new provider config).
  // The client identity only changes when the provider props change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional cache reset on client change
    setProducts(null);
    setProductsError(null);
  }, [client]);

  const hasLoaded = useRef(false);
  const refresh = useCallback(async () => {
    // Only surface the loading state on the first load. Later refreshes (e.g.
    // after a deduct) keep the last values on screen so the UI doesn't flash
    // back to a skeleton - the numbers just animate to their new values.
    if (!hasLoaded.current) setLoading(true);
    setError(null);
    try {
      const wallet = await client.getWallet();
      setBalances(wallet.balances);
      setFeatures(wallet.features);
      setSubscriptions(wallet.subscriptions);
      hasLoaded.current = true;
    } catch (e) {
      setError(
        e instanceof PayError ? e.message : "Failed to load credits",
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Load balances once on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time balance fetch on mount
    void refresh();
  }, [refresh]);

  // A purchase or wallet restore in another tab changes the shared local
  // wallet identity. Refresh when that happens and when this tab regains focus
  // so the UI does not keep showing an old balance.
  useEffect(() => {
    function refreshOnFocus() {
      void refresh();
    }
    function refreshOnStorage(event: StorageEvent) {
      if (
        event.storageArea === window.localStorage &&
        (event.key === client.storageKey || event.key === client.pendingOrderKey)
      ) {
        void refresh();
      }
    }

    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("storage", refreshOnStorage);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("storage", refreshOnStorage);
    };
  }, [client, refresh]);

  const startCheckout = useCallback(
    async (priceId: string, opts: StartCheckoutOptions = {}) => {
      setConfirming(true);
      try {
        const result = await client.startCheckout(priceId, opts);
        await refresh();
        const order = await client.getOrder(result.orderId).catch(() => null);
        if (order?.status === "paid") notifyCheckoutPaid(order);
        return result;
      } catch (error) {
        if (error instanceof PayError && error.code === "checkout_closed") {
          setResumeNonce((nonce) => nonce + 1);
        }
        throw error;
      } finally {
        setConfirming(false);
      }
    },
    [client, refresh],
  );

  // Resume a checkout the user was redirected away for. This must be
  // non-blocking: stale abandoned orders should never freeze gates or buttons.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const pending = window.localStorage.getItem(client.pendingOrderKey);
    if (!pending) return;

    let active = true;
    let attempts = 0;

    async function poll() {
      if (!active) return;
      try {
        const order = await client.getOrder(pending!);
        if (
          order.status === "paid" &&
          (client.mode === "external_auth" || order.code)
        ) {
          if (order.code) client.setCode(order.code);
          window.localStorage.removeItem(client.pendingOrderKey);
          if (!active) return;
          await refresh();
          notifyCheckoutPaid(order);
          return;
        }
        if (
          order.status === "failed" ||
          order.status === "expired" ||
          order.status === "refunded"
        ) {
          window.localStorage.removeItem(client.pendingOrderKey);
          return;
        }
      } catch (err) {
        if (err instanceof PayError && err.code === "order_not_found") {
          window.localStorage.removeItem(client.pendingOrderKey);
          return;
        }
        // transient - keep polling in the background
      }
      // Keep checking for five minutes, with a capped backoff. A provider
      // webhook may arrive well after the customer closes their checkout tab.
      if (++attempts > 14) {
        window.localStorage.removeItem(client.pendingOrderKey);
        return;
      }
      const delay = Math.min(30_000, 1_500 * 2 ** Math.min(attempts, 4));
      setTimeout(poll, delay);
    }
    void poll();
    return () => {
      active = false;
    };
  }, [client, refresh, resumeNonce]);

  const value = useMemo<PayContextValue>(
    () => ({
      client,
      mode,
      balances,
      features,
      subscriptions,
      products,
      productsError,
      loadProducts,
      loading,
      error,
      refresh,
      startCheckout,
      confirming,
    }),
    [
      client,
      mode,
      balances,
      features,
      subscriptions,
      products,
      productsError,
      loadProducts,
      loading,
      error,
      refresh,
      startCheckout,
      confirming,
    ],
  );

  return (
    <PayContext.Provider value={value}>{children}</PayContext.Provider>
  );
}

function usePayContext(): PayContextValue {
  const ctx = useContext(PayContext);
  if (!ctx) {
    throw new Error("usePay must be used within a <PayProvider>");
  }
  return ctx;
}

/** Access the raw client (for advanced calls like getProducts/getPortalUrl). */
export function usePay(): PayClient {
  return usePayContext().client;
}

/** Current wallet identity mode. */
export function usePayMode(): PayContextValue["mode"] {
  return usePayContext().mode;
}

/** Checkout helper that refreshes context after popup checkout completes. */
export function usePayCheckout(): PayContextValue["startCheckout"] {
  return usePayContext().startCheckout;
}

/** All of the current wallet's active subscriptions. */
export function useSubscriptions(): Subscription[] {
  return usePayContext().subscriptions;
}

export type UseProducts = {
  /** The project catalog, or null before the first load completes. */
  products: Product[] | null;
  /** True until the first load settles. */
  loading: boolean;
  error: string | null;
  /** Force a refetch (e.g. after you know the catalog changed). */
  refresh: () => Promise<void>;
};

/**
 * The project's product catalog, fetched once per provider and shared by
 * every consumer — purchase dialogs, pricing pages, recommendation logic.
 */
export function useProducts(): UseProducts {
  const { products, productsError, loadProducts } = usePayContext();
  useEffect(() => {
    loadProducts().catch(() => {
      // Error state is exposed via `error`; consumers decide how to render it.
    });
  }, [loadProducts]);
  return {
    products,
    loading: products === null && productsError === null,
    error: productsError,
    refresh: async () => {
      await loadProducts({ revalidate: true });
    },
  };
}

/** Internal: catalog cache primitives for pay components. */
export function usePayProducts(): {
  products: Product[] | null;
  productsError: string | null;
  loadProducts: (opts?: { revalidate?: boolean }) => Promise<Product[]>;
} {
  const { products, productsError, loadProducts } = usePayContext();
  return { products, productsError, loadProducts };
}

/**
 * Runs the handler whenever a checkout started from this page is confirmed
 * paid — popup completion, redirect resume, or background confirmation.
 * The wallet context (balances, features, subscriptions) has already been
 * refreshed by the time the handler fires.
 *
 * The handler does not need to be memoized.
 *
 * ```tsx
 * useCheckoutPaid((order) => toast.success(`Payment received (${order.status})`));
 * ```
 */
export function useCheckoutPaid(handler: (order: OrderStatus) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    function onPaid(event: Event) {
      handlerRef.current((event as CustomEvent<OrderStatus>).detail);
    }
    window.addEventListener(PAY_CHECKOUT_PAID_EVENT, onPaid);
    return () => window.removeEventListener(PAY_CHECKOUT_PAID_EVENT, onPaid);
  }, []);
}

export type UseCredits = {
  /** Current balance for the selected product (0 if unknown). */
  balance: number;
  /** The product's credit unit label, e.g. "minutes". */
  creditUnit: string | null;
  /** The resolved product id, or null if the project has no products. */
  productId: string | null;
  loading: boolean;
  error: string | null;
  confirming: boolean;
  refresh: () => Promise<void>;
  hasCredits: (amount: number) => boolean;
  /** Deduct credits for this product, then refresh the local balance. */
  deduct: (
    amount: number,
    opts?: { idempotencyKey?: string; meta?: Record<string, unknown> },
  ) => Promise<DeductResult>;
};

/**
 * Read and spend credits for a product. With no argument it targets the
 * project's first/only product - perfect for single-product apps.
 */
export function useCredits(productId?: string): UseCredits {
  const { client, balances, loading, error, refresh, confirming } =
    usePayContext();

  const current = productId
    ? balances.find((b) => b.productId === productId)
    : balances[0];
  const resolvedId = current?.productId ?? productId ?? null;

  const deduct = useCallback(
    async (
      amount: number,
      opts?: { idempotencyKey?: string; meta?: Record<string, unknown> },
    ) => {
      const result = await client.deduct(amount, {
        productId: resolvedId ?? undefined,
        idempotencyKey: opts?.idempotencyKey,
        meta: opts?.meta,
      });
      await refresh();
      return result;
    },
    [client, resolvedId, refresh],
  );

  return {
    balance: current?.balance ?? 0,
    creditUnit: current?.creditUnit ?? null,
    productId: resolvedId,
    loading,
    error,
    confirming,
    refresh,
    hasCredits: (amount: number) => (current?.balance ?? 0) >= amount,
    deduct,
  };
}

export type UseFeature = {
  /** Whether the wallet has unlocked this feature. */
  enabled: boolean;
  loading: boolean;
  error: string | null;
  confirming: boolean;
  refresh: () => Promise<void>;
};

/**
 * Whether the current wallet has a feature unlocked (via a subscription, a
 * one-time purchase, or a manual grant). Perfect for `<FeatureGate>` or any
 * "show this only to paying users" check.
 */
export function useFeature(feature: string): UseFeature {
  const { features, products, loading, error, confirming, refresh } =
    usePayContext();

  // Dev-only typo guard: if the cached catalog sells features and this slug
  // isn't one of them (nor granted to the wallet), the gate can never open
  // through a purchase — almost always a typo.
  if (process.env.NODE_ENV !== "production") {
    if (
      products &&
      !features.includes(feature) &&
      !warnedFeatureSlugs.has(feature)
    ) {
      const sellable = new Set(
        products.flatMap((p) => p.prices.flatMap((price) => price.features)),
      );
      if (sellable.size > 0 && !sellable.has(feature)) {
        warnedFeatureSlugs.add(feature);
        console.warn(
          `[pay] useFeature("${feature}"): no price in this project sells the ` +
            `feature "${feature}". Check the slug for a typo (sellable: ` +
            `${[...sellable].join(", ")}). Ignore this if the feature is only ` +
            `granted manually.`,
        );
      }
    }
  }

  return {
    enabled: features.includes(feature),
    loading,
    error,
    confirming,
    refresh,
  };
}

export type UseSubscription = {
  /** The wallet's active subscription for the product, or null. */
  subscription: Subscription | null;
  /** Convenience: whether an active subscription exists. */
  subscribed: boolean;
  loading: boolean;
  error: string | null;
  confirming: boolean;
  refresh: () => Promise<void>;
};

/**
 * The wallet's active subscription for a product (or its first active one when
 * `productId` is omitted). Use it to show the current tier / "Manage plan".
 */
export function useSubscription(productId?: string): UseSubscription {
  const { subscriptions, loading, error, confirming, refresh } = usePayContext();
  const subscription =
    (productId
      ? subscriptions.find((s) => s.productId === productId)
      : subscriptions[0]) ?? null;
  return {
    subscription,
    subscribed: subscription !== null,
    loading,
    error,
    confirming,
    refresh,
  };
}

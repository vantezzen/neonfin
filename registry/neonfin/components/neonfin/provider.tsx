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
  createNeonfin,
  NeonfinError,
  type Balance,
  type CheckoutResult,
  type DeductResult,
  type NeonfinClient,
  type StartCheckoutOptions,
  type Subscription,
} from "@/lib/neonfin";

type NeonfinContextValue = {
  client: NeonfinClient;
  balances: Balance[];
  features: string[];
  subscriptions: Subscription[];
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

const NeonfinContext = createContext<NeonfinContextValue | null>(null);

export type NeonfinProviderProps = {
  /** Base URL of your neonFin deployment, e.g. `https://pay.vantezzen.io`. */
  baseUrl: string;
  /** Publishable API key (`nf_pk_…`). */
  publishableKey: string;
  children: React.ReactNode;
};

export function NeonfinProvider({
  baseUrl,
  publishableKey,
  children,
}: NeonfinProviderProps) {
  const client = useMemo(
    () => createNeonfin({ baseUrl, publishableKey }),
    [baseUrl, publishableKey],
  );

  const [balances, setBalances] = useState<Balance[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        e instanceof NeonfinError ? e.message : "Failed to load credits",
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

  const startCheckout = useCallback(
    async (priceId: string, opts: StartCheckoutOptions = {}) => {
      setConfirming(true);
      try {
        const result = await client.startCheckout(priceId, opts);
        await refresh();
        return result;
      } finally {
        setConfirming(false);
      }
    },
    [client, refresh],
  );

  // Resume a checkout the user was redirected away for. This must be
  // non-blocking: stale abandoned orders should never freeze gates or buttons.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || typeof window === "undefined") return;
    resumed.current = true;
    const pending = window.localStorage.getItem(client.pendingOrderKey);
    if (!pending) return;

    let active = true;
    let attempts = 0;

    async function poll() {
      if (!active) return;
      try {
        const order = await client.getOrder(pending!);
        if (order.status === "paid" && order.code) {
          client.setCode(order.code);
          window.localStorage.removeItem(client.pendingOrderKey);
          if (!active) return;
          await refresh();
          return;
        }
        if (order.status === "failed" || order.status === "refunded") {
          window.localStorage.removeItem(client.pendingOrderKey);
          return;
        }
      } catch (err) {
        if (err instanceof NeonfinError && err.code === "order_not_found") {
          window.localStorage.removeItem(client.pendingOrderKey);
          return;
        }
        // transient - keep polling in the background
      }
      // Stop tracking stale abandoned checkouts. The UI never blocks while this
      // runs, but clearing the key avoids retrying the same old order forever.
      if (++attempts > 20) {
        window.localStorage.removeItem(client.pendingOrderKey);
        return;
      }
      setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      active = false;
    };
  }, [client, refresh]);

  const value = useMemo<NeonfinContextValue>(
    () => ({
      client,
      balances,
      features,
      subscriptions,
      loading,
      error,
      refresh,
      startCheckout,
      confirming,
    }),
    [
      client,
      balances,
      features,
      subscriptions,
      loading,
      error,
      refresh,
      startCheckout,
      confirming,
    ],
  );

  return (
    <NeonfinContext.Provider value={value}>{children}</NeonfinContext.Provider>
  );
}

function useNeonfinContext(): NeonfinContextValue {
  const ctx = useContext(NeonfinContext);
  if (!ctx) {
    throw new Error("useNeonfin must be used within a <NeonfinProvider>");
  }
  return ctx;
}

/** Access the raw client (for advanced calls like getProducts/getPortalUrl). */
export function useNeonfin(): NeonfinClient {
  return useNeonfinContext().client;
}

/** Checkout helper that refreshes context after popup checkout completes. */
export function useNeonfinCheckout(): NeonfinContextValue["startCheckout"] {
  return useNeonfinContext().startCheckout;
}

/** All of the current wallet's active subscriptions. */
export function useSubscriptions(): Subscription[] {
  return useNeonfinContext().subscriptions;
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
    useNeonfinContext();

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
  confirming: boolean;
  refresh: () => Promise<void>;
};

/**
 * Whether the current wallet has a feature unlocked (via a subscription, a
 * one-time purchase, or a manual grant). Perfect for `<FeatureGate>` or any
 * "show this only to paying users" check.
 */
export function useFeature(feature: string): UseFeature {
  const { features, loading, confirming, refresh } = useNeonfinContext();
  return {
    enabled: features.includes(feature),
    loading,
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
  confirming: boolean;
  refresh: () => Promise<void>;
};

/**
 * The wallet's active subscription for a product (or its first active one when
 * `productId` is omitted). Use it to show the current tier / "Manage plan".
 */
export function useSubscription(productId?: string): UseSubscription {
  const { subscriptions, loading, confirming, refresh } = useNeonfinContext();
  const subscription =
    (productId
      ? subscriptions.find((s) => s.productId === productId)
      : subscriptions[0]) ?? null;
  return {
    subscription,
    subscribed: subscription !== null,
    loading,
    confirming,
    refresh,
  };
}

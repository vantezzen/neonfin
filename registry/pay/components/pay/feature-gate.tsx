"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useFeature } from "@/components/pay/provider";
import {
  PurchaseButton,
  humanizeFeature,
  type PurchaseButtonProps,
} from "@/components/pay/purchase-dialog";

export type FeatureGateProps = {
  /** Feature slug required to pass the gate, e.g. "analytics" or "export". */
  feature: string;
  /** Limit the purchase fallback to a specific product. Omit to show all. */
  productId?: string;
  /** Shown when the wallet has the feature unlocked. */
  children: React.ReactNode;
  /** Shown when it doesn't. Defaults to a purchase button. */
  fallback?: React.ReactNode;
  /** Customize the default purchase fallback without replacing it entirely. */
  purchaseButtonProps?: PurchaseButtonProps;
};

/**
 * Gate content on the wallet having a feature unlocked - via an active
 * subscription, a one-time purchase, or a manual grant. Nothing is consumed:
 * access is derived, so the gate opens and closes automatically as the
 * subscription renews or ends.
 *
 * ```tsx
 * <FeatureGate feature="analytics">
 *   <AnalyticsDashboard />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({
  feature,
  productId,
  children,
  fallback,
  purchaseButtonProps,
}: FeatureGateProps) {
  const { enabled, loading, confirming } = useFeature(feature);

  if (loading || confirming) {
    return (
      <span className="inline-flex items-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </span>
    );
  }

  if (enabled) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  const {
    children: buttonChildren,
    filters,
    productId: fallbackProductId,
    ...buttonProps
  } = purchaseButtonProps ?? {};

  return (
    <PurchaseButton
      {...buttonProps}
      filters={{
        productId: fallbackProductId ?? productId,
        features: [feature],
        ...filters,
      }}
    >
      {buttonChildren ?? `Unlock ${humanizeFeature(feature)}`}
    </PurchaseButton>
  );
}

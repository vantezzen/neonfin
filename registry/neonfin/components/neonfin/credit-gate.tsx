"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useCredits } from "@/components/neonfin/provider";
import {
  PurchaseButton,
  type PurchaseButtonProps,
} from "@/components/neonfin/purchase-dialog";

export type CreditGateProps = {
  /** Credits required to pass the gate. */
  cost: number;
  /** Which product's balance to check. Omit for single-product projects. */
  productId?: string;
  /** Shown when the wallet has enough credits. */
  children: React.ReactNode;
  /** Shown when it doesn't. Defaults to a purchase button. */
  fallback?: React.ReactNode;
  /** Customize the default purchase fallback without replacing it entirely. */
  purchaseButtonProps?: PurchaseButtonProps;
};

/**
 * Gate content on having enough credits. Note this checks the *balance* - it
 * does not deduct. Perform the deduction when the user actually runs the action
 * via `useCredits().deduct(cost)`, so a retry/cancel doesn't burn credits.
 *
 * ```tsx
 * <CreditGate cost={10}>
 *   <ProcessButton />
 * </CreditGate>
 * ```
 */
export function CreditGate({
  cost,
  productId,
  children,
  fallback,
  purchaseButtonProps,
}: CreditGateProps) {
  const { hasCredits, loading, confirming, creditUnit } = useCredits(productId);

  if (loading || confirming) {
    return (
      <span className="inline-flex items-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </span>
    );
  }

  if (hasCredits(cost)) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  const {
    children: buttonChildren,
    filters,
    productId: fallbackProductId,
    ...buttonProps
  } = purchaseButtonProps ?? {};
  const scopedProductId = fallbackProductId ?? productId;

  return (
    <PurchaseButton
      {...buttonProps}
      filters={{
        productId: scopedProductId,
        grantsCredits: true,
        ...filters,
      }}
    >
      {buttonChildren ?? `Buy ${creditUnit ?? "credits"}`}
    </PurchaseButton>
  );
}

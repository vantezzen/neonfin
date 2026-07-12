"use client";

import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/pay/format";
import { useCredits } from "@/components/pay/provider";

export type RemainingCreditsProps = {
  /** Which product's balance to show. Omit for single-product projects. */
  productId?: string;
  /** Show the credit unit label after the number (e.g. "120 minutes"). */
  showUnit?: boolean;
  className?: string;
};

/**
 * Inline display of the current credit balance. Renders a subtle skeleton while
 * loading. Drop it in a header, next to a button, anywhere.
 */
export function RemainingCredits({
  productId,
  showUnit = true,
  className,
}: RemainingCreditsProps) {
  const { balance, creditUnit, loading, error } = useCredits(productId);

  if (loading) {
    return (
      <span
        className={cn(
          "inline-block h-4 w-10 rounded bg-muted animate-pulse align-middle",
          className,
        )}
        aria-hidden
      />
    );
  }

  if (error) {
    return <span className={cn("text-muted-foreground", className)}>-</span>;
  }

  return (
    <span className={cn("tabular-nums", className)}>
      {/* Keying on the value remounts the number when it changes, so the enter
          animation plays - a subtle "flip" to the new amount without a heavy
          counting tween. */}
      <span
        key={balance}
        className="inline-block duration-300 animate-in fade-in slide-in-from-bottom-1"
      >
        {formatCredits(balance)}
      </span>
      {showUnit && creditUnit ? (
        <span className="text-muted-foreground"> {creditUnit}</span>
      ) : null}
      {balance < 0 ? (
        <span className="ml-1 text-xs text-muted-foreground">
          (includes a refund or adjustment)
        </span>
      ) : null}
    </span>
  );
}

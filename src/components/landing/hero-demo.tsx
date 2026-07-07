"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A self-playing loop of the core product story: spend credits until they run
 * out, watch the gate swap in checkout, top up, repeat. Pure CSS transitions
 * keyed on a scripted timeline; pauses entirely under prefers-reduced-motion.
 */

type Action =
  "idle" | "processing" | "deducted" | "empty" | "purchasing" | "purchased";

const SCRIPT: { balance: number; action: Action; duration: number }[] = [
  { balance: 30, action: "idle", duration: 2000 },
  { balance: 30, action: "processing", duration: 1000 },
  { balance: 20, action: "deducted", duration: 1700 },
  { balance: 20, action: "processing", duration: 1000 },
  { balance: 10, action: "deducted", duration: 1700 },
  { balance: 10, action: "processing", duration: 1000 },
  { balance: 0, action: "empty", duration: 2500 },
  { balance: 0, action: "purchasing", duration: 2000 },
  { balance: 600, action: "purchased", duration: 2600 },
];

const CAPTION: Record<Action, string> = {
  idle: "Wallet created automatically - no signup",
  processing: "Wallet created automatically - no signup",
  deducted: "deduct(10) - retry-safe, one line",
  empty: "Out of credits - the gate swaps in checkout",
  purchasing: "Out of credits - the gate swaps in checkout",
  purchased: "Back from checkout, balance topped up",
};

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export function HeroDemo({ className }: { className?: string }) {
  const [step, setStep] = useState(0);
  const paused = usePrefersReducedMotion();

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(
      () => setStep((s) => (s + 1) % SCRIPT.length),
      SCRIPT[step].duration,
    );
    return () => clearTimeout(t);
  }, [step, paused]);

  const { balance, action } = SCRIPT[step];
  const outOfCredits =
    action === "empty" || action === "purchasing" || action === "purchased";

  return (
    <div className={cn("flex w-full max-w-sm flex-col gap-3", className)}>
      <div className="rounded-xl border bg-background p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
        {/* Balance row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Your balance</span>
            <span className="flex items-baseline gap-1.5 text-lg font-semibold tabular-nums">
              <span
                key={balance}
                className="inline-block duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
              >
                {balance}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                minutes
              </span>
              {action === "deducted" ? (
                <span
                  key={step}
                  className="text-xs font-medium text-muted-foreground duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
                >
                  −10
                </span>
              ) : null}
              {action === "purchased" ? (
                <span
                  key={step}
                  className="text-xs font-medium text-emerald-600 duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
                >
                  +600
                </span>
              ) : null}
            </span>
          </div>
          <span
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-opacity",
              outOfCredits ? "opacity-40" : "opacity-100",
            )}
          >
            Get credits
          </span>
        </div>

        {/* The gated action - swaps between spend and purchase states. */}
        <div className="mt-4">
          {!outOfCredits ? (
            <div
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-transform duration-200",
                action === "processing" && "scale-[0.98]",
              )}
            >
              {action === "processing" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Zap className="size-3.5" />
                  Process file · 10 minutes
                </>
              )}
            </div>
          ) : action === "purchased" ? (
            <div
              key="purchased"
              className="flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-700 duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
            >
              <Check className="size-4" />
              Payment confirmed
            </div>
          ) : (
            <div
              key="empty"
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95",
                action === "purchasing" && "scale-[0.98]",
              )}
            >
              {action === "purchasing" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Opening checkout…
                </>
              ) : (
                <>Get 600 more · $5</>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Phase caption - one quiet line that narrates the loop. */}
      <p
        key={CAPTION[action]}
        className="text-center font-mono text-xs text-muted-foreground duration-500 motion-safe:animate-in motion-safe:fade-in"
      >
        {CAPTION[action]}
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  CreditCard,
  Lock,
  RefreshCw,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { PayError } from "@/lib/pay";
import { CreditGate } from "@/components/pay/credit-gate";
import { FeatureGate } from "@/components/pay/feature-gate";
import { useCredits } from "@/components/pay/provider";
import { PurchaseButton } from "@/components/pay/purchase-dialog";
import { RemainingCredits } from "@/components/pay/remaining-credits";
import { WalletButton } from "@/components/pay/wallet-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function ExamplePage() {
  const { deduct, refresh, loading, confirming } = useCredits();
  const [note, setNote] = useState<string | null>(null);
  const busy = loading || confirming;

  async function spend(amount: number) {
    setNote(null);
    try {
      await deduct(amount);
      setNote(`Spent ${amount} credits.`);
    } catch (err) {
      setNote(
        err instanceof PayError && err.isInsufficientCredits
          ? "Not enough credits - buy more below."
          : "Something went wrong. Try again.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground">
            React SDK example
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            vantezzen/pay
          </h1>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-2.5">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Your balance</span>
            <span className="text-lg font-semibold tabular-nums">
              <RemainingCredits />
            </span>
          </div>
          <PurchaseButton size="sm" />
        </div>
      </header>

      <p className="max-w-2xl text-sm text-muted-foreground">
        These are the drop-in vantezzen/pay components - balance display,
        metered spending, a purchase flow, feature gating, and wallet recovery.
        Everything updates live against your wallet. Checkout runs in Stripe
        test mode, so pay with{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          4242 4242 4242 4242
        </code>
        , any future expiry, any CVC.
      </p>

      {/* Feature grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Feature
          icon={<Wallet className="size-4" />}
          title="Remaining credits"
          code="<RemainingCredits />"
          description="Show the live balance anywhere."
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl font-semibold tabular-nums">
              <RemainingCredits />
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              disabled={busy}
            >
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </div>
        </Feature>

        <Feature
          icon={<Zap className="size-4" />}
          title="Spend credits"
          code="useCredits().deduct(n)"
          description="Meter usage; the balance updates in real time."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => spend(10)} disabled={busy}>
              Use 10
            </Button>
            <Button variant="outline" onClick={() => spend(50)} disabled={busy}>
              Use 50
            </Button>
          </div>
          {note ? (
            <p className="mt-3 text-sm text-muted-foreground">{note}</p>
          ) : null}
        </Feature>

        <Feature
          icon={<Lock className="size-4" />}
          title="Gate a feature"
          code="<CreditGate cost={50}>"
          description="Show an action only when the wallet can afford it - otherwise a purchase prompt."
        >
          <CreditGate cost={50}>
            <Button variant="default" onClick={() => spend(50)} disabled={busy}>
              Run premium action (50)
            </Button>
          </CreditGate>
        </Feature>

        <Feature
          icon={<CreditCard className="size-4" />}
          title="Buy credits"
          code="<PurchaseButton />"
          description="Lists your prices and redirects to provider checkout. On return the wallet tops up automatically."
        >
          <PurchaseButton>Get more credits</PurchaseButton>
        </Feature>

        <Feature
          icon={<Sparkles className="size-4" />}
          title="Gate a feature"
          code='<FeatureGate feature="analytics">'
          description="Unlock content with a subscription or one-time purchase - no credits consumed. Access follows the subscription automatically."
        >
          <FeatureGate feature="analytics">
            <p className="text-sm">
              ✨ Analytics unlocked - you have access to this feature.
            </p>
          </FeatureGate>
        </Feature>

        <Feature
          icon={<Wallet className="size-4" />}
          title="Discount codes"
          code={`<PurchaseButton discountCode="LAUNCH10" />`}
          description="Apply a discount code to the checkout."
        >
          <PurchaseButton discountCode="LAUNCH10">
            Buy credits for 10% off
          </PurchaseButton>
        </Feature>
      </div>

      {/* Wallet recovery - full width */}
      <Feature
        icon={<Wallet className="size-4" />}
        title="Your wallet"
        code="<WalletButton />"
        description="Open the wallet dialog to copy the code, switch wallets, or transfer it with a QR code."
      >
        <WalletButton>Open wallet</WalletButton>
      </Feature>
    </div>
  );
}

function Feature({
  icon,
  title,
  code,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  code: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
        <code className="mt-1 inline-block w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {code}
        </code>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default ExamplePage;

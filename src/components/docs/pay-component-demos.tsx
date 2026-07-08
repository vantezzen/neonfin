"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { PayError } from "@/lib/pay";
import { cn } from "@/lib/utils";
import { CreditGate } from "@/components/pay/credit-gate";
import { FeatureGate } from "@/components/pay/feature-gate";
import {
  PayProvider,
  useCredits,
  useFeature,
} from "@/components/pay/provider";
import { PurchaseButton } from "@/components/pay/purchase-dialog";
import { RemainingCredits } from "@/components/pay/remaining-credits";
import { WalletButton } from "@/components/pay/wallet-button";
import { Button } from "@/components/ui/button";

const baseUrl = process.env.NEXT_PUBLIC_EXAMPLE_PAY_URL;
const publishableKey = process.env.NEXT_PUBLIC_EXAMPLE_PAY_KEY;

const snippets = {
  provider: `import { PayProvider } from "@/components/pay/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PayProvider
      baseUrl={process.env.NEXT_PUBLIC_PAY_URL!}
      publishableKey={process.env.NEXT_PUBLIC_PAY_KEY!}
    >
      {children}
    </PayProvider>
  );
}`,
  remainingCredits: `import { RemainingCredits } from "@/components/pay/remaining-credits";

export function Balance() {
  return <RemainingCredits />;
}`,
  useCredits: `import { useCredits } from "@/components/pay/provider";
import { Button } from "@/components/ui/button";

export function SpendCreditsButton() {
  const { balance, deduct, loading } = useCredits();

  return (
    <Button onClick={() => deduct(10)}>
      Use 10 credits
    </Button>
  );
}`,
  purchase: `import { PurchaseButton } from "@/components/pay/purchase-dialog";

export function BuyCredits() {
  return <PurchaseButton>Buy credits</PurchaseButton>;
}`,
  creditGate: `import { CreditGate } from "@/components/pay/credit-gate";
import { Button } from "@/components/ui/button";

export function PremiumAction() {
  return (
    <CreditGate cost={5}>
      <Button>Run premium action</Button>
    </CreditGate>
  );
}`,
  featureGate: `import { FeatureGate } from "@/components/pay/feature-gate";

export function AnalyticsPanel() {
  return (
    <FeatureGate feature="analytics">
      <div>Analytics unlocked</div>
    </FeatureGate>
  );
}`,
  wallet: `import { WalletButton } from "@/components/pay/wallet-button";

export function WalletMenu() {
  return <WalletButton />;
}
export function BigWalletMenu() {
  return <WalletButton>Open wallet</WalletButton>;
}`,
} satisfies Record<string, string>;

function ComponentExample({
  code,
  children,
  previewClassName,
}: {
  code: string;
  children: React.ReactNode;
  previewClassName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const trimmedCode = code.trim();

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(trimmedCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="not-prose my-8 overflow-hidden rounded-lg border bg-background">
      <div
        className={cn(
          "flex min-h-[250px] items-center justify-center px-8 py-16 sm:min-h-[300px]",
          previewClassName,
        )}
      >
        {children}
      </div>
      <div className="relative border-t bg-muted/30">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute right-3 top-3 z-10 bg-background"
          onClick={copyCode}
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
        <pre className="max-h-96 overflow-auto p-4 pr-28 text-xs leading-6 text-muted-foreground sm:text-[13px]">
          <code>{trimmedCode}</code>
        </pre>
      </div>
    </div>
  );
}

function MissingExampleConfig() {
  return (
    <p className="max-w-sm text-center text-sm text-muted-foreground">
      Set NEXT_PUBLIC_EXAMPLE_PAY_URL and NEXT_PUBLIC_EXAMPLE_PAY_KEY to
      render the interactive example.
    </p>
  );
}

function LiveProvider({ children }: { children: React.ReactNode }) {
  if (!baseUrl || !publishableKey) return <MissingExampleConfig />;
  return (
    <PayProvider baseUrl={baseUrl} publishableKey={publishableKey}>
      {children}
    </PayProvider>
  );
}

export function ProviderLiveDemo() {
  return (
    <ComponentExample code={snippets.provider}>
      <LiveProvider>
        <ProviderStatus />
      </LiveProvider>
    </ComponentExample>
  );
}

function ProviderStatus() {
  const { balance, creditUnit, loading, confirming, refresh } = useCredits();

  return (
    <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Balance</span>
        <span className="text-2xl font-semibold tabular-nums">
          {loading ? "Loading..." : `${balance} ${creditUnit ?? "credits"}`}
        </span>
        {confirming ? (
          <span className="text-xs text-muted-foreground">
            Checkout in progress
          </span>
        ) : null}
      </div>
      <Button variant="outline" size="sm" onClick={() => refresh()}>
        <RefreshCw className="size-4" />
        Refresh
      </Button>
    </div>
  );
}

export function RemainingCreditsLiveDemo() {
  return (
    <ComponentExample code={snippets.remainingCredits}>
      <LiveProvider>
        <span className="text-lg font-semibold tabular-nums">
          <RemainingCredits />
        </span>
      </LiveProvider>
    </ComponentExample>
  );
}

export function UseCreditsLiveDemo() {
  return (
    <ComponentExample code={snippets.useCredits}>
      <LiveProvider>
        <UseCreditsPanel />
      </LiveProvider>
    </ComponentExample>
  );
}

function UseCreditsPanel() {
  const { balance, creditUnit, deduct, loading, confirming } = useCredits();
  const [message, setMessage] = useState<string | null>(null);

  async function spend(amount: number) {
    setMessage(null);
    try {
      await deduct(amount);
      setMessage(`Spent ${amount} ${creditUnit ?? "credits"}.`);
    } catch (err) {
      setMessage(
        err instanceof PayError && err.isInsufficientCredits
          ? "Not enough credits for that action."
          : "Could not spend credits. Try again.",
      );
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => spend(1)} disabled={loading || confirming}>
          Use 1
        </Button>
        <Button
          variant="outline"
          onClick={() => spend(10)}
          disabled={loading || confirming}
        >
          Use 10
        </Button>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {loading
            ? "Loading..."
            : `${balance} ${creditUnit ?? "credits"} left`}
        </span>
      </div>
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}

export function PurchaseLiveDemo() {
  return (
    <ComponentExample code={snippets.purchase}>
      <LiveProvider>
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-3">
            <PurchaseButton>Buy test credits</PurchaseButton>
          </div>
          <p className="max-w-sm text-center text-xs text-muted-foreground">
            Stripe test card: 4242 4242 4242 4242
          </p>
        </div>
      </LiveProvider>
    </ComponentExample>
  );
}

export function CreditGateLiveDemo() {
  return (
    <ComponentExample code={snippets.creditGate}>
      <LiveProvider>
        <CreditGatePanel />
      </LiveProvider>
    </ComponentExample>
  );
}

function CreditGatePanel() {
  const { deduct } = useCredits();
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setMessage(null);
    try {
      await deduct(5);
      setMessage("Premium action ran and spent 5 credits.");
    } catch {
      setMessage("Could not run that action. Try again.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <CreditGate cost={5}>
        <Button onClick={run}>Run premium action (5)</Button>
      </CreditGate>
      {message ? (
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function FeatureGateLiveDemo() {
  return (
    <ComponentExample code={snippets.featureGate}>
      <LiveProvider>
        <FeatureGatePanel />
      </LiveProvider>
    </ComponentExample>
  );
}

function FeatureGatePanel() {
  const { enabled, loading } = useFeature("analytics");

  return (
    <div className="flex flex-col items-center gap-3">
      <FeatureGate feature="analytics">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          Analytics is unlocked for this wallet.
        </div>
      </FeatureGate>
      <p className="text-xs text-muted-foreground">
        {loading ? "Checking feature..." : enabled ? "Unlocked" : "Locked"}
      </p>
    </div>
  );
}

export function WalletLiveDemo() {
  return (
    <ComponentExample code={snippets.wallet}>
      <LiveProvider>
        <div className="flex flex-col items-center gap-2">
          <WalletButton />
          <WalletButton>Open wallet</WalletButton>
        </div>
      </LiveProvider>
    </ComponentExample>
  );
}

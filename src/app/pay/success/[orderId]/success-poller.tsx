"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

type Status = {
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  code: string | null;
  balance: number | null;
  creditUnit: string | null;
  productName: string | null;
  amountCents: number | null;
  currency: string | null;
  creditsGranted: number | null;
};

function popupOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === value ? value : null;
  } catch {
    return null;
  }
}

const subscribeToBrowser = () => () => {};

export function SuccessPoller({
  orderId,
  returnOrigin,
}: {
  orderId: string;
  returnOrigin?: string;
}) {
  const [data, setData] = useState<Status | null>(null);
  const [copied, setCopied] = useState(false);
  const [takingLonger, setTakingLonger] = useState(false);
  const isBrowser = useSyncExternalStore(
    subscribeToBrowser,
    () => true,
    () => false,
  );
  const hasOpener = isBrowser && Boolean(window.opener);
  const notified = useRef(false);
  const recoveryUrl = returnOrigin
    ? `/pay/recover?returnUrl=${encodeURIComponent(returnOrigin)}`
    : "/pay/recover";

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    async function poll() {
      try {
        const res = await fetch(`/pay/status/${orderId}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as Status;
        if (!active) return;
        setData(json);
        if (json.status === "paid") return;
      } catch {
        // transient; keep polling
      }
      if (active && Date.now() - startedAt > 60_000) setTakingLonger(true);
      timer = setTimeout(poll, 1500);
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [orderId]);

  useEffect(() => {
    if (!data || data.status !== "paid" || notified.current) {
      return;
    }
    notified.current = true;
    const targetOrigin = popupOrigin(returnOrigin);
    if (!window.opener || !targetOrigin) return;

    window.opener.postMessage(
      { source: "pay", type: "checkout_paid", orderId },
      targetOrigin,
    );
    window.setTimeout(() => window.close(), 900);
  }, [data, orderId, returnOrigin]);

  if (!data || data.status === "pending") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-center text-sm">
          {takingLonger
            ? "Payment is taking longer than usual to confirm. You can safely return to the app while we keep checking."
            : "Confirming your payment…"}
        </p>
        {takingLonger ? <OrderReference orderId={orderId} /> : null}
      </div>
    );
  }

  if (data.status !== "paid") {
    const refunded = data.status === "refunded";
    const expired = data.status === "expired";
    const heading = refunded
      ? "Payment refunded"
      : expired
        ? "Checkout expired"
        : "Payment failed";
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-8 text-center"
      >
        {refunded ? (
          <RotateCcw className="size-8 text-muted-foreground" />
        ) : (
          <XCircle className="size-8 text-destructive" />
        )}
        <p className="text-lg font-semibold">{heading}</p>
        <p className="text-sm text-muted-foreground">
          {refunded
            ? "This payment was refunded. Credits from it have been removed."
            : "No charge was made. You can close this window and try again."}
        </p>
        <OrderReference orderId={orderId} />
        {!hasOpener && popupOrigin(returnOrigin) ? (
          <ReturnButton returnOrigin={returnOrigin!} />
        ) : null}
      </div>
    );
  }

  const summaryParts = [
    data.creditsGranted != null && data.creditUnit
      ? `${formatNum(data.creditsGranted)} ${data.creditUnit}`
      : null,
    data.amountCents != null && data.currency
      ? formatMoney(data.amountCents, data.currency)
      : null,
  ].filter(Boolean);
  const purchaseSummary =
    summaryParts.length > 0 ? summaryParts.join(" - ") : data.productName;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="size-10 text-emerald-600 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-500" />
        <p className="text-lg font-semibold">Payment complete</p>
        {purchaseSummary ? <p className="text-sm">{purchaseSummary}</p> : null}
        {data.balance != null && data.creditUnit ? (
          <p className="text-sm text-muted-foreground">
            {formatNum(data.balance)} {data.creditUnit} now available.
          </p>
        ) : null}
        {hasOpener ? (
          <p className="text-sm text-muted-foreground">
            Returning you to the app…
          </p>
        ) : popupOrigin(returnOrigin) ? (
          <ReturnButton returnOrigin={returnOrigin!} />
        ) : (
          <p className="text-sm text-muted-foreground">
            You’re all set - you can close this tab.
          </p>
        )}
      </div>

      {data.code ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Recovery code</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Save this only if you switch devices or clear your browser.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-background px-3 py-2 text-sm tracking-wide">
              {data.code}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Copy recovery code"
              onClick={() => {
                void navigator.clipboard.writeText(data.code!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
          <Link
            href={recoveryUrl}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Email me recovery details
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function ReturnButton({ returnOrigin }: { returnOrigin: string }) {
  return (
    <Button type="button" onClick={() => window.location.assign(returnOrigin)}>
      Return to app
    </Button>
  );
}

function OrderReference({ orderId }: { orderId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>Order {orderId}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copy order id"
        onClick={() => {
          void navigator.clipboard.writeText(orderId);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(6)));
}

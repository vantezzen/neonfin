"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = {
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  code: string | null;
  balance: number | null;
  creditUnit: string | null;
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
        const res = await fetch(`/pay/status/${orderId}`, { cache: "no-store" });
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
      </div>
    );
  }

  if (data.status !== "paid") {
    return (
      <p role="alert" className="py-8 text-center text-sm text-destructive">
        Payment {data.status}. If you were charged, contact support with this
        {" order id: "}
        <code>{orderId}</code>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="font-medium">Payment complete</p>
        {data.balance != null && data.creditUnit ? (
          <p className="text-sm text-muted-foreground">
            {formatNum(data.balance)} {data.creditUnit} now available.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          You can return to the app and keep going.
        </p>
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
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
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

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(6)));
}

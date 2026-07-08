"use client";
import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = {
  status: "pending" | "paid" | "failed" | "refunded";
  code: string | null;
  balance: number | null;
  creditUnit: string | null;
};

export function SuccessPoller({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Status | null>(null);
  const [copied, setCopied] = useState(false);
  const notified = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/pay/status/${orderId}`, { cache: "no-store" });
        const json = (await res.json()) as Status;
        if (!active) return;
        setData(json);
        if (json.status === "paid" && json.code) return; // settled
      } catch {
        // transient; keep polling
      }
      timer = setTimeout(poll, 1500);
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [orderId]);

  useEffect(() => {
    if (!data || data.status !== "paid" || !data.code || notified.current) {
      return;
    }
    notified.current = true;
    if (!window.opener) return;

    window.opener.postMessage(
      { source: "pay", type: "checkout_paid", orderId },
      "*",
    );
    window.setTimeout(() => window.close(), 900);
  }, [data, orderId]);

  if (!data || data.status === "pending" || (data.status === "paid" && !data.code)) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Confirming your payment…</p>
      </div>
    );
  }

  if (data.status !== "paid") {
    return (
      <p className="py-8 text-center text-sm text-destructive">
        Payment {data.status}. If you were charged, contact support with this
        order id.
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

      {/* Credits follow you automatically in this browser. The code only
          matters for switching devices, so keep it tucked away. */}
      <details className="rounded-lg border bg-muted/30 p-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Recovery code
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Save this only if you switch devices or clear your browser.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-background px-3 py-2 text-sm tracking-wide">
            {data.code}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(data.code!);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </details>
    </div>
  );
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(6)));
}

"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WALLET_QUERY_PARAM } from "@/lib/pay/qr";
import {
  PAY_CHECKOUT_PAID_EVENT,
  usePayMode,
} from "@/components/pay/provider";
import { WalletDialog } from "@/components/pay/wallet-dialog";

export { WalletCodeField } from "@/components/pay/wallet-code-field";
export { WalletDialog } from "@/components/pay/wallet-dialog";
export { WalletQrCode } from "@/components/pay/wallet-qr-code";
export { WalletQrScanner } from "@/components/pay/wallet-qr-scanner";
export type { WalletCodeFieldProps } from "@/components/pay/wallet-code-field";
export type { WalletDialogProps } from "@/components/pay/wallet-dialog";
export type { WalletQrCodeProps } from "@/components/pay/wallet-qr-code";
export type { WalletQrScannerProps } from "@/components/pay/wallet-qr-scanner";

export type WalletButtonProps = React.ComponentProps<typeof Button> & {
  /** Called after switching to a valid wallet code. */
  onRestored?: (code: string) => void;
  title?: string;
  description?: string;
};

export function WalletButton({
  onRestored,
  title,
  description,
  children,
  variant = "outline",
  size,
  "aria-label": ariaLabel,
  ...props
}: WalletButtonProps) {
  const mode = usePayMode();
  const [open, setOpen] = useState(false);
  const [incomingCode, setIncomingCode] = useState<string | null>(null);
  const [paidNotice, setPaidNotice] = useState(false);
  const handledUrl = useRef(false);

  useEffect(() => {
    if (mode === "external_auth") return;
    if (handledUrl.current || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get(WALLET_QUERY_PARAM);
    if (!code) return;

    handledUrl.current = true;
    url.searchParams.delete(WALLET_QUERY_PARAM);
    window.history.replaceState(null, "", url.toString());

    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL restore intentionally opens the wallet dialog on return.
    setIncomingCode(code);
    setOpen(true);
  }, [mode]);

  useEffect(() => {
    if (mode === "external_auth" || typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onCheckoutPaid(event: Event) {
      const detail = (event as CustomEvent<{ code?: string | null }>).detail;
      if (!detail?.code) return;
      setPaidNotice(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPaidNotice(false), 7000);
    }

    window.addEventListener(PAY_CHECKOUT_PAID_EVENT, onCheckoutPaid);
    return () => {
      window.removeEventListener(PAY_CHECKOUT_PAID_EVENT, onCheckoutPaid);
      if (timer) clearTimeout(timer);
    };
  }, [mode]);

  return (
    <>
      <WalletDialog
        open={open}
        onOpenChange={setOpen}
        onRestored={onRestored}
        incomingCode={incomingCode}
        onIncomingCodeHandled={() => setIncomingCode(null)}
        title={title}
        description={description}
      >
        <Button
          type="button"
          variant={variant}
          size={size ?? (children ? "default" : "icon")}
          aria-label={ariaLabel ?? "Open wallet"}
          {...props}
        >
          <Wallet className="size-4" />
          {children}
        </Button>
      </WalletDialog>

      {paidNotice ? (
        <div
          role="status"
          className="fixed top-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-lg border bg-background p-3 text-sm shadow-lg"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Payment complete</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Save your wallet code before switching devices.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setPaidNotice(false);
              setOpen(true);
            }}
          >
            Open wallet
          </Button>
        </div>
      ) : null}
    </>
  );
}

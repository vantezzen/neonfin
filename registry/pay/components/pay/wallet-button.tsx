"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WALLET_QUERY_PARAM } from "@/lib/pay/qr";
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
  const [open, setOpen] = useState(false);
  const [incomingCode, setIncomingCode] = useState<string | null>(null);
  const handledUrl = useRef(false);

  useEffect(() => {
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
  }, []);

  return (
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
  );
}

"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PayError } from "@/lib/pay";
import {
  createWalletTransferUrl,
  WALLET_QUERY_PARAM,
} from "@/lib/pay/qr";
import { useCredits, usePay, usePayMode } from "@/components/pay/provider";
import { WalletCodeField } from "@/components/pay/wallet-code-field";
import { WalletQrCode } from "@/components/pay/wallet-qr-code";
import { WalletQrScanner } from "@/components/pay/wallet-qr-scanner";

export type WalletDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional trigger element, usually a button. */
  children?: React.ReactNode;
  /** Called after switching to a valid wallet code. */
  onRestored?: (code: string) => void;
  /** A wallet code received from a transfer URL. */
  incomingCode?: string | null;
  onIncomingCodeHandled?: () => void;
  title?: string;
  description?: string;
  transferParam?: string;
};

export function WalletDialog({
  open,
  onOpenChange,
  children,
  onRestored,
  incomingCode,
  onIncomingCodeHandled,
  title,
  description,
  transferParam = WALLET_QUERY_PARAM,
}: WalletDialogProps) {
  const client = usePay();
  const mode = usePayMode();
  const externalAuth = mode === "external_auth";
  const { refresh } = useCredits();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMessage, setBillingMessage] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);
  const handledIncoming = useRef<string | null>(null);
  const effectiveTitle = title ?? (externalAuth ? "Billing" : "Wallet");
  const effectiveDescription =
    description ??
    (externalAuth
      ? "Manage billing for your signed-in account."
      : "Your wallet code keeps credits available across devices.");

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    async function loadCode() {
      if (externalAuth) {
        setCurrentCode(null);
        setValue("");
        setBillingMessage(null);
        return;
      }
      try {
        const code = client.getCode() ?? (await client.getOrCreateCode());
        if (!active) return;
        setCurrentCode(code);
        setValue(code);
        setBillingMessage(null);
      } catch {
        if (active) setError("Couldn't load this wallet.");
      }
    }

    void loadCode();
    return () => {
      active = false;
    };
  }, [isOpen, client, externalAuth]);

  const restoreCode = useCallback(
    async (code: string, successMessage = "Wallet restored.") => {
      const trimmed = code.trim().toUpperCase();
      if (externalAuth || !trimmed || status === "loading") return;
      setStatus("loading");
      setError(null);
      setNotice(null);
      setBillingMessage(null);
      try {
        const wallet = await client.getWallet(trimmed);
        if (!wallet.code) {
          throw new PayError(500, "Wallet restore did not return a code", {
            code: "wallet_not_found",
          });
        }
        client.setCode(wallet.code);
        setCurrentCode(wallet.code);
        setValue(wallet.code);
        await refresh();
        setNotice(successMessage);
        onRestored?.(wallet.code);
      } catch (err) {
        setError(
          err instanceof PayError && err.code === "wallet_expired"
            ? "That wallet code expired after inactivity. Start with a new wallet or restore another code."
            : err instanceof PayError && err.status === 404
              ? "That code doesn't match a wallet."
              : "Couldn't restore that wallet. Check the code and try again.",
        );
      } finally {
        setStatus("idle");
      }
    },
    [client, externalAuth, onRestored, refresh, status],
  );

  useEffect(() => {
    if (
      externalAuth ||
      !isOpen ||
      !incomingCode ||
      handledIncoming.current === incomingCode ||
      status === "loading"
    ) {
      return;
    }
    handledIncoming.current = incomingCode;
    void restoreCode(incomingCode, "Wallet added to this device.").finally(
      onIncomingCodeHandled,
    );
  }, [
    incomingCode,
    isOpen,
    onIncomingCodeHandled,
    restoreCode,
    status,
    externalAuth,
  ]);

  async function copy() {
    if (externalAuth) return;
    const code = currentCode ?? value.trim().toUpperCase();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable in insecure contexts.
    }
  }

  async function openBillingPortal() {
    const code = currentCode ?? value.trim().toUpperCase();
    if ((!externalAuth && !code) || billingBusy) return;
    setBillingBusy(true);
    setBillingMessage(null);
    try {
      const returnUrl =
        typeof window !== "undefined" ? window.location.href : undefined;
      const url = await client.getPortalUrl(
        externalAuth ? { returnUrl } : { code, returnUrl },
      );
      if (typeof window !== "undefined") window.location.assign(url);
    } catch (err) {
      setBillingBusy(false);
      const noBillingHistory =
        err instanceof PayError && err.code === "no_billing_customer";
      setBillingMessage({
        tone: noBillingHistory ? "info" : "error",
        text: noBillingHistory
          ? externalAuth
            ? "No billing history for this account yet."
            : "No billing history for this wallet yet. If you already purchased on another device, restore or scan that wallet code first."
          : "Couldn't open billing management. Please try again.",
      });
    }
  }

  function openRecoveryPage() {
    if (typeof window === "undefined") return;
    window.location.assign(walletRecoveryUrl(client.baseUrl));
  }

  const transferUrl = useWalletTransferUrl(currentCode, transferParam);

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {children ? (
        <DialogTrigger
          render={
            React.isValidElement(children) ? (
              (children as React.ReactElement<Record<string, unknown>>)
            ) : (
              <Button type="button">{children}</Button>
            )
          }
        />
      ) : null}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{effectiveTitle}</DialogTitle>
          <DialogDescription>{effectiveDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {notice ? (
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
              {notice}
            </p>
          ) : null}

          {externalAuth ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              This wallet is attached to your signed-in account. There is no
              recovery code to copy or scan.
            </p>
          ) : (
            <>
              <WalletQrCode value={transferUrl} />

              <WalletQrScanner
                param={transferParam}
                onCode={(code) => {
                  setValue(code);
                  void restoreCode(code, "Wallet restored from QR code.");
                }}
              />

              <WalletCodeField
                value={value}
                currentCode={currentCode}
                loading={status === "loading"}
                copied={copied}
                error={error}
                onValueChange={(next) => {
                  setValue(next);
                  setError(null);
                  setNotice(null);
                }}
                onCopy={copy}
                onApply={(code) => restoreCode(code)}
              />
            </>
          )}

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Billing</p>
                <p className="text-xs text-muted-foreground">
                  Manage invoices, payment methods, and subscriptions.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openBillingPortal}
                disabled={
                  externalAuth ? billingBusy : !currentCode || billingBusy
                }
              >
                {billingBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                Manage
              </Button>
            </div>
            {billingMessage ? (
              <p
                className={
                  billingMessage.tone === "error"
                    ? "mt-2 text-sm text-destructive"
                    : "mt-2 text-sm text-muted-foreground"
                }
              >
                {billingMessage.text}
              </p>
            ) : null}
          </div>

          {!externalAuth ? (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Lost wallet?</p>
                  <p className="text-xs text-muted-foreground">
                    Email yourself paid wallet codes and recovery QRs.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openRecoveryPage}
                >
                  <ExternalLink className="size-4" />
                  Recover
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function walletRecoveryUrl(baseUrl: string): string {
  const url = new URL("/pay/recover", baseUrl);
  if (typeof window !== "undefined") {
    url.searchParams.set("returnUrl", window.location.href);
  }
  return url.toString();
}

function useWalletTransferUrl(code: string | null, param: string): string {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!code || typeof window === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- transfer URL depends on browser location.
    setUrl(createWalletTransferUrl(window.location.href, code, param));
  }, [code, param]);

  return url;
}

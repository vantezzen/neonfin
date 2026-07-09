"use client";
import { useActionState, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Info, Plus } from "lucide-react";
import {
  connectProviderStart,
  saveWebhookSecret,
  type ConnectState,
} from "@/lib/actions/providers";
import type { FormState } from "@/lib/actions/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyText } from "@/components/dashboard/copy-text";
import { CodeSnippet } from "@/components/app/copy";
import { Stepper } from "@/components/app/wizard/stepper";

const STEPS = ["Keys", "Webhook", "Secret"] as const;
type Provider = "stripe" | "polar";

export function ProviderConnectWizard({
  appUrl,
  size = "default",
}: {
  appUrl: string;
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  return (
    <>
      <Button
        type="button"
        size={size}
        onClick={() => {
          setNonce((n) => n + 1);
          setOpen(true);
        }}
      >
        <Plus className="size-4" /> Connect provider
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <Body key={nonce} appUrl={appUrl} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Body({ appUrl, onDone }: { appUrl: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<Provider>("stripe");
  const [start, startAction, startPending] = useActionState<
    ConnectState,
    FormData
  >(connectProviderStart, {});
  const [secret, secretAction, secretPending] = useActionState<
    FormState,
    FormData
  >(saveWebhookSecret, {});

  useEffect(() => {
    if (secret.ok) onDone();
  }, [secret.ok, onDone]);

  const account =
    start.accountId && start.provider
      ? { id: start.accountId, provider: start.provider }
      : null;
  const currentStep = account && step === 0 ? 1 : step;
  const webhookUrl = account
    ? `${appUrl}/api/webhooks/${account.provider}/${account.id}`
    : "";
  const provider =
    (account?.provider as Provider | undefined) ?? selectedProvider;
  const providerName = provider === "polar" ? "Polar" : "Stripe";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect provider</DialogTitle>
        <DialogDescription>
          {step === 0
            ? "Paste a restricted provider key - vantezzen/pay manages the rest."
            : currentStep === 1
              ? "Register the webhook endpoint so payments get recorded."
              : "Add the signing secret to finish."}
        </DialogDescription>
      </DialogHeader>

      <Stepper steps={STEPS} current={currentStep} />

      {currentStep === 0 ? (
        <form action={startAction} className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              vantezzen/pay creates and manages this project&apos;s products &amp;
              prices inside your provider account automatically. We recommend a{" "}
              <span className="font-medium text-foreground">
                dedicated provider account
              </span>{" "}
              so its catalog stays separate from anything you manage by hand.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Provider">
              <NativeSelect
                name="provider"
                className="w-full"
                value={selectedProvider}
                onChange={(event) =>
                  setSelectedProvider(event.currentTarget.value as Provider)
                }
              >
                <NativeSelectOption value="stripe">Stripe</NativeSelectOption>
                <NativeSelectOption value="polar">Polar</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field label="Environment">
              <NativeSelect
                name="environment"
                className="w-full"
                defaultValue="production"
              >
                <NativeSelectOption value="production">
                  production
                </NativeSelectOption>
                <NativeSelectOption value="sandbox">
                  sandbox / test
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Label" hint="Just for you">
            <Input
              name="label"
              placeholder={`${providerName} (test)`}
              required
            />
          </Field>
          <Field
            label={provider === "polar" ? "Access token" : "Secret key"}
            hint={
              provider === "polar"
                ? "Polar → Settings → Developers. Use an organization access token with catalog, checkout, customer session, and webhook scopes."
                : "Stripe → Workbench (bottom bar) → API keys. Use a restricted key with catalog, checkout, customer, and billing portal access."
            }
          >
            <Input
              name="secretKey"
              type="password"
              placeholder={provider === "polar" ? "polar_oat_…" : "rk_test_…"}
              required
              autoFocus
            />
          </Field>
          {start.error ? (
            <p className="text-sm text-destructive">{start.error}</p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={startPending}>
              {startPending ? "Saving…" : "Continue"}{" "}
              <ArrowRight className="size-4" />
            </Button>
          </DialogFooter>
        </form>
      ) : null}

      {currentStep === 1 && account ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              Production - add this endpoint in {providerName}
            </Label>
            <CopyText value={webhookUrl} />
            <p className="text-xs text-muted-foreground">
              {provider === "polar" ? (
                <>
                  Polar → Settings → Webhooks → Add endpoint. Subscribe to{" "}
                  <code>order.paid</code>, <code>order.refunded</code>,{" "}
                  <code>subscription.canceled</code>, and{" "}
                  <code>subscription.revoked</code>.
                </>
              ) : (
                <>
                  Stripe → Workbench (bottom bar) → Webhooks → Create an event
                  destination. Subscribe to{" "}
                  <code>checkout.session.completed</code>,{" "}
                  <code>invoice.paid</code>, <code>charge.refunded</code>, and{" "}
                  <code>customer.subscription.deleted</code>.
                </>
              )}
            </p>
          </div>
          {provider === "stripe" ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                Local development - forward with the CLI
              </Label>
              <CodeSnippet code={`stripe listen --forward-to ${webhookUrl}`} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              For local Polar testing, expose this app with your tunnel of
              choice and paste the public webhook URL into Polar.
            </p>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setStep(2)}>
              I&apos;ve added it <ArrowRight className="size-4" />
            </Button>
          </DialogFooter>
        </div>
      ) : null}

      {currentStep === 2 && account ? (
        <form action={secretAction} className="flex min-w-0 flex-col gap-4">
          <input type="hidden" name="id" value={account.id} />
          <Field
            label="Webhook signing secret"
            hint={
              provider === "polar"
                ? "Polar shows this after the endpoint is created."
                : "The CLI prints it on start; Workbench shows it under the event destination's signing secret."
            }
          >
            <Input
              name="webhookSecret"
              type="password"
              placeholder={provider === "polar" ? "webhook secret" : "whsec_…"}
              autoFocus
            />
          </Field>
          {secret.error ? (
            <p className="text-sm text-destructive">{secret.error}</p>
          ) : null}
          <DialogFooter className="justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep(1)}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button type="submit" disabled={secretPending}>
              <Check className="size-4" />{" "}
              {secretPending ? "Saving…" : "Finish"}
            </Button>
          </DialogFooter>
        </form>
      ) : null}
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plug, Trash2, TriangleAlert } from "lucide-react";
import {
  deleteProviderAccount,
  updateProviderAccount,
} from "@/lib/actions/providers";
import { FormDialog } from "@/components/app/form-dialog";
import { ProviderLink } from "@/components/app/provider-link";
import { providerDashboardUrl } from "@/lib/providers/links";
import { EmptyState } from "@/components/app/empty-state";
import { Status } from "@/components/app/status";
import { CopyField } from "@/components/app/copy";
import { ProviderConnectWizard } from "@/components/dashboard/provider-connect-wizard";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

type Account = {
  id: string;
  provider: "stripe" | "polar";
  label: string;
  environment: string;
  hasWebhookSecret: boolean;
  lastWebhookAt: Date | null;
};

const PROVIDER = {
  stripe: { name: "Stripe", accent: "bg-indigo-500", initial: "S" },
  polar: { name: "Polar", accent: "bg-sky-500", initial: "P" },
} as const;

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

export function ProviderAccountsSection({
  accounts,
  appUrl,
}: {
  accounts: Account[];
  appUrl: string;
}) {
  const router = useRouter();
  const waitingForFirstEvent = accounts.some(
    (account) => account.hasWebhookSecret && !account.lastWebhookAt,
  );
  useEffect(() => {
    if (!waitingForFirstEvent) return;
    const interval = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(interval);
  }, [router, waitingForFirstEvent]);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<Plug />}
        title="No providers connected"
        description="Use “Connect provider” above with a Stripe or Polar API key. vantezzen/pay creates and syncs the product catalog and receives webhooks - you never manage the catalog in the provider dashboard."
      />
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {accounts.map((a) => {
        const meta = PROVIDER[a.provider];
        const configured = a.hasWebhookSecret;
        return (
          <div
            key={a.id}
            className="flex flex-col gap-3.5 rounded-xl border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-9 items-center justify-center rounded-lg text-sm font-semibold text-white ${meta.accent}`}
                >
                  {meta.initial}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{a.label}</span>
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    {meta.name} · {a.environment}
                    <ProviderLink
                      href={providerDashboardUrl(a.provider, a.environment)}
                      title={`Open the ${meta.name} dashboard`}
                    >
                      Open dashboard
                    </ProviderLink>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <EditButton account={a} />
                <ConfirmAction
                  action={deleteProviderAccount}
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove provider account"
                      title="Remove"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  }
                  title="Remove this provider account?"
                  description="Products attached to it can no longer be purchased until you attach another provider."
                  confirmLabel="Remove provider"
                  pendingLabel="Removing…"
                  successMessage="Provider account removed"
                >
                  <input type="hidden" name="id" value={a.id} />
                </ConfirmAction>
              </div>
            </div>

            {configured && a.lastWebhookAt ? (
              <Status tone="success" className="text-xs text-muted-foreground">
                Webhook received {formatDateTime(a.lastWebhookAt)} - payments are recording.
              </Status>
            ) : configured ? (
              <Status tone="warning" className="text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Waiting for the first event - complete a sandbox test checkout to verify this connection.
              </Status>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Add the webhook signing secret (Edit) so payments are
                  recorded.
                  {a.provider === "stripe" ? (
                    <>
                      {" "}
                      Run{" "}
                      <code>
                        stripe listen --forward-to {appUrl}/api/webhooks/stripe/
                        {a.id}
                      </code>{" "}
                      to get one.
                    </>
                  ) : (
                    " Create the endpoint in Polar, then paste the secret here."
                  )}
                </span>
                <ProviderConnectWizard
                  appUrl={appUrl}
                  size="sm"
                  resumeAccount={{
                    id: a.id,
                    provider: a.provider,
                    environment:
                      a.environment === "sandbox" ? "sandbox" : "production",
                  }}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                Webhook URL - paste into {meta.name}
              </span>
              <CopyField
                value={`${appUrl}/api/webhooks/${a.provider}/${a.id}`}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function EditButton({ account }: { account: Account }) {
  return (
    <FormDialog
      trigger={<Pencil className="size-4" />}
      triggerVariant="ghost"
      triggerSize="icon-sm"
      title="Edit provider account"
      description="Leave a secret field blank to keep the current value."
      action={updateProviderAccount}
      submitLabel="Save"
    >
      <input type="hidden" name="id" value={account.id} />
      <Field label="Label">
        <Input name="label" defaultValue={account.label} required />
      </Field>
      <Field label="Environment">
        <NativeSelect
          name="environment"
          className="w-full"
          defaultValue={account.environment}
        >
          <NativeSelectOption value="production">production</NativeSelectOption>
          <NativeSelectOption value="sandbox">
            sandbox / test
          </NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field
        label={account.provider === "polar" ? "Access token" : "Secret key"}
        hint={
          account.provider === "polar"
            ? "Blank = keep current. Use a scoped organization access token."
            : "Blank = keep current. Use a Stripe restricted key when possible."
        }
      >
        <Input
          name="secretKey"
          type="password"
          placeholder={account.provider === "polar" ? "polar_oat_…" : "rk_…"}
        />
      </Field>
      <Field label="Webhook signing secret" hint="Blank = keep current">
        <Input
          name="webhookSecret"
          type="password"
          placeholder={
            account.provider === "polar" ? "webhook secret" : "whsec_…"
          }
        />
      </Field>
    </FormDialog>
  );
}

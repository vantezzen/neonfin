"use client";
import { useActionState, useState } from "react";
import { Check, Copy, HelpCircle, KeyRound, Trash2 } from "lucide-react";
import type { ApiKey, ApiKeyKind } from "@/db/schema";

// The query layer strips the hash - only display fields reach the client.
type ApiKeyRow = Omit<ApiKey, "keyHash">;
import {
  issueApiKey,
  removeApiKey,
  type KeyState,
} from "@/lib/actions/projects";
import { CopyText } from "@/components/dashboard/copy-text";
import { SectionHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ApiKeysSection({
  projectId,
  keys,
}: {
  projectId: string;
  keys: ApiKeyRow[];
}) {
  const active = keys.filter((k) => !k.revokedAt);

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            API keys <ApiKeyHelp />
          </span>
        }
        description="Publishable keys are for the browser; secret keys stay on your server."
        action={
          <>
            <IssueKeyButton
              projectId={projectId}
              kind="publishable"
              label="Publishable key"
            />
            <IssueKeyButton
              projectId={projectId}
              kind="secret"
              label="Secret key"
            />
          </>
        }
      />

      {active.length > 0 ? (
        <div className="flex flex-col gap-2">
          {active.map((k) => (
            <KeyRow key={k.id} apiKey={k} projectId={projectId} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<KeyRound />}
          title="No API keys yet"
          description="Start with a publishable key - it's what the browser SDK uses."
          className="py-10"
        />
      )}
    </section>
  );
}

function ApiKeyHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Which API key should I use?"
      >
        <HelpCircle className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>API key types</DialogTitle>
            <DialogDescription>
              Pick the narrowest key that can do the job.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              Publishable keys start checkouts, create anonymous wallets, read
              balances, and deduct credits from browser apps. CORS and rate
              limits protect these calls.
            </p>
            <p>
              Secret keys can create external-auth wallets and grant credits.
              They are hash-only after creation and should never ship to a
              browser.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KeyRow({
  apiKey: k,
  projectId,
}: {
  apiKey: ApiKeyRow;
  projectId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">
          {k.kind === "publishable"
            ? "Publishable · safe in the browser"
            : "Secret · server-side only"}
        </span>
        <code className="truncate font-mono text-[13px]">
          {k.kind === "publishable" && k.publicValue
            ? k.publicValue
            : `${k.prefix}${"•".repeat(8)}`}
        </code>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {k.kind === "publishable" && k.publicValue ? (
          <CopyButton value={k.publicValue} />
        ) : null}
        <form
          action={removeApiKey}
          onSubmit={(e) => {
            if (
              !confirm(
                "Revoke this key? Apps using it will stop working immediately.",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={k.id} />
          <input type="hidden" name="projectId" value={projectId} />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            title="Revoke"
          >
            <Trash2 className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check className="size-4 text-emerald-600" />
      ) : (
        <Copy className="size-4" />
      )}
    </Button>
  );
}

function IssueKeyButton({
  projectId,
  kind,
  label,
}: {
  projectId: string;
  kind: ApiKeyKind;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<KeyState, FormData>(
    issueApiKey,
    {},
  );
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  // Only secret keys need a one-time reveal; publishable keys show in the list.
  const revealOpen =
    kind === "secret" && Boolean(state.key) && dismissedKey !== state.key;

  return (
    <>
      <form action={formAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="kind" value={kind} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <KeyRound className="size-3.5" />
          {label}
        </Button>
      </form>
      <Dialog
        open={revealOpen}
        onOpenChange={(next) => {
          if (!next) setDismissedKey(state.key ?? null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your secret key</DialogTitle>
            <DialogDescription>
              Copy it now - it won&apos;t be shown again. Keep it server-side
              only.
            </DialogDescription>
          </DialogHeader>
          {state.key ? <CopyText value={state.key} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

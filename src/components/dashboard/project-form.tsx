"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { HelpCircle } from "lucide-react";
import {
  createProject,
  updateProject,
  type ActionState,
} from "@/lib/actions/projects";
import type { Project } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Field } from "@/components/dashboard/products/product-form";

const initial: ActionState = {};

type ProjectSettings = Pick<
  Project,
  | "id"
  | "name"
  | "slug"
  | "mode"
  | "codePrefix"
  | "allowedOrigins"
  | "codeExpiresInDays"
  | "anonymousWalletsPerHour"
  | "outboundWebhookUrl"
>;

type ProjectSettingsWithWebhook = ProjectSettings & {
  hasOutboundWebhookSecret: boolean;
  hasWallets: boolean;
};

export function ProjectForm({
  project,
}: {
  project?: ProjectSettingsWithWebhook;
}) {
  const editing = Boolean(project);
  const searchParams = useSearchParams();
  const allowedOriginsRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const allowModeChange = useRef(false);
  const [mode, setMode] = useState(project?.mode ?? "credit_codes");
  const [modeConfirmationOpen, setModeConfirmationOpen] = useState(false);
  const [state, action, pending] = useActionState(
    editing ? updateProject : createProject,
    initial,
  );

  useEffect(() => {
    if (searchParams.get("highlight") !== "allowed-origins") return;
    const textarea = allowedOriginsRef.current;
    const field = textarea?.closest("[data-allowed-origins-field]");
    if (!textarea || !(field instanceof HTMLElement)) return;

    textarea.scrollIntoView({ block: "center", behavior: "smooth" });
    textarea.focus({ preventScroll: true });
    field.classList.remove("pay-field-highlight");
    void field.offsetWidth;
    field.classList.add("pay-field-highlight");

    const timeout = window.setTimeout(() => {
      field.classList.remove("pay-field-highlight");
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [searchParams]);

  useEffect(() => {
    if (state.ok) toast.success("Saved.");
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        if (
          editing &&
          project?.hasWallets &&
          mode !== project.mode &&
          !allowModeChange.current
        ) {
          event.preventDefault();
          setModeConfirmationOpen(true);
        }
      }}
    >
      {editing ? <input type="hidden" name="id" value={project!.id} /> : null}

      <Field label="Name">
        <Input
          name="name"
          defaultValue={project?.name}
          placeholder="Example"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Slug"
          hint="URL identifier - derived from the name if blank."
        >
          <Input
            name="slug"
            defaultValue={project?.slug}
            placeholder="example"
          />
        </Field>
        <Field label="Code prefix" hint="e.g. SKIP → SKIP-8F3K-L9PQ-2MVT">
          <Input
            name="codePrefix"
            defaultValue={project?.codePrefix}
            maxLength={8}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">Identity mode</Label>
          <ModeHelp />
        </div>
        <NativeSelect
          name="mode"
          className="w-full"
          value={mode}
          onChange={(event) =>
            setMode(event.currentTarget.value as Project["mode"])
          }
        >
          <NativeSelectOption value="credit_codes">
            Credit codes (anonymous)
          </NativeSelectOption>
          <NativeSelectOption value="external_auth">
            External auth (your own users)
          </NativeSelectOption>
        </NativeSelect>
      </div>
      <Field
        label="Allowed origins"
        hint="One origin per line, e.g. https://app.example.com. Blank allows any origin - fine for development, restrict before launch."
      >
        <div
          id="allowed-origins"
          data-allowed-origins-field
          className={cn("rounded-lg scroll-mt-24")}
        >
          <Textarea
            ref={allowedOriginsRef}
            name="allowedOrigins"
            rows={3}
            defaultValue={project?.allowedOrigins.join("\n")}
            placeholder={"https://example.com\nhttp://localhost:5173"}
          />
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={
            <span className="inline-flex items-center gap-1.5">
              Credit code expiry <CodePolicyHelp />
            </span>
          }
          hint="Inactive unpaid codes only. Blank or 0 = never."
        >
          <Input
            name="codeExpiresInDays"
            type="number"
            min="0"
            max="3650"
            defaultValue={project?.codeExpiresInDays ?? ""}
            placeholder="Never"
          />
        </Field>
        <Field
          label="Anonymous wallets / hour"
          hint="Per project and IP address."
        >
          <Input
            name="anonymousWalletsPerHour"
            type="number"
            min="1"
            max="1000"
            defaultValue={project?.anonymousWalletsPerHour ?? 20}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Consumer webhook URL"
          hint="Optional HTTPS endpoint for normalized payment events."
        >
          <Input
            name="outboundWebhookUrl"
            type="url"
            defaultValue={project?.outboundWebhookUrl ?? ""}
            placeholder="https://app.example.com/api/pay-events"
          />
        </Field>
        <Field
          label="Signing secret"
          hint={
            editing && project?.hasOutboundWebhookSecret
              ? "Blank keeps the current secret. Enter a new value to rotate it."
              : "At least 16 characters. Used to sign each delivery."
          }
        >
          <Input
            name="outboundWebhookSecret"
            type="password"
            minLength={16}
            autoComplete="new-password"
            placeholder={
              editing && project?.hasOutboundWebhookSecret
                ? "Keep current secret"
                : "A long random secret"
            }
          />
        </Field>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
      <Dialog
        open={modeConfirmationOpen}
        onOpenChange={setModeConfirmationOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch identity mode?</DialogTitle>
            <DialogDescription>
              Switching modes strands existing wallets of the other kind.
              Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModeConfirmationOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                allowModeChange.current = true;
                setModeConfirmationOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function CodePolicyHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="How credit code expiry works"
      >
        <HelpCircle className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Credit code policy</DialogTitle>
            <DialogDescription>
              Abuse controls for anonymous projects with free grants.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              Expiry applies only to unpaid anonymous code wallets. Codes with a
              paid order keep working so purchased credits are not removed.
            </p>
            <p>
              The hourly limit slows down scripts that repeatedly create free
              wallets from the same IP address.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModeHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="What are identity modes?"
      >
        <HelpCircle className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Identity modes</DialogTitle>
            <DialogDescription>
              How vantezzen/pay knows whose credits are whose.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <span className="font-medium">Credit codes (anonymous)</span>
              <p className="text-muted-foreground">
                No login required. Each visitor gets a code like{" "}
                <code>SKIP-8F3K-L9PQ-2MVT</code> stored in their browser. Best
                for client-only tools - the SDK handles it invisibly, and the
                code doubles as a recovery key across devices.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-medium">
                External auth (your own users)
              </span>
              <p className="text-muted-foreground">
                You already have logged-in users. Credits attach to your own
                user id via a server-side (secret-key) call, so balances follow
                the account instead of the browser.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

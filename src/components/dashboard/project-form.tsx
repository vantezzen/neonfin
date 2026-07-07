"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
>;

export function ProjectForm({ project }: { project?: ProjectSettings }) {
  const editing = Boolean(project);
  const searchParams = useSearchParams();
  const allowedOriginsRef = useRef<HTMLTextAreaElement | null>(null);
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
    field.classList.remove("neonfin-field-highlight");
    void field.offsetWidth;
    field.classList.add("neonfin-field-highlight");

    const timeout = window.setTimeout(() => {
      field.classList.remove("neonfin-field-highlight");
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [searchParams]);

  return (
    <form action={action} className="flex flex-col gap-5">
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
          defaultValue={project?.mode ?? "credit_codes"}
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
        hint="CORS allowlist for browser (publishable-key) calls - one per line. Blank allows any."
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

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.ok ? <p className="text-sm text-emerald-600">Saved.</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
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
              How neonFin knows whose credits are whose.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <span className="font-medium">Credit codes (anonymous)</span>
              <p className="text-muted-foreground">
                No login required. Each visitor gets a code like{" "}
                <code>SKIP-8F3K-L9PQ-2MVT</code> stored in their browser. Best for
                client-only tools - the SDK handles it invisibly, and the code
                doubles as a recovery key across devices.
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

function Field({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {typeof label === "string" ? (
        <Label className="text-xs">{label}</Label>
      ) : (
        <div className="flex items-center gap-2 text-xs leading-none font-medium">
          {label}
        </div>
      )}
      {children}
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

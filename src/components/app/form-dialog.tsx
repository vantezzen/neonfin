"use client";
import { useEffect, useState } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FormState } from "@/lib/actions/state";

export type { FormState };
export type DialogAction = (
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

/**
 * A trigger button + modal form wired to a server action via useActionState.
 * Shows inline errors and closes on success. The inner form is keyed by an
 * open-nonce so its action state resets cleanly each time it's reopened.
 */
export function FormDialog({
  trigger,
  triggerVariant = "outline",
  triggerSize = "sm",
  title,
  description,
  action,
  submitLabel = "Save",
  successMessage = "Saved",
  children,
  open: openProp,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  title: string;
  description?: string;
  action: DialogAction;
  submitLabel?: string;
  successMessage?: string;
  children: React.ReactNode;
  /** Controlled open state - lets a parent (e.g. a menu item) drive the dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp : internalOpen;

  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  };

  return (
    <>
      {trigger !== undefined && !isControlled ? (
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          onClick={() => setOpen(true)}
        >
          {trigger}
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <Inner
            // Remount (reset action state + fields) on each open/close transition.
            key={String(open)}
            action={action}
            submitLabel={submitLabel}
            successMessage={successMessage}
            onSuccess={() => setOpen(false)}
          >
            {children}
          </Inner>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Inner({
  action,
  submitLabel,
  successMessage,
  onSuccess,
  children,
}: {
  action: DialogAction;
  submitLabel: string;
  successMessage: string;
  onSuccess: () => void;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) {
      toast.success(successMessage);
      onSuccess();
    }
  }, [state, successMessage, onSuccess]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? `${submitLabel.replace(/\.$/, "")}…` : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

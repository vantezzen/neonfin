"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { FormState } from "@/lib/actions/state";
import type { MutationAction } from "@/components/app/mutation-form";

export function ConfirmAction({
  action,
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel = "Working…",
  successMessage,
  children,
}: {
  action: MutationAction;
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  successMessage: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    {},
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) toast.success(successMessage);
  }, [state, successMessage]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <form action={formAction}>
          {children}
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              disabled={pending}
            >
              {pending ? pendingLabel : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

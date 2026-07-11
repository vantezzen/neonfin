"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/actions/state";

export type MutationAction = (
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

export function MutationForm({
  action,
  successMessage,
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "action" | "children"> & {
  action: MutationAction;
  successMessage: string;
  children: (pending: boolean) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) toast.success(successMessage);
  }, [state, successMessage]);

  return (
    <form action={formAction} {...props}>
      {children(pending)}
    </form>
  );
}

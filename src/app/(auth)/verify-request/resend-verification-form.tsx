"use client";

import { useActionState } from "react";
import {
  resendVerificationForEmail,
  type AuthState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: AuthState = {};

export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(
    resendVerificationForEmail,
    initial,
  );
  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <Input
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={email}
        placeholder="you@example.com"
        required
      />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Sending…" : "Resend verification link"}
      </Button>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      ) : null}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import {
  recoverWalletByEmail,
  type WalletRecoveryState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: WalletRecoveryState = {};

export function RecoveryForm({ returnUrl }: { returnUrl: string | null }) {
  const [state, action, pending] = useActionState(recoverWalletByEmail, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      {returnUrl ? <input type="hidden" name="returnUrl" value={returnUrl} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Receipt email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send recovery email"}
      </Button>
    </form>
  );
}

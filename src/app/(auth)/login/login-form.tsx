"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { login, type AuthState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { GitHubSignInButton } from "../github-sign-in-button";

const initial: AuthState = {};

export function LoginForm({
  canRegister,
  githubEnabled,
  notice,
}: {
  canRegister: boolean;
  githubEnabled: boolean;
  notice?: string;
}) {
  const [state, action, pending] = useActionState(login, initial);
  const [email, setEmail] = useState("");
  return (
    <Card>
      <CardContent className="pt-6">
        {notice ? (
          <p className="mb-4 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        {githubEnabled ? (
          <>
            <GitHubSignInButton />
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        ) : null}
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state.error ? (
            <div className="text-sm text-destructive">
              <p>{state.error}</p>
              {state.error.startsWith("Check your email to verify") ? (
                <Link
                  href={`/verify-request?email=${encodeURIComponent(email)}`}
                  className="mt-1 inline-block underline-offset-4 hover:underline"
                >
                  Resend verification email
                </Link>
              ) : null}
            </div>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        {canRegister ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/register" className="text-foreground underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

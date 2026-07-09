"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function GitHubSignInButton() {
  const [pending, setPending] = useState(false);

  async function signInWithGitHub() {
    setPending(true);
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
        errorCallbackURL: "/login",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={signInWithGitHub}
      disabled={pending}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      Continue with GitHub
    </Button>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { githubSignInEnabled } from "@/lib/auth/server";
import { signupsOpen } from "@/lib/auth/signup";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · vantezzen/pay" };

function notice(searchParams: { reset?: string; deleted?: string; registered?: string }): string | undefined {
  if (searchParams.registered === "1") {
    return "Account created. Sign in to continue.";
  }
  if (searchParams.reset === "success") {
    return "Password reset. Sign in with your new password.";
  }
  if (searchParams.deleted === "1") {
    return "Account deleted.";
  }
  return undefined;
}

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; deleted?: string; registered?: string }>;
}) {
  const params = await searchParams;
  return <LoginForm
    canRegister={await signupsOpen()}
    githubEnabled={githubSignInEnabled()}
    notice={notice(params)}
  />;
}

export default function LoginPage({ searchParams }: {
  searchParams: Promise<{ reset?: string; deleted?: string; registered?: string }>;
}) {
  return (
    <>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Sign in to your dashboard
      </p>
      <Suspense fallback={null}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

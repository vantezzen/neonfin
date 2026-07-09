import type { Metadata } from "next";
import { githubSignInEnabled } from "@/lib/auth/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · vantezzen/pay" };

function notice(searchParams: { reset?: string; deleted?: string }): string | undefined {
  if (searchParams.reset === "success") {
    return "Password reset. Sign in with your new password.";
  }
  if (searchParams.deleted === "1") {
    return "Account deleted.";
  }
  return undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; deleted?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Sign in to your dashboard
      </p>
      <LoginForm
        canRegister
        githubEnabled={githubSignInEnabled()}
        notice={notice(params)}
      />
    </>
  );
}

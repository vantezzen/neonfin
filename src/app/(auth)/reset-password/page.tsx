import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose new password · vantezzen/pay",
};

function invalidReason(error?: string): string {
  if (error === "TOKEN_EXPIRED") return "This reset link has expired.";
  if (error) return "This reset link is invalid.";
  return "Open the reset link from your email to choose a new password.";
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Reset password
        </p>
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            <p>{invalidReason(error)}</p>
            <Link
              href="/forgot-password"
              className="mt-4 inline-block text-foreground underline-offset-4 hover:underline"
            >
              Request a new link
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Choose a new password
      </p>
      <ResetPasswordForm token={token} />
    </>
  );
}

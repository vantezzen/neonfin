import Link from "next/link";
import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ResendVerificationForm } from "./resend-verification-form";

export const metadata: Metadata = {
  title: "Verify email · vantezzen/pay",
};

export default async function VerifyRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const email = (await searchParams).email;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
        <div className="rounded-full border bg-muted/30 p-3">
          <MailCheck className="size-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification link{email ? ` to ${email}` : ""}. Open it
            to finish signing in.
          </p>
        </div>
        <ResendVerificationForm email={email} />
        <Link
          href="/login"
          className="text-sm text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}

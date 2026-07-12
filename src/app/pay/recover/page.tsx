import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, MailCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = {
  title: "Recover wallet · vantezzen/pay",
};

function safeReturnUrl(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export default function RecoverWalletPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string | string[] }>;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-lg">
        <h1 className="mb-6 text-center text-xl font-semibold tracking-tight">
          Recover a wallet
        </h1>
        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            <div className="flex items-start gap-3">
              <MailCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium">Recover by receipt email</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  If a paid wallet exists for that email, we will send the
                  wallet code and recovery QR to that address.
                </p>
              </div>
            </div>

            <Suspense>
              <RecoverySection searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Secure checkout · powered by{" "}
          <a
            href="https://pay.vantezzen.io"
            className="font-medium hover:underline"
          >
            vantezzen/pay
          </a>
        </p>
      </div>
    </div>
  );
}

async function RecoverySection({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string | string[] }>;
}) {
  const returnUrl = safeReturnUrl((await searchParams).returnUrl);

  return (
    <>
      <RecoveryForm returnUrl={returnUrl} />

      {returnUrl ? (
        <Link
          href={returnUrl}
          className={buttonVariants({ variant: "outline" })}
        >
          <ArrowLeft className="size-4" />
          Return to app
        </Link>
      ) : null}
    </>
  );
}

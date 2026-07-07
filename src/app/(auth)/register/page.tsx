import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { signupsOpen } from "@/lib/auth/signup";
import { Card, CardContent } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account · neonFin" };

// signupsOpen() may read the DB (dynamic) when the env flag is off - isolate
// it in a Suspense boundary for Cache Components.
async function Gate() {
  if (!(await signupsOpen())) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Signups are disabled on this instance.{" "}
          <Link
            href="/login"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </CardContent>
      </Card>
    );
  }
  return <RegisterForm />;
}

export default function RegisterPage() {
  return (
    <>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Create your developer account
      </p>
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </>
  );
}

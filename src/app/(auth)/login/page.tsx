import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · vantezzen/pay" };

export default function LoginPage() {
  return (
    <>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Sign in to your dashboard
      </p>
      <LoginForm canRegister />
    </>
  );
}

import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password · vantezzen/pay",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Enter your email and we will send a password reset link.
      </p>
      <ForgotPasswordForm />
    </>
  );
}

"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/auth-schema";
import { appUrl } from "@/lib/email";
import { consumeToken } from "@/lib/api/rate-limit";
import { sha256 } from "@/lib/crypto";
import { auth, emailVerificationIsEnabled } from "./server";
import { requireUser } from "./dal";

export type AuthState = { error?: string; message?: string };

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_NOT_VERIFIED: "Check your email to verify your account before signing in.",
  INVALID_EMAIL_OR_PASSWORD: "Invalid email or password.",
  INVALID_PASSWORD: "Current password is incorrect.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    "This account does not have a password yet. Use password reset to add one.",
  EMAIL_ALREADY_VERIFIED: "Your email is already verified.",
  INVALID_TOKEN: "This link is invalid or expired.",
  TOKEN_EXPIRED: "This link has expired.",
  USER_ALREADY_EXISTS: "An account with this email already exists.",
  CHANGE_EMAIL_DISABLED: "Email changes are disabled on this instance.",
};

function authErrorMessage(error: APIError, fallback: string): string {
  const code = typeof error.body?.code === "string" ? error.body.code : "";
  return AUTH_ERROR_MESSAGES[code] ?? error.message ?? fallback;
}

export async function register(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !email || !password) {
    return { error: "All fields are required" };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  try {
    await auth.api.signUpEmail({
      body: { name, email, password, callbackURL: appUrl("/dashboard") },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) {
      return { error: authErrorMessage(e, "Could not create account") };
    }
    throw e;
  }
  if (!emailVerificationIsEnabled()) {
    await auth.api.signInEmail({
      body: { email, password, callbackURL: appUrl("/dashboard") },
      headers: await headers(),
    });
    redirect("/dashboard");
  }
  redirect(`/verify-request?email=${encodeURIComponent(email)}`);
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required" };
  try {
    await auth.api.signInEmail({
      body: { email, password, callbackURL: appUrl("/dashboard") },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) {
      return { error: authErrorMessage(e, "Invalid email or password.") };
    }
    throw e;
  }
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required" };

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: appUrl("/reset-password") },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) {
      return {
        error: authErrorMessage(e, "Could not send a reset email right now."),
      };
    }
    throw e;
  }

  return {
    message: "If that email exists, we sent a password reset link.",
  };
}

export async function resetPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) return { error: "Reset link is invalid or expired" };
  if (!password || !confirm) return { error: "Both password fields are required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (password !== confirm) return { error: "Passwords do not match" };

  try {
    await auth.api.resetPassword({
      body: { token, newPassword: password },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) {
      return { error: authErrorMessage(e, "Could not reset password") };
    }
    throw e;
  }

  redirect("/login?reset=success");
}

export async function updateProfile(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required" };

  try {
    await auth.api.updateUser({
      body: { name },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) {
      return { error: authErrorMessage(e, "Could not update profile") };
    }
    throw e;
  }

  revalidatePath("/dashboard/settings");
  return { message: "Profile updated." };
}

export async function changePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const revokeOtherSessions = formData.get("revokeOtherSessions") === "on";

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All password fields are required" };
  }
  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters" };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match" };
  }

  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) {
      return { error: authErrorMessage(e, "Could not change password") };
    }
    throw e;
  }

  return { message: "Password changed." };
}

export async function changeEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const newEmail = String(formData.get("newEmail") ?? "").trim().toLowerCase();
  if (!newEmail) return { error: "New email is required" };

  try {
    await auth.api.changeEmail({
      body: { newEmail, callbackURL: appUrl("/dashboard/settings") },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) {
      return { error: authErrorMessage(e, "Could not start email change") };
    }
    throw e;
  }

  return { message: "Check your email to confirm the change." };
}

export async function resendVerificationEmail(
  _prev: AuthState,
  _formData?: FormData,
): Promise<AuthState> {
  void _prev;
  void _formData;

  const user = await requireUser();
  if (user.emailVerified) return { message: "Your email is already verified." };

  try {
    await auth.api.sendVerificationEmail({
      body: { email: user.email, callbackURL: appUrl("/dashboard/settings") },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) {
      return {
        error: authErrorMessage(e, "Could not send verification email"),
      };
    }
    throw e;
  }

  return { message: "Verification email sent." };
}

/** Resend from the signed-out verification screen without revealing account state. */
export async function resendVerificationForEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Email is required" };
  if (!emailVerificationIsEnabled()) {
    return {
      message: "This instance doesn't send email. You can sign in directly.",
    };
  }

  const generic = "If that address needs verification, we sent a new link.";
  const limit = await consumeToken(`verify-email:${sha256(email)}`, {
    capacity: 3,
    refillPerSec: 1 / 300,
  });
  if (!limit.ok) return { message: generic };

  try {
    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: appUrl("/dashboard") },
      headers: await headers(),
    });
  } catch {
    // Keep this response indistinguishable for unknown, already-verified, and
    // temporarily undeliverable accounts.
  }
  return { message: generic };
}

export async function requestAccountDeletion(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const user = await requireUser();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (confirmation !== "DELETE") return { error: 'Type "DELETE" to confirm.' };

  const [credentialAccount] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .limit(1);
  if (credentialAccount?.password && !password) {
    return { error: "Current password is required." };
  }

  try {
    await auth.api.deleteUser({
      body: {
        callbackURL: appUrl("/login?deleted=1"),
        ...(password ? { password } : {}),
      },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) {
      return { error: authErrorMessage(e, "Could not request account deletion") };
    }
    throw e;
  }

  return { message: "Check your email to confirm account deletion." };
}

"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import {
  changeEmail,
  changePassword,
  requestAccountDeletion,
  resendVerificationEmail,
  updateProfile,
  type AuthState,
} from "@/lib/auth/actions";
import { SectionHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AuthState = {};

type SettingsUser = {
  name: string;
  email: string;
  emailVerified: boolean;
};

export function SettingsForms({ user }: { user: SettingsUser }) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateProfile,
    initial,
  );
  const [emailState, emailAction, emailPending] = useActionState(
    changeEmail,
    initial,
  );
  const [verificationState, verificationAction, verificationPending] =
    useActionState(resendVerificationEmail, initial);
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePassword,
    initial,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    requestAccountDeletion,
    initial,
  );

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Profile"
        description="This name is shown in your dashboard account menu."
      >
        <form action={profileAction} className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              name="name"
              defaultValue={user.name}
              autoComplete="name"
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={profilePending}>
              {profilePending ? "Saving…" : "Save"}
            </Button>
          </div>
          <ActionMessage state={profileState} />
        </form>
      </SettingsSection>

      <SettingsSection
        title="Email"
        description="Email changes require confirmation before they take effect."
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{user.email}</span>
          <Badge variant={user.emailVerified ? "secondary" : "destructive"}>
            {user.emailVerified ? "Verified" : "Unverified"}
          </Badge>
        </div>
        {!user.emailVerified ? (
          <form action={verificationAction} className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Verify your email before relying on password resets or account
              recovery.
            </p>
            <div>
              <Button
                type="submit"
                variant="outline"
                disabled={verificationPending}
              >
                {verificationPending ? "Sending…" : "Resend verification email"}
              </Button>
            </div>
            <ActionMessage state={verificationState} />
          </form>
        ) : null}
        <form action={emailAction} className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              name="newEmail"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="outline" disabled={emailPending}>
              {emailPending ? "Sending…" : "Change email"}
            </Button>
          </div>
          <ActionMessage state={emailState} />
        </form>
      </SettingsSection>

      <SettingsSection
        title="Password"
        description="Change the password used for email/password sign-in."
      >
        <form action={passwordAction} className="flex max-w-xl flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="revokeOtherSessions"
              className="size-4 rounded border-input"
            />
            Sign out other sessions after changing password
          </label>
          <div>
            <Button type="submit" disabled={passwordPending}>
              {passwordPending ? "Changing…" : "Change password"}
            </Button>
          </div>
          <ActionMessage state={passwordState} />
        </form>
      </SettingsSection>

      <SettingsSection
        title="Delete account"
        description="This permanently deletes your dashboard account and owned project data."
        danger
      >
        <form action={deleteAction} className="flex max-w-xl flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-password">Current password</Label>
            <Input
              id="delete-password"
              name="password"
              type="password"
              autoComplete="current-password"
            />
            <p className="text-xs text-muted-foreground">
              Required for password accounts. GitHub-only accounts can leave
              this empty.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-confirmation">Type DELETE to confirm</Label>
            <Input
              id="delete-confirmation"
              name="confirmation"
              autoComplete="off"
              required
            />
          </div>
          <div>
            <Button type="submit" variant="destructive" disabled={deletePending}>
              {deletePending ? "Sending…" : "Send deletion confirmation"}
            </Button>
          </div>
          <ActionMessage state={deleteState} />
        </form>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  danger,
  children,
}: {
  title: string;
  description: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <SectionHeader title={title} description={description} />
      <div className={danger ? "border-t border-destructive/20 pt-4" : ""}>
        {children}
      </div>
    </section>
  );
}

function ActionMessage({ state }: { state: AuthState }) {
  if (state.error) {
    return <p className="text-sm text-destructive">{state.error}</p>;
  }
  if (state.message) {
    return <p className="text-sm text-muted-foreground">{state.message}</p>;
  }
  return null;
}

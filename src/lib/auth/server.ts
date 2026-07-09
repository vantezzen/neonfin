import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as authSchema from "@/db/auth-schema";
import { buttonEmailHtml, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

const config = env();
const githubConfigured = Boolean(
  config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET,
);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your vantezzen/pay password",
        text: `Reset your vantezzen/pay password:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
        html: buttonEmailHtml({
          title: "Reset your password",
          intro: "Use this link to choose a new vantezzen/pay password.",
          buttonLabel: "Reset password",
          buttonUrl: url,
          outro: "If you did not request this, you can ignore this email.",
        }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your vantezzen/pay email",
        text: `Verify your vantezzen/pay email:\n\n${url}\n\nThis link expires in 24 hours.`,
        html: buttonEmailHtml({
          title: "Verify your email",
          intro: "Confirm this email address to finish signing in to vantezzen/pay.",
          buttonLabel: "Verify email",
          buttonUrl: url,
          outro: "This link expires in 24 hours.",
        }),
      });
    },
  },
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Confirm your vantezzen/pay email change",
          text: `Confirm changing your vantezzen/pay email to ${newEmail}:\n\n${url}\n\nIf you did not request this, secure your account.`,
          html: buttonEmailHtml({
            title: "Confirm your email change",
            intro: `Confirm changing your vantezzen/pay email to ${newEmail}.`,
            buttonLabel: "Confirm email change",
            buttonUrl: url,
            outro: "If you did not request this, secure your account.",
          }),
        });
      },
    },
    deleteUser: {
      enabled: true,
      deleteTokenExpiresIn: 60 * 60 * 24,
      sendDeleteAccountVerification: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Confirm vantezzen/pay account deletion",
          text: `Confirm deleting your vantezzen/pay account:\n\n${url}\n\nThis permanently deletes your account and owned project data.`,
          html: buttonEmailHtml({
            title: "Confirm account deletion",
            intro: "Open this link to permanently delete your vantezzen/pay account and owned project data.",
            buttonLabel: "Delete account",
            buttonUrl: url,
            outro: "Ignore this email if you want to keep your account.",
          }),
        });
      },
    },
  },
  ...(githubConfigured
    ? {
        socialProviders: {
          github: {
            clientId: config.GITHUB_CLIENT_ID!,
            clientSecret: config.GITHUB_CLIENT_SECRET!,
          },
        },
      }
    : {}),
  databaseHooks: {
    user: {
      create: {
        // Enforce the signup toggle at the source so it also covers direct
        // hits to /api/auth/sign-up. The first account is always allowed so a
        // fresh self-hosted instance can bootstrap.
        before: async (userData) => {
          if (!config.PAY_ALLOW_SIGNUPS) {
            const [{ count }] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(authSchema.user);
            if (count > 0) {
              throw new APIError("FORBIDDEN", {
                message: "Signups are disabled on this instance",
              });
            }
          }
          return { data: userData };
        },
      },
    },
  },
  // Must be the last plugin: lets auth.api.* set cookies in Server Actions.
  plugins: [nextCookies()],
});

export function githubSignInEnabled(): boolean {
  return githubConfigured;
}

export type Session = typeof auth.$Infer.Session;

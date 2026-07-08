import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as authSchema from "@/db/auth-schema";
import { env } from "@/lib/env";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  secret: env().BETTER_AUTH_SECRET,
  baseURL: env().BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // No email verification for a dev tool by default; keep sign-in immediate.
    requireEmailVerification: false,
  },
  databaseHooks: {
    user: {
      create: {
        // Enforce the signup toggle at the source so it also covers direct
        // hits to /api/auth/sign-up. The first account is always allowed so a
        // fresh self-hosted instance can bootstrap.
        before: async (userData) => {
          if (!env().PAY_ALLOW_SIGNUPS) {
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

export type Session = typeof auth.$Infer.Session;

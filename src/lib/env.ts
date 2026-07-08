import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PAY_ENCRYPTION_KEY: z
    .string()
    .min(1, "PAY_ENCRYPTION_KEY is required (base64, 32 bytes)"),
  // Signs better-auth sessions.
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "BETTER_AUTH_SECRET must be at least 16 chars"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  // Set to "false" on a private self-hosted instance to lock down signups
  // (the very first user is always allowed, to bootstrap an empty DB).
  PAY_ALLOW_SIGNUPS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

let cached: z.infer<typeof schema> | null = null;

/**
 * Validated, server-only environment. Parsed lazily on first access so the
 * module can be imported in contexts (e.g. build) where secrets are absent.
 */
export function env(): z.infer<typeof schema> {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

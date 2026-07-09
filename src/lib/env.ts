import "server-only";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PAY_PROVIDER_SERVICE_URL: optionalUrl,
  PAY_PROVIDER_SERVICE_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().min(16).optional(),
  ),
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
  // Transactional email for auth flows and wallet recovery.
  RESEND_API_KEY: optionalString,
  RESEND_FROM: optionalString,
  // Optional GitHub OAuth for dashboard sign-in.
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  // Hosted vantezzen/pay billing is opt-in. Self-hosted installs stay unbilled
  // unless an operator deliberately sets this to "hosted".
  PAY_BILLING_MODE: z.enum(["self_hosted", "hosted"]).default("self_hosted"),
  PAY_HOSTED_PAY_SECRET_KEY: optionalString,
  PAY_ALL_ACCESS_EMAILS: optionalString,
  PAY_ALL_ACCESS_USER_IDS: optionalString,
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_HOSTED_PAY_URL: optionalUrl,
  NEXT_PUBLIC_HOSTED_PAY_KEY: optionalString,
});

let cached: z.infer<typeof schema> | null = null;
let warnedProviderOnlySecrets = false;

const providerOnlyEnv = [
  "PAY_ENCRYPTION_KEY",
  "PAY_SECRETS_PROVIDER",
  "PAY_PROVIDER_SERVICE_PORT",
  "VAULT_ADDR",
  "VAULT_TOKEN",
  "VAULT_TRANSIT_MOUNT",
  "VAULT_TRANSIT_KEY",
];

function warnProviderOnlyEnv() {
  if (warnedProviderOnlySecrets) return;
  warnedProviderOnlySecrets = true;

  const present = providerOnlyEnv.filter((key) => process.env[key]);
  if (present.length === 0) return;

  console.warn(
    `[vantezzen/pay] Provider-service-only env vars are present in the Next.js service: ${present.join(
      ", ",
    )}. Move them to services/provider/.env or the provider service deployment.`,
  );
}

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
  warnProviderOnlyEnv();
  cached = parsed.data;
  return cached;
}

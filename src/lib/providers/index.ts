import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providerAccounts, type ProviderAccount } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { PolarProvider } from "./polar";
import { StripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export type { PaymentProvider, NormalizedEvent } from "./types";

/** Instantiate a live provider client from a stored (encrypted) account. */
export function getProvider(account: ProviderAccount): PaymentProvider {
  const secretKey = decryptSecret(account.secretKeyEnc);
  const webhookSecret = account.webhookSecretEnc
    ? decryptSecret(account.webhookSecretEnc)
    : null;
  switch (account.provider) {
    case "stripe":
      return new StripeProvider(secretKey, webhookSecret);
    case "polar":
      return new PolarProvider(secretKey, webhookSecret, account.environment);
    default:
      throw new Error(`Unknown provider: ${account.provider}`);
  }
}

export async function getProviderAccount(
  id: string,
): Promise<ProviderAccount | undefined> {
  return db.query.providerAccounts.findFirst({
    where: eq(providerAccounts.id, id),
  });
}

/** All accounts for a provider - the webhook route tries each until one verifies. */
export async function listAccountsByProvider(
  provider: "stripe" | "polar",
): Promise<ProviderAccount[]> {
  return db.query.providerAccounts.findMany({
    where: eq(providerAccounts.provider, provider),
  });
}

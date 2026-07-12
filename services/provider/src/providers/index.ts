import type { ProviderName, PaymentProvider } from "../contract";
import type { ProviderAccount } from "../db/schema";
import { decryptSecret, type SecretPurpose } from "../secrets";
import {
  PolarProvider,
  normalizePolarEvent,
  verifyPolarWebhook,
} from "./adapters/polar";
import {
  StripeProvider,
  normalizeStripeEvent,
  verifyStripeWebhook,
} from "./adapters/stripe";

function secretContext(row: ProviderAccount, purpose: SecretPurpose) {
  return { accountId: row.id, provider: row.provider, purpose };
}

/** Build a provider adapter from a name + credentials (no DB row required). */
export function makeProvider(
  provider: ProviderName,
  secretKey: string,
  environment: string,
): PaymentProvider {
  return provider === "stripe"
    ? new StripeProvider(secretKey)
    : new PolarProvider(secretKey, environment);
}

export async function providerApi(
  row: ProviderAccount,
): Promise<PaymentProvider> {
  const secretKey = await decryptSecret(
    row.secretKeyEnc,
    secretContext(row, "provider_api_key"),
  );
  return makeProvider(row.provider, secretKey, row.environment);
}

export async function verifyWebhook(
  row: ProviderAccount,
  rawBody: string,
  headers: Headers,
) {
  if (!row.webhookSecretEnc) {
    throw new Error("Webhook secret is not configured");
  }
  const webhookSecret = await decryptSecret(
    row.webhookSecretEnc,
    secretContext(row, "webhook_secret"),
  );
  return row.provider === "stripe"
    ? verifyStripeWebhook(rawBody, headers, webhookSecret)
    : verifyPolarWebhook(rawBody, headers, webhookSecret);
}

export function normalizeWebhook(
  provider: ProviderName,
  payload: unknown,
  providerEventId: string,
) {
  return provider === "stripe"
    ? normalizeStripeEvent(payload as never)
    : normalizePolarEvent(payload as never, providerEventId);
}

export { secretContext };

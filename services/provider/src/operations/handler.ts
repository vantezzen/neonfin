import { eq } from "drizzle-orm";
import {
  eventToWire,
  type ProviderName,
  type ProviderServiceRequest,
} from "../contract";
import { db } from "../db";
import { providerAccounts } from "../db/schema";
import {
  normalizeWebhook,
  providerApi,
  secretContext,
  verifyWebhook,
} from "../providers";
import { encryptSecret } from "../secrets";
import { ProviderInputError } from "./errors";

async function validateCredentials(
  provider: ProviderName,
  secretKey: string,
  environment: string,
) {
  try {
    const api =
      provider === "stripe"
        ? new (await import("../providers/adapters/stripe")).StripeProvider(
            secretKey,
            null,
          )
        : new (await import("../providers/adapters/polar")).PolarProvider(
            secretKey,
            null,
            environment,
          );
    await api.validateCredentials();
  } catch (error) {
    throw new ProviderInputError(
      error instanceof Error
        ? error.message
        : "Provider credentials could not be validated.",
    );
  }
}

async function account(id: string, provider?: ProviderName) {
  const row = await db.query.providerAccounts.findFirst({
    where: eq(providerAccounts.id, id),
  });
  if (!row || (provider && row.provider !== provider)) {
    throw new Error("Provider account not found");
  }
  return row;
}

export async function handleProviderRequest(request: ProviderServiceRequest) {
  switch (request.op) {
    case "create-provider-account": {
      await validateCredentials(
        request.provider,
        request.secretKey,
        request.environment,
      );
      const id = request.accountId;
      const api =
        request.provider === "stripe"
          ? new (await import("../providers/adapters/stripe")).StripeProvider(
              request.secretKey,
              null,
            )
          : new (await import("../providers/adapters/polar")).PolarProvider(
              request.secretKey,
              null,
              request.environment,
            );
      // Webhook permissions are optional for a restricted key. Provision one
      // when possible, but keep the manual wizard as a safe fallback.
      let webhookSecret: string | null = null;
      try {
        webhookSecret = (await api.createWebhook({ url: request.webhookUrl }))
          .webhookSecret;
      } catch (err) {
        console.warn(
          "[provider-service] webhook auto-provisioning failed, falling back to manual setup:",
          err,
        );
      }
      const secretKeyEnc = await encryptSecret(request.secretKey, {
        accountId: id,
        provider: request.provider,
        purpose: "provider_api_key",
      });
      const [row] = await db
        .insert(providerAccounts)
        .values({
          id,
          ownerId: request.ownerId,
          provider: request.provider,
          label: request.label,
          environment: request.environment,
          secretKeyEnc,
          ...(webhookSecret
            ? {
                webhookSecretEnc: await encryptSecret(webhookSecret, {
                  accountId: id,
                  provider: request.provider,
                  purpose: "webhook_secret",
                }),
              }
            : {}),
        })
        .returning({ id: providerAccounts.id });
      return { id: row.id, webhookConfigured: webhookSecret !== null };
    }
    case "save-webhook-secret": {
      const row = await account(request.accountId);
      await db
        .update(providerAccounts)
        .set({
          webhookSecretEnc: await encryptSecret(
            request.webhookSecret,
            secretContext(row, "webhook_secret"),
          ),
        })
        .where(eq(providerAccounts.id, request.accountId));
      return { ok: true };
    }
    case "update-provider-account": {
      const row = await account(request.accountId);
      const patch: Record<string, unknown> = {
        label: request.label,
        environment: request.environment,
      };
      if (request.secretKey) {
        await validateCredentials(row.provider, request.secretKey, request.environment);
        patch.secretKeyEnc = await encryptSecret(
          request.secretKey,
          secretContext(row, "provider_api_key"),
        );
      }
      if (request.webhookSecret) {
        patch.webhookSecretEnc = await encryptSecret(
          request.webhookSecret,
          secretContext(row, "webhook_secret"),
        );
      }
      await db
        .update(providerAccounts)
        .set(patch)
        .where(eq(providerAccounts.id, request.accountId));
      return { ok: true };
    }
    case "delete-provider-account":
      await db
        .delete(providerAccounts)
        .where(eq(providerAccounts.id, request.accountId));
      return { ok: true };
    case "create-product": {
      const provider = await providerApi(await account(request.accountId));
      if (!provider.createProduct) {
        throw new Error("Provider cannot create shared products");
      }
      return provider.createProduct(request.input);
    }
    case "create-price":
      return (await providerApi(await account(request.accountId))).createPrice(
        request.input,
      );
    case "create-checkout":
      return (await providerApi(await account(request.accountId))).createCheckout(
        request.input,
      );
    case "get-portal-url": {
      const url = await (
        await providerApi(await account(request.accountId))
      ).getPortalUrl(request.customerId, request.returnUrl);
      return { url };
    }
    case "verify-webhook": {
      const event = await verifyWebhook(
        await account(request.accountId, request.provider),
        request.rawBody,
        new Headers(request.headers),
      );
      return { event: eventToWire(event) };
    }
    case "normalize-webhook": {
      const event = normalizeWebhook(
        request.provider,
        request.payload,
        request.providerEventId,
      );
      return { event: eventToWire(event) };
    }
  }
}

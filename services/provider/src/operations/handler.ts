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
import { createId } from "../utils/id";

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
      const id = createId("prov");
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
        })
        .returning({ id: providerAccounts.id });
      return { id: row.id };
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

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providerAccounts, type Provider } from "@/db/schema";
import { env } from "@/lib/env";
import {
  eventFromWire,
  type CreateCheckoutInput,
  type CreatePriceInput,
  type CreateProductInput,
  type NormalizedEvent,
  type ProviderServiceData,
  type ProviderServiceRequest,
  type ProviderServiceResponse,
} from "./types";

export type ProviderAccountMeta = {
  id: string;
  provider: Provider;
  label: string;
  environment: string;
};

function serviceConfig() {
  const { PAY_PROVIDER_SERVICE_URL, PAY_PROVIDER_SERVICE_SECRET } = env();
  if (!PAY_PROVIDER_SERVICE_URL || !PAY_PROVIDER_SERVICE_SECRET) {
    throw new Error(
      "PAY_PROVIDER_SERVICE_URL and PAY_PROVIDER_SERVICE_SECRET are required for provider operations",
    );
  }
  return { url: PAY_PROVIDER_SERVICE_URL, secret: PAY_PROVIDER_SERVICE_SECRET };
}

async function callProviderService<T extends ProviderServiceRequest["op"]>(
  request: ProviderServiceRequest & { op: T },
): Promise<ProviderServiceData<T>> {
  const { url, secret } = serviceConfig();
  const res = await fetch(new URL("/internal/provider", url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const data = (await res.json().catch(() => null)) as
    | ProviderServiceResponse<T>
    | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.ok === false ? data.error : "Provider service failed");
  }
  return data.data;
}

export async function getProviderAccountMeta(
  id: string,
): Promise<ProviderAccountMeta | undefined> {
  return db.query.providerAccounts.findFirst({
    where: eq(providerAccounts.id, id),
    columns: {
      id: true,
      provider: true,
      label: true,
      environment: true,
    },
  });
}

export async function createProviderAccount(input: {
  accountId: string;
  ownerId: string;
  provider: Provider;
  label: string;
  environment: string;
  secretKey: string;
  webhookUrl: string;
}) {
  return callProviderService({ op: "create-provider-account", ...input });
}

export async function saveProviderWebhookSecret(
  accountId: string,
  webhookSecret: string,
) {
  return callProviderService({
    op: "save-webhook-secret",
    accountId,
    webhookSecret,
  });
}

export async function updateProviderAccountSecret(input: {
  accountId: string;
  label: string;
  environment: string;
  secretKey?: string;
  webhookSecret?: string;
}) {
  return callProviderService({ op: "update-provider-account", ...input });
}

export async function deleteProviderAccountSecret(accountId: string) {
  return callProviderService({ op: "delete-provider-account", accountId });
}

export async function createProviderProduct(
  accountId: string,
  input: CreateProductInput,
) {
  return callProviderService({ op: "create-product", accountId, input });
}

export async function createProviderPrice(
  accountId: string,
  input: CreatePriceInput,
) {
  return callProviderService({ op: "create-price", accountId, input });
}

export async function createProviderCheckout(
  accountId: string,
  input: CreateCheckoutInput,
) {
  return callProviderService({ op: "create-checkout", accountId, input });
}

export async function getProviderPortalUrl(
  accountId: string,
  customerId: string,
  returnUrl: string,
) {
  const { url } = await callProviderService({
    op: "get-portal-url",
    accountId,
    customerId,
    returnUrl,
  });
  return url;
}

export async function verifyProviderWebhook(input: {
  accountId: string;
  provider: Provider;
  rawBody: string;
  headers: Headers;
}): Promise<NormalizedEvent> {
  const headers = Object.fromEntries(input.headers.entries());
  const { event } = await callProviderService({
    op: "verify-webhook",
    accountId: input.accountId,
    provider: input.provider,
    rawBody: input.rawBody,
    headers,
  });
  return eventFromWire(event);
}

export async function normalizeProviderWebhook(input: {
  provider: Provider;
  payload: unknown;
  providerEventId: string;
}): Promise<NormalizedEvent> {
  const { event } = await callProviderService({
    op: "normalize-webhook",
    provider: input.provider,
    payload: input.payload,
    providerEventId: input.providerEventId,
  });
  return eventFromWire(event);
}

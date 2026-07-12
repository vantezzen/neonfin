"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { products } from "@/db/schema";
import { createId } from "@/lib/id";
import { env } from "@/lib/env";
import { requireUser, requireOwnedProviderAccount } from "@/lib/auth/dal";
import {
  createProviderAccount,
  deleteProviderAccountSecret,
  saveProviderWebhookSecret,
  updateProviderAccountSecret,
} from "@/lib/provider-service/client";
import { actionError, type FormState } from "./state";

const input = z.object({
  provider: z.enum(["stripe", "polar"]),
  label: z.string().min(1),
  secretKey: z.string().min(1),
  webhookSecret: z.string().optional(),
  environment: z.enum(["production", "sandbox"]).default("sandbox"),
});

const updateInput = z.object({
  label: z.string().trim().min(1),
  environment: z.enum(["production", "sandbox"]),
  secretKey: z.string().min(1).optional(),
  webhookSecret: z.string().min(1).optional(),
});

type ProviderEnvironment = "production" | "sandbox";

function environmentFromStripeKey(
  secretKey: string,
): ProviderEnvironment | undefined {
  if (secretKey.startsWith("rk_test_") || secretKey.startsWith("sk_test_")) {
    return "sandbox";
  }
  if (secretKey.startsWith("rk_live_") || secretKey.startsWith("sk_live_")) {
    return "production";
  }
}

function providerEnvironment(
  provider: "stripe" | "polar",
  secretKey: string | undefined,
  selectedEnvironment: ProviderEnvironment,
): ProviderEnvironment {
  return provider === "stripe" && secretKey
    ? environmentFromStripeKey(secretKey) ?? selectedEnvironment
    : selectedEnvironment;
}

export type ConnectState = {
  error?: string;
  accountId?: string;
  provider?: "stripe" | "polar";
  environment?: ProviderEnvironment;
  webhookConfigured?: boolean;
};

/** Create and validate a provider account, provisioning a webhook when allowed. */
export async function connectProviderStart(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const user = await requireUser();
  try {
    const parsed = input.omit({ webhookSecret: true }).parse({
      provider: formData.get("provider"),
      label: formData.get("label"),
      secretKey: formData.get("secretKey"),
      environment: formData.get("environment") || "sandbox",
    });
    const environment = providerEnvironment(
      parsed.provider,
      parsed.secretKey,
      parsed.environment,
    );
    const accountId = createId("prov");
    const row = await createProviderAccount({
      accountId,
      ownerId: user.id,
      provider: parsed.provider,
      label: parsed.label,
      environment,
      secretKey: parsed.secretKey,
      webhookUrl: new URL(
        `/api/webhooks/${parsed.provider}/${accountId}`,
        env().NEXT_PUBLIC_APP_URL,
      ).toString(),
    });
    if (row.webhookConfigured) {
      revalidatePath("/dashboard/providers");
      revalidatePath("/dashboard");
    }
    return {
      accountId: row.id,
      provider: parsed.provider,
      environment,
      webhookConfigured: row.webhookConfigured,
    };
  } catch (e) {
    const s = actionError(e);
    return { error: s.error };
  }
}

/** Wizard final step: attach the webhook signing secret to an account. */
export async function saveWebhookSecret(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const account = await requireOwnedProviderAccount(id);
  try {
    const secret = String(formData.get("webhookSecret") ?? "").trim();
    if (!secret) return { error: "Paste the webhook signing secret" };
    if (account.provider === "stripe" && !/^whsec_/.test(secret)) {
      return {
        error:
          "That doesn't look like a signing secret (Stripe secrets start with whsec_). Copy it from the webhook endpoint you just created.",
      };
    }
    await saveProviderWebhookSecret(id, secret);
    revalidatePath("/dashboard/providers");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function updateProviderAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const account = await requireOwnedProviderAccount(id);
  try {
    const rawSecret = String(formData.get("secretKey") ?? "").trim();
    const rawWebhook = String(formData.get("webhookSecret") ?? "").trim();
    // Only overwrite secrets when a new value is supplied - blank means "keep".
    const parsed = updateInput.parse({
      label: formData.get("label"),
      environment: formData.get("environment") ?? "production",
      secretKey: rawSecret || undefined,
      webhookSecret: rawWebhook || undefined,
    });
    const environment = providerEnvironment(
      account.provider,
      parsed.secretKey,
      parsed.environment,
    );
    await updateProviderAccountSecret({
      accountId: id,
      label: parsed.label,
      environment,
      ...(parsed.secretKey ? { secretKey: parsed.secretKey } : {}),
      ...(parsed.webhookSecret ? { webhookSecret: parsed.webhookSecret } : {}),
    });
    revalidatePath("/dashboard/providers");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteProviderAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const id = String(formData.get("id"));
    await requireOwnedProviderAccount(id);
    // products.providerAccountId is ON DELETE RESTRICT - surface a friendly
    // notice instead of letting the FK violation crash the action.
    const attached = await db.query.products.findFirst({
      where: eq(products.providerAccountId, id),
      columns: { id: true },
    });
    if (attached) {
      return {
        error:
          "Detach this provider from its products before removing the account.",
      };
    }
    await deleteProviderAccountSecret(id);
    revalidatePath("/dashboard/providers");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { products } from "@/db/schema";
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
  environment: z.enum(["production", "sandbox"]).default("production"),
});

export type ConnectState = {
  error?: string;
  accountId?: string;
  provider?: "stripe" | "polar";
};

/** Wizard step 1: create the account (no webhook yet) and return its id so the
 * next step can show the account-specific webhook URL. */
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
      environment: formData.get("environment") || "production",
    });
    const row = await createProviderAccount({
      ownerId: user.id,
      provider: parsed.provider,
      label: parsed.label,
      environment: parsed.environment,
      secretKey: parsed.secretKey,
    });
    // Intentionally NOT revalidating here: this runs mid-wizard (step 0 → 1).
    // Revalidating /dashboard/providers would re-render the accounts section and
    // remount the open ProviderConnectWizard (empty-state → list branch swap),
    // closing the dialog before the webhook instructions ever show. The account
    // is incomplete until saveWebhookSecret, which revalidates.
    return { accountId: row.id, provider: parsed.provider };
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
  await requireOwnedProviderAccount(id);
  try {
    const secret = String(formData.get("webhookSecret") ?? "").trim();
    if (!secret) return { error: "Paste the webhook signing secret" };
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
  await requireOwnedProviderAccount(id);
  try {
    const label = String(formData.get("label") ?? "").trim();
    const environment = String(formData.get("environment") ?? "production");
    const secretKey = String(formData.get("secretKey") ?? "");
    const webhookSecret = String(formData.get("webhookSecret") ?? "");

    // Only overwrite secrets when a new value is supplied - blank means "keep".
    await updateProviderAccountSecret({
      accountId: id,
      label,
      environment,
      ...(secretKey ? { secretKey } : {}),
      ...(webhookSecret ? { webhookSecret } : {}),
    });
    revalidatePath("/dashboard/providers");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteProviderAccount(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  await requireOwnedProviderAccount(id);
  // products.providerAccountId is ON DELETE RESTRICT - surface a friendly
  // notice instead of letting the FK violation crash the action.
  const attached = await db.query.products.findFirst({
    where: eq(products.providerAccountId, id),
    columns: { id: true },
  });
  if (attached) redirect("/dashboard/providers?error=account-in-use");
  await deleteProviderAccountSecret(id);
  revalidatePath("/dashboard/providers");
  revalidatePath("/dashboard");
}

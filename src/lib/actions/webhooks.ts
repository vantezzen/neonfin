"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { providerAccounts, webhookEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { processNormalizedEvent } from "@/lib/fulfillment";
import { normalizeProviderWebhook } from "@/lib/provider-service/client";

export async function replayWebhookEvent(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const event = await db.query.webhookEvents.findFirst({
    where: eq(webhookEvents.id, id),
  });
  if (!event?.providerAccountId) return;

  const account = await db.query.providerAccounts.findFirst({
    where: and(
      eq(providerAccounts.id, event.providerAccountId),
      eq(providerAccounts.ownerId, user.id),
    ),
    columns: {
      id: true,
      provider: true,
      ownerId: true,
      label: true,
      environment: true,
      createdAt: true,
    },
  });
  if (!account) return;

  try {
    const normalized = await normalizeProviderWebhook({
      provider: account.provider,
      payload: event.payload,
      providerEventId: event.providerEventId,
    });
    const status = await processNormalizedEvent(normalized, account.id);
    await db
      .update(webhookEvents)
      .set({ status, error: null })
      .where(eq(webhookEvents.id, event.id));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ status: "error", error: String(err) })
      .where(eq(webhookEvents.id, event.id));
  }

  revalidatePath("/dashboard/webhooks");
}

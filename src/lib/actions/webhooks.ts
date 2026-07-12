"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { providerAccounts, webhookEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { processNormalizedEvent } from "@/lib/fulfillment";
import { normalizeProviderWebhook } from "@/lib/provider-service/client";
import { actionError, type FormState } from "./state";

export async function replayWebhookEvent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const user = await requireUser();
    const id = String(formData.get("id") ?? "");
    const event = await db.query.webhookEvents.findFirst({
      where: eq(webhookEvents.id, id),
    });
    if (!event?.providerAccountId) return { error: "Webhook event not found" };

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
    if (!account) return { error: "Webhook event not found" };

    let outcome: "processed" | "skipped";
    try {
      const normalized = await normalizeProviderWebhook({
        provider: account.provider,
        payload: event.payload,
        providerEventId: event.providerEventId,
      });
      const status = await processNormalizedEvent(normalized, account.id);
      outcome = status;
      await db
        .update(webhookEvents)
        .set({ status, error: null })
        .where(eq(webhookEvents.id, event.id));
    } catch (err) {
      await db
        .update(webhookEvents)
        .set({ status: "error", error: String(err) })
        .where(eq(webhookEvents.id, event.id));
      return { error: "Replay failed. The event is marked with the details." };
    }

    revalidatePath("/dashboard/webhooks");
    return {
      ok: true,
      message:
        outcome === "processed"
          ? "Webhook processed"
          : "Webhook skipped (already fulfilled)",
    };
  } catch (e) {
    return actionError(e);
  }
}

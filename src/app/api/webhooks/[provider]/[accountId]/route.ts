import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { processNormalizedEvent } from "@/lib/fulfillment";
import { getProvider, getProviderAccount } from "@/lib/providers";

// Provider-specific signature header.
const SIG_HEADER: Record<string, string> = {
  stripe: "stripe-signature",
  polar: "webhook-signature",
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string; accountId: string }> },
): Promise<Response> {
  const { provider, accountId } = await ctx.params;

  const account = await getProviderAccount(accountId);
  if (!account || account.provider !== provider) {
    return Response.json(
      { error: "Unknown webhook endpoint" },
      { status: 404 },
    );
  }

  const signature = req.headers.get(SIG_HEADER[provider] ?? "");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }
  const rawBody = await req.text();

  // Verify against exactly this account's secret - no brute-forcing tenants.
  let event;
  try {
    event = await getProvider(account).verifyAndNormalize(rawBody, req.headers);
  } catch {
    return Response.json(
      { error: "Signature verification failed" },
      { status: 400 },
    );
  }

  // Idempotency: unique (providerAccountId, provider, providerEventId). Claim
  // the row as `pending` first; only a row that already reached a terminal
  // *success* state (processed/skipped) short-circuits. A row still
  // `pending`/`error` means a previous delivery failed mid-fulfillment, so we
  // reprocess on the retry instead of acking a duplicate and silently dropping
  // the credit grant.
  const [inserted] = await db
    .insert(webhookEvents)
    .values({
      providerAccountId: account.id,
      provider: account.provider,
      providerEventId: event.providerEventId,
      type: event.rawType,
      payload: JSON.parse(rawBody),
      status: "pending",
    })
    .onConflictDoNothing({
      target: [
        webhookEvents.providerAccountId,
        webhookEvents.provider,
        webhookEvents.providerEventId,
      ],
    })
    .returning({ id: webhookEvents.id });

  let eventRowId: string;
  if (inserted) {
    eventRowId = inserted.id;
  } else {
    const existing = await db.query.webhookEvents.findFirst({
      where: and(
        eq(webhookEvents.providerAccountId, account.id),
        eq(webhookEvents.provider, account.provider),
        eq(webhookEvents.providerEventId, event.providerEventId),
      ),
      columns: { id: true, status: true },
    });
    // Lost the insert race but can't read the row back → let the provider retry.
    if (!existing) {
      return Response.json({ error: "Try again" }, { status: 503 });
    }
    if (existing.status === "processed" || existing.status === "skipped") {
      return Response.json({ received: true, duplicate: true });
    }
    eventRowId = existing.id;
  }

  try {
    const status = await processNormalizedEvent(event, account.id);
    await db
      .update(webhookEvents)
      .set({ status: status === "skipped" ? "skipped" : "processed", error: null })
      .where(eq(webhookEvents.id, eventRowId));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ status: "error", error: String(err) })
      .where(eq(webhookEvents.id, eventRowId));
    return Response.json({ error: "Fulfillment failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}

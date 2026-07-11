import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { providerAccounts, webhookEvents } from "@/db/schema";
import { getSession } from "@/lib/auth/dal";

/** Return a raw provider payload only to the developer who owns the account. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const [event] = await db
    .select({ payload: webhookEvents.payload })
    .from(webhookEvents)
    .innerJoin(
      providerAccounts,
      eq(webhookEvents.providerAccountId, providerAccounts.id),
    )
    .where(
      and(
        eq(webhookEvents.id, id),
        eq(providerAccounts.ownerId, session.user.id),
      ),
    )
    .limit(1);
  if (!event) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(event, { headers: { "Cache-Control": "no-store" } });
}

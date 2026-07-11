import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import {
  apiError,
  authenticate,
  corsHeaders,
  invalidBodyError,
  preflight,
} from "@/lib/api/http";
import { z } from "zod";

export function OPTIONS(): Response {
  return preflight();
}

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

type Cursor = { createdAt: string; id: string };

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed?.createdAt !== "string" ||
      Number.isNaN(new Date(parsed.createdAt).valueOf()) ||
      typeof parsed?.id !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function encodeCursor(order: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: order.createdAt.toISOString(), id: order.id }),
  ).toString("base64url");
}

/** List recent project orders using stable cursor pagination. */
export async function GET(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) return invalidBodyError(parsed.error, cors);

  const cursor = decodeCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursor) {
    return apiError(400, "invalid_body", "Invalid cursor", cors, {
      details: [{ path: "cursor", message: "Invalid cursor" }],
    });
  }
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const expiryCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.query.orders.findMany({
    where: cursor && cursorDate
      ? and(
          eq(orders.projectId, project.id),
          or(
            lt(orders.createdAt, cursorDate),
            and(eq(orders.createdAt, cursorDate), lt(orders.id, cursor.id)),
          ),
        )
      : eq(orders.projectId, project.id),
    orderBy: [desc(orders.createdAt), desc(orders.id)],
    limit: parsed.data.limit + 1,
  });
  // Provider checkout sessions are short lived. Expire stale rows that this
  // response exposes without turning every poll into an empty database write.
  const staleIds = rows
    .filter(
      (order) =>
        order.status === "pending" && order.createdAt < expiryCutoff,
    )
    .map((order) => order.id);
  const expiredIds = staleIds.length > 0
    ? await db
      .update(orders)
      .set({ status: "expired" })
      .where(and(inArray(orders.id, staleIds), eq(orders.status, "pending")))
      .returning({ id: orders.id })
    : [];
  const staleIdSet = new Set(expiredIds.map((order) => order.id));
  const hasMore = rows.length > parsed.data.limit;
  const items = rows.slice(0, parsed.data.limit);
  const last = items.at(-1);

  return Response.json(
    {
      orders: items.map((order) => ({
        id: order.id,
        status: staleIdSet.has(order.id) ? "expired" : order.status,
        amountCents: order.amountCents,
        currency: order.currency,
        productId: order.productIdSnapshot,
        priceId: order.priceId,
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
      })),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    },
    { headers: { ...cors, "Cache-Control": "no-store" } },
  );
}

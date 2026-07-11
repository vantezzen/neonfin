import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { creditBalances, orders, prices } from "@/db/schema";
import { authenticate, corsHeaders, apiError, preflight } from "@/lib/api/http";
import { toNum } from "@/lib/credits";

export function OPTIONS(): Response {
  return preflight();
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ ref: string }> },
): Promise<Response> {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);

  const { ref } = await ctx.params;
  const order = await db.query.orders.findFirst({
    where: and(
      eq(orders.projectId, project.id),
      or(eq(orders.id, ref), eq(orders.providerCheckoutId, ref)),
    ),
  });
  if (!order) return apiError(404, "order_not_found", "Order not found", cors);

  // Provider checkout sessions are short lived. Resolve an abandoned attempt
  // when it is observed so API clients never poll forever.
  const expired =
    order.status === "pending" &&
    order.createdAt < new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (expired) {
    await db
      .update(orders)
      .set({ status: "expired" })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending")));
  }

  // Surface the issued code + resulting product balance once fulfilled, so the
  // SDK can poll and continue.
  let balance: number | null = null;
  if (order.walletId && (order.productIdSnapshot || order.priceId)) {
    const productId =
      order.productIdSnapshot ??
      (
        await db.query.prices.findFirst({
          where: eq(prices.id, order.priceId!),
          columns: { productId: true },
        })
      )?.productId;
    if (productId) {
      const [row] = await db
        .select({ balance: creditBalances.balance })
        .from(creditBalances)
        .where(
          and(
            eq(creditBalances.walletId, order.walletId),
            eq(creditBalances.productId, productId),
          ),
        );
      if (row) balance = toNum(row.balance);
    }
  }

  return Response.json(
    {
      id: order.id,
      status: expired ? "expired" : order.status,
      code: order.issuedCode,
      balance,
      amountCents: order.amountCents,
      currency: order.currency,
      productId: order.productIdSnapshot,
      priceId: order.priceId,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
    },
    { headers: { ...cors, "Cache-Control": "no-store" } },
  );
}

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditBalances, orders, prices } from "@/db/schema";
import { toNum } from "@/lib/credits";

/**
 * Internal poll endpoint for the hosted success page. No API key: the random
 * order id is itself the capability. Returns just enough to render the code.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const { orderId } = await ctx.params;
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });

  const price = order.priceId
    ? await db.query.prices.findFirst({
        where: eq(prices.id, order.priceId),
        with: {
          product: { columns: { id: true, name: true, creditUnit: true } },
        },
      })
    : null;
  let balance: number | null = null;
  let creditUnit: string | null = null;
  if (order.walletId && (order.productIdSnapshot || order.priceId)) {
    const productId = order.productIdSnapshot ?? price?.product.id;
    if (productId) {
      creditUnit = order.creditUnitSnapshot ?? price?.product.creditUnit ?? null;
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

  return Response.json({
    status: order.status,
    code: order.issuedCode,
    balance,
    creditUnit,
    productName: price?.product.name ?? null,
    amountCents: order.amountCents,
    currency: order.currency,
    creditsGranted:
      order.creditsGrantedSnapshot != null
        ? toNum(order.creditsGrantedSnapshot)
        : price
          ? toNum(price.creditsGranted)
          : null,
  });
}

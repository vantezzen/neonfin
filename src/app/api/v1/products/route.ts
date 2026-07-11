import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { prices, products } from "@/db/schema";
import { authenticate, corsHeaders, preflight } from "@/lib/api/http";
import { toNum } from "@/lib/credits";

export function OPTIONS(): Response {
  return preflight();
}

/**
 * Public product catalog for a project. Returns active products and their
 * purchasable prices (active + synced to the provider), for the SDK to render
 * purchase options. Publishable-key readable.
 */
export async function GET(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);

  const rows = await db.query.products.findMany({
    where: and(eq(products.projectId, project.id), eq(products.active, true)),
    orderBy: [asc(products.createdAt)],
    with: {
      prices: {
        where: eq(prices.active, true),
        orderBy: [asc(prices.amountCents)],
      },
    },
  });

  const catalog = rows.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    type: product.type,
    creditUnit: product.creditUnit,
    freeGrant: product.freeGrant,
    prices: product.prices
      // A price without a provider id can't be checked out yet - hide it.
      .filter((p) => p.providerPriceId)
      .map((p) => ({
        id: p.id,
        label: p.label,
        amountCents: p.amountCents,
        currency: p.currency,
        creditsGranted: toNum(p.creditsGranted),
        features: p.features,
        interval: p.interval,
      })),
  }));

  return Response.json(
    { products: catalog },
    { headers: { ...cors, "Cache-Control": "public, max-age=60" } },
  );
}

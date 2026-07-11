import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, wallets } from "@/db/schema";
import { env } from "@/lib/env";
import { authenticate, corsHeaders, apiError, invalidBodyError, preflight } from "@/lib/api/http";
import { providerErrorMessage } from "@/lib/api/provider-errors";
import {
  getProviderAccountMeta,
  getProviderPortalUrl,
} from "@/lib/provider-service/client";

export function OPTIONS(): Response {
  return preflight();
}

const bodySchema = z.object({
  externalUserId: z.string().min(1),
  returnUrl: z.string().url().optional(),
});

/**
 * Provider customer portal for external-auth wallets. Secret-key only: the app
 * server must verify the logged-in user before passing its own externalUserId.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await authenticate(req, { require: "secret" });
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);
  if (project.mode !== "external_auth") {
    return apiError(
      400,
      "mode_mismatch",
      "This project does not use external auth",
      cors,
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return invalidBodyError(parsed.error, cors);
  }

  const wallet = await db.query.wallets.findFirst({
    where: and(
      eq(wallets.projectId, project.id),
      eq(wallets.kind, "external"),
      eq(wallets.externalUserId, parsed.data.externalUserId),
    ),
  });
  if (!wallet) {
    return apiError(404, "wallet_not_found", "Wallet not found", cors);
  }
  if (!wallet.providerCustomerId) {
    return apiError(
      400,
      "no_billing_customer",
      "This wallet has no billing customer yet",
      cors,
    );
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.walletId, wallet.id),
    orderBy: desc(orders.createdAt),
    with: {
      price: { with: { product: { columns: { providerAccountId: true } } } },
    },
  });
  const providerAccountId = order?.price?.product.providerAccountId;
  if (!providerAccountId) {
    return apiError(
      400,
      "no_billing_customer",
      "No provider account for this wallet",
      cors,
    );
  }

  const account = await getProviderAccountMeta(providerAccountId);
  if (!account) {
    return apiError(
      400,
      "provider_account_missing",
      "Provider account missing",
      cors,
    );
  }

  try {
    const url = await getProviderPortalUrl(
      account.id,
      wallet.providerCustomerId,
      parsed.data.returnUrl ?? env().NEXT_PUBLIC_APP_URL,
    );
    return Response.json({ url }, { headers: cors });
  } catch {
    return apiError(502, "provider_error", providerErrorMessage(), cors);
  }
}

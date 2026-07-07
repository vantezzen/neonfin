import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, type Wallet } from "@/db/schema";
import { env } from "@/lib/env";
import {
  authenticate,
  corsHeaders,
  apiError,
  invalidCodeAttempt,
  preflight,
} from "@/lib/api/http";
import { findActiveCodeWallet, WalletExpiredError } from "@/lib/credits";
import { normalizeCreditCode } from "@/lib/id";
import { getProvider, getProviderAccount } from "@/lib/providers";

export function OPTIONS(): Response {
  return preflight();
}

function returnUrlAllowed(allowedOrigins: string[], url: string): boolean {
  if (allowedOrigins.length === 0) return true;
  try {
    return allowedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

/**
 * Redirect URL to the provider's customer portal (manage subscription / payment
 * methods / invoices). Requires the wallet to have completed a purchase, which
 * is when its provider customer id is captured.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);
  const { code: rawCode } = await ctx.params;
  const code = normalizeCreditCode(rawCode, project.codePrefix);

  let wallet: Wallet | null;
  try {
    wallet = await findActiveCodeWallet(project.id, code);
  } catch (e) {
    if (e instanceof WalletExpiredError)
      return apiError(410, "wallet_expired", "Wallet expired", cors);
    throw e;
  }
  if (!wallet) {
    const limit = await invalidCodeAttempt(project.id, req);
    if (!limit.ok) {
      return apiError(429, "rate_limited", "Too many invalid recovery codes", {
        ...cors,
        "Retry-After": String(limit.retryAfterSec),
      });
    }
    return apiError(404, "wallet_not_found", "Wallet not found", cors);
  }
  if (!wallet.providerCustomerId) {
    return apiError(400, "no_billing_customer", "This wallet has no billing customer yet", cors);
  }

  // The customer lives on whichever provider account fulfilled a purchase for
  // this wallet - find it via the wallet's most recent order's product.
  const order = await db.query.orders.findFirst({
    where: eq(orders.walletId, wallet.id),
    orderBy: desc(orders.createdAt),
    with: {
      price: { with: { product: { columns: { providerAccountId: true } } } },
    },
  });
  const providerAccountId = order?.price?.product.providerAccountId;
  if (!providerAccountId) {
    return apiError(400, "no_billing_customer", "No provider account for this wallet", cors);
  }
  const account = await getProviderAccount(providerAccountId);
  if (!account)
    return apiError(400, "provider_account_missing", "Provider account missing", cors);

  const returnUrl =
    new URL(req.url).searchParams.get("returnUrl") ?? env().NEXT_PUBLIC_APP_URL;
  if (!returnUrlAllowed(project.allowedOrigins, returnUrl)) {
    return apiError(
      400,
      "redirect_origin_not_allowed",
      "returnUrl must be on one of the project's allowed origins",
      cors,
    );
  }
  try {
    const url = await getProvider(account).getPortalUrl(
      wallet.providerCustomerId,
      returnUrl,
    );
    return Response.json({ url }, { headers: cors });
  } catch (err) {
    return apiError(502, "provider_error", `Provider error: ${String(err)}`, cors);
  }
}

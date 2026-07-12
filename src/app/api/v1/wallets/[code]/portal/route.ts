import { type Wallet } from "@/db/schema";
import { env } from "@/lib/env";
import {
  authenticate,
  corsHeaders,
  apiError,
  preflight,
} from "@/lib/api/http";
import {
  portalUrlForWallet,
  walletNotFoundResponse,
} from "@/lib/api/credit-errors";
import { findActiveCodeWallet, WalletExpiredError } from "@/lib/credits";
import { normalizeCreditCode } from "@/lib/id";

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
    return walletNotFoundResponse(project.id, req, cors);
  }
  if (!wallet.providerCustomerId) {
    return apiError(400, "no_billing_customer", "This wallet has no billing customer yet", cors);
  }

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
  const result = await portalUrlForWallet(wallet, returnUrl, cors);
  if (result instanceof Response) return result;
  return Response.json(result, { headers: cors });
}

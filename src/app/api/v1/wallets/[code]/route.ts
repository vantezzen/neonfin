import {
  authenticate,
  corsHeaders,
  apiError,
  invalidCodeAttempt,
  preflight,
} from "@/lib/api/http";
import {
  readWalletByCode,
  WalletExpiredError,
  WalletNotFoundError,
} from "@/lib/credits";
import { normalizeCreditCode } from "@/lib/id";

export function OPTIONS(): Response {
  return preflight();
}

/** Read a wallet's per-product balances by code. */
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

  try {
    const { balances, features, subscriptions } = await readWalletByCode(
      code,
      project.id,
    );
    return Response.json(
      { code, balances, features, subscriptions },
      { headers: cors },
    );
  } catch (e) {
    if (e instanceof WalletNotFoundError) {
      const limit = await invalidCodeAttempt(project.id, req);
      if (!limit.ok) {
        return apiError(429, "rate_limited", "Too many invalid recovery codes", {
          ...cors,
          "Retry-After": String(limit.retryAfterSec),
        });
      }
      return apiError(404, "wallet_not_found", "Wallet not found", cors);
    }
    if (e instanceof WalletExpiredError)
      return apiError(410, "wallet_expired", "Wallet expired", cors);
    throw e;
  }
}

import {
  authenticate,
  clientIp,
  corsHeaders,
  apiError,
  preflight,
} from "@/lib/api/http";
import { consumeToken } from "@/lib/api/rate-limit";
import { createCodeWallet } from "@/lib/credits";

export function OPTIONS(): Response {
  return preflight();
}

/** Create a fresh anonymous wallet → returns its code + per-product balances. */
export async function POST(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);

  if (project.mode !== "credit_codes") {
    return apiError(400, "mode_mismatch", "This project does not use credit codes", cors);
  }

  const hourlyLimit = Math.max(1, project.anonymousWalletsPerHour);
  const limit = await consumeToken(
    `anonymous-wallet:${project.id}:${clientIp(req)}`,
    { capacity: hourlyLimit, refillPerSec: hourlyLimit / 3600 },
  );
  if (!limit.ok) {
    return apiError(429, "rate_limited", "Too many wallets created. Try again later.", {
      ...cors,
      "Retry-After": String(limit.retryAfterSec),
    });
  }

  const { wallet, balances, features, subscriptions } = await createCodeWallet(
    project.id,
  );
  return Response.json(
    { code: wallet.code, balances, features, subscriptions },
    { headers: cors },
  );
}

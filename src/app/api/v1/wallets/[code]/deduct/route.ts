import { z } from "zod";
import {
  authenticate,
  corsHeaders,
  apiError,
  invalidCodeAttempt,
  preflight,
} from "@/lib/api/http";
import {
  deductByCode,
  findActiveCodeWallet,
  soleProductId,
  InsufficientCreditsError,
  ProductNotFoundError,
  WalletExpiredError,
  WalletNotFoundError,
} from "@/lib/credits";
import { normalizeCreditCode } from "@/lib/id";

export function OPTIONS(): Response {
  return preflight();
}

const bodySchema = z.object({
  productId: z.string().optional(),
  amount: z.number().positive(),
  idempotencyKey: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** Deduct credits from a code wallet for a product. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);
  const { code: rawCode } = await ctx.params;
  const code = normalizeCreditCode(rawCode, project.codePrefix);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "invalid_body", parsed.error.issues[0]?.message ?? "Invalid body", cors);
  }

  // Default to the sole product when the caller omits one.
  const productId = parsed.data.productId ?? (await soleProductId(project.id));
  if (!productId) {
    return apiError(400, "product_required", "productId is required (project has multiple products)", cors);
  }

  try {
    const wallet = await findActiveCodeWallet(project.id, code);
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

    const result = await deductByCode(
      code,
      productId,
      parsed.data.amount,
      parsed.data.idempotencyKey,
      parsed.data.meta,
    );
    return Response.json(result, { headers: cors });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return apiError(402, "insufficient_credits", "Insufficient credits", cors, {
        balance: e.balance,
        requested: e.requested,
      });
    }
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
    if (e instanceof ProductNotFoundError)
      return apiError(400, "unknown_product", "Unknown product", cors);
    throw e;
  }
}

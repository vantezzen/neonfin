import { z } from "zod";
import { positiveCreditAmountSchema } from "@/lib/amounts";
import { authenticate, corsHeaders, apiError, invalidBodyError, preflight } from "@/lib/api/http";
import {
  deductByExternalId,
  soleProductId,
  InsufficientCreditsError,
  ProductNotFoundError,
  WalletNotFoundError,
} from "@/lib/credits";

export function OPTIONS(): Response {
  return preflight();
}

const bodySchema = z.object({
  externalUserId: z.string().min(1),
  productId: z.string().optional(),
  amount: positiveCreditAmountSchema,
  idempotencyKey: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Deduct credits from an external-auth wallet, keyed by the app's own user id.
 * Secret-key only: with the user id as the address, a publishable key would let
 * anyone spend anyone's credits.
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

  // Default to the sole product when the caller omits one.
  const productId = parsed.data.productId ?? (await soleProductId(project.id));
  if (!productId) {
    return apiError(400, "product_required", "productId is required (project has multiple products)", cors);
  }

  try {
    const result = await deductByExternalId(
      project.id,
      parsed.data.externalUserId,
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
    if (e instanceof WalletNotFoundError)
      return apiError(404, "wallet_not_found", "Wallet not found", cors);
    if (e instanceof ProductNotFoundError)
      return apiError(400, "unknown_product", "Unknown product", cors);
    throw e;
  }
}

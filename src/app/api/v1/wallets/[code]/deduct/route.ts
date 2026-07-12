import { z } from "zod";
import { positiveCreditAmountSchema } from "@/lib/amounts";
import {
  authenticate,
  corsHeaders,
  invalidBodyError,
  preflight,
} from "@/lib/api/http";
import {
  creditErrorResponse,
  requireProductId,
  walletNotFoundResponse,
} from "@/lib/api/credit-errors";
import {
  deductByCode,
  findActiveCodeWallet,
  WalletNotFoundError,
} from "@/lib/credits";
import { normalizeCreditCode } from "@/lib/id";

export function OPTIONS(): Response {
  return preflight();
}

const bodySchema = z.object({
  productId: z.string().optional(),
  amount: positiveCreditAmountSchema,
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
    return invalidBodyError(parsed.error, cors);
  }

  // Default to the sole product when the caller omits one.
  const productIdOrError = await requireProductId(project, parsed.data.productId, cors);
  if (productIdOrError instanceof Response) return productIdOrError;
  const productId = productIdOrError;

  try {
    const wallet = await findActiveCodeWallet(project.id, code);
      if (!wallet) {
        return walletNotFoundResponse(project.id, req, cors);
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
    if (e instanceof WalletNotFoundError) {
      return walletNotFoundResponse(project.id, req, cors);
    }
    const mapped = creditErrorResponse(e, cors);
    if (mapped) return mapped;
    throw e;
  }
}

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { wallets } from "@/db/schema";
import { authenticate, corsHeaders, apiError, preflight } from "@/lib/api/http";
import {
  creditWallet,
  getOrCreateExternalWallet,
  soleProductId,
} from "@/lib/credits";
import { normalizeCreditCode } from "@/lib/id";

export function OPTIONS(): Response {
  return preflight();
}

const bodySchema = z
  .object({
    code: z.string().optional(),
    externalUserId: z.string().optional(),
    productId: z.string().optional(),
    amount: z.number().positive(),
    reason: z.enum(["manual", "refund", "purchase"]).optional(),
    idempotencyKey: z.string().min(1).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => d.code || d.externalUserId, {
    message: "Provide either code or externalUserId",
  })
  .refine((d) => !(d.code && d.externalUserId), {
    message: "Provide either code or externalUserId, not both",
  });

/**
 * Manually grant credits to a wallet (promos, support, server-side top-ups).
 * Secret key only. Identify the wallet by `code` or `externalUserId`. Pass a
 * stable `idempotencyKey` to make retries safe.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await authenticate(req, { require: "secret" });
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "invalid_body", parsed.error.issues[0]?.message ?? "Invalid body", cors);
  }
  const input = parsed.data;
  if (input.externalUserId && project.mode !== "external_auth") {
    return apiError(
      400,
      "mode_mismatch",
      "externalUserId grants require an external-auth project",
      cors,
    );
  }
  if (input.code && project.mode !== "credit_codes") {
    return apiError(
      400,
      "mode_mismatch",
      "code grants require a credit-code project",
      cors,
    );
  }

  // Resolve the target wallet, creating an external one on demand.
  let walletId: string;
  if (input.externalUserId) {
    const { wallet } = await getOrCreateExternalWallet(
      project.id,
      input.externalUserId,
    );
    walletId = wallet.id;
  } else {
    const code = normalizeCreditCode(input.code!, project.codePrefix);
    const wallet = await db.query.wallets.findFirst({
      where: and(eq(wallets.code, code), eq(wallets.projectId, project.id)),
    });
    if (!wallet) return apiError(404, "wallet_not_found", "Wallet not found", cors);
    walletId = wallet.id;
  }

  const productId = input.productId ?? (await soleProductId(project.id));
  if (!productId) {
    return apiError(400, "product_required", "productId is required (project has multiple products)", cors);
  }

  const result = await creditWallet(
    walletId,
    productId,
    input.amount,
    input.reason ?? "manual",
    { idempotencyKey: input.idempotencyKey, metadata: input.meta },
  );
  return Response.json(result, { headers: cors });
}

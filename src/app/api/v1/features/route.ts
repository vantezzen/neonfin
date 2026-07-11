import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { featureGrants, wallets } from "@/db/schema";
import { authenticate, corsHeaders, apiError, invalidBodyError, preflight } from "@/lib/api/http";
import { computeWalletAccess, getOrCreateExternalWallet } from "@/lib/credits";
import { FEATURE_KEY_RE, normalizeFeatureKey } from "@/lib/features";
import { normalizeCreditCode } from "@/lib/id";

export function OPTIONS(): Response {
  return preflight();
}

const bodySchema = z
  .object({
    code: z.string().optional(),
    externalUserId: z.string().optional(),
    feature: z
      .string()
      .transform(normalizeFeatureKey)
      .refine((v) => FEATURE_KEY_RE.test(v), {
        message: "feature must be a slug (letters, digits, - or _)",
      }),
    action: z.enum(["grant", "revoke"]).default("grant"),
  })
  .refine((d) => d.code || d.externalUserId, {
    message: "Provide either code or externalUserId",
  })
  .refine((d) => !(d.code && d.externalUserId), {
    message: "Provide either code or externalUserId, not both",
  });

/**
 * Manually grant or revoke a feature for a wallet (promos, support, comps).
 * Secret key only. Revoke removes only manual grants - access from an active
 * subscription or a one-time purchase is derived and can't be revoked here.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await authenticate(req, { require: "secret" });
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return invalidBodyError(parsed.error, cors);
  }
  const input = parsed.data;
  if (input.externalUserId && project.mode !== "external_auth") {
    return apiError(
      400,
      "mode_mismatch",
      "externalUserId features require an external-auth project",
      cors,
    );
  }
  if (input.code && project.mode !== "credit_codes") {
    return apiError(
      400,
      "mode_mismatch",
      "code features require a credit-code project",
      cors,
    );
  }

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

  if (input.action === "grant") {
    await db
      .insert(featureGrants)
      .values({ walletId, feature: input.feature })
      .onConflictDoNothing();
  } else {
    await db
      .delete(featureGrants)
      .where(
        and(
          eq(featureGrants.walletId, walletId),
          eq(featureGrants.feature, input.feature),
        ),
      );
  }

  const { features } = await computeWalletAccess(db, walletId);
  return Response.json({ features }, { headers: cors });
}

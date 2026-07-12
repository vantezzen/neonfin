import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { wallets } from "@/db/schema";
import { env } from "@/lib/env";
import { authenticate, corsHeaders, apiError, invalidBodyError, preflight } from "@/lib/api/http";
import { portalUrlForWallet } from "@/lib/api/credit-errors";

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

  const result = await portalUrlForWallet(
    wallet,
    parsed.data.returnUrl ?? env().NEXT_PUBLIC_APP_URL,
    cors,
  );
  if (result instanceof Response) return result;
  return Response.json(result, { headers: cors });
}

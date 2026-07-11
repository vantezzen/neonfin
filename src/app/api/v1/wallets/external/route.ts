import { z } from "zod";
import { authenticate, corsHeaders, apiError, invalidBodyError, preflight } from "@/lib/api/http";
import { getOrCreateExternalWallet, readExternalWallet } from "@/lib/credits";

export function OPTIONS(): Response {
  return preflight();
}

const bodySchema = z.object({
  externalUserId: z.string().min(1),
});

const querySchema = z.object({
  externalUserId: z.string().min(1),
});

/** Read an existing external-auth wallet without materializing a new one. */
export async function GET(req: Request): Promise<Response> {
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

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) return invalidBodyError(parsed.error, cors);

  const result = await readExternalWallet(
    project.id,
    parsed.data.externalUserId,
  );
  if (!result) {
    return apiError(404, "wallet_not_found", "Wallet not found", cors);
  }

  const { wallet, balances, features, subscriptions } = result;
  return Response.json(
    {
      walletId: wallet.id,
      externalUserId: wallet.externalUserId,
      balances,
      features,
      subscriptions,
    },
    { headers: { ...cors, "Cache-Control": "no-store" } },
  );
}

/**
 * Get-or-create a wallet keyed by the caller's own user id. Server-side only
 * (secret key) - this is how "external auth" projects map their users to
 * vantezzen/pay wallets. Idempotent per externalUserId.
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

  const { wallet, balances, features, subscriptions } =
    await getOrCreateExternalWallet(project.id, parsed.data.externalUserId);
  return Response.json(
    {
      walletId: wallet.id,
      externalUserId: wallet.externalUserId,
      balances,
      features,
      subscriptions,
    },
    { headers: cors },
  );
}

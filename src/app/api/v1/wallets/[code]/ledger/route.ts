import { z } from "zod";
import {
  apiError,
  authenticate,
  corsHeaders,
  invalidBodyError,
  invalidCodeAttempt,
  preflight,
  rateLimitHeaders,
} from "@/lib/api/http";
import { INVALID_CODE_LIMIT } from "@/lib/api/rate-limit";
import { decodeLedgerCursor, listWalletLedger } from "@/lib/api/ledger";
import {
  findActiveCodeWallet,
  WalletExpiredError,
} from "@/lib/credits";
import { normalizeCreditCode } from "@/lib/id";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function OPTIONS(): Response {
  return preflight();
}

/** List an anonymous wallet's immutable credit history. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { project, origin } = auth;
  const cors = corsHeaders(project, origin);
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) return invalidBodyError(parsed.error, cors);
  const cursor = decodeLedgerCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursor) {
    return apiError(400, "invalid_body", "Invalid cursor", cors, {
      details: [{ path: "cursor", message: "Invalid cursor" }],
    });
  }

  const { code: rawCode } = await ctx.params;
  const code = normalizeCreditCode(rawCode, project.codePrefix);
  try {
    const wallet = await findActiveCodeWallet(project.id, code);
    if (!wallet) {
      const limit = await invalidCodeAttempt(project.id, req);
      if (!limit.ok) {
        return apiError(
          429,
          "rate_limited",
          "Too many invalid recovery codes",
          rateLimitHeaders(cors, INVALID_CODE_LIMIT, limit),
        );
      }
      return apiError(404, "wallet_not_found", "Wallet not found", cors);
    }
    return Response.json(
      await listWalletLedger(wallet.id, cursor, parsed.data.limit),
      { headers: { ...cors, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof WalletExpiredError) {
      return apiError(410, "wallet_expired", "Wallet expired", cors);
    }
    throw error;
  }
}

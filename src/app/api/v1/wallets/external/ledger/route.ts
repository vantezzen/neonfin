import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { wallets } from "@/db/schema";
import {
  apiError,
  authenticate,
  corsHeaders,
  invalidBodyError,
  preflight,
} from "@/lib/api/http";
import { decodeLedgerCursor, listWalletLedger } from "@/lib/api/ledger";

const querySchema = z.object({
  externalUserId: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function OPTIONS(): Response {
  return preflight();
}

/** List an existing external-auth wallet's immutable credit history. */
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
  const cursor = decodeLedgerCursor(parsed.data.cursor);
  if (parsed.data.cursor && !cursor) {
    return apiError(400, "invalid_body", "Invalid cursor", cors, {
      details: [{ path: "cursor", message: "Invalid cursor" }],
    });
  }

  const wallet = await db.query.wallets.findFirst({
    where: and(
      eq(wallets.projectId, project.id),
      eq(wallets.externalUserId, parsed.data.externalUserId),
    ),
    columns: { id: true },
  });
  if (!wallet) {
    return apiError(404, "wallet_not_found", "Wallet not found", cors);
  }
  return Response.json(
    await listWalletLedger(wallet.id, cursor, parsed.data.limit),
    { headers: { ...cors, "Cache-Control": "no-store" } },
  );
}

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, type ApiKeyKind } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { randomToken } from "@/lib/id";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const KIND_PREFIX: Record<ApiKeyKind, string> = {
  publishable: "nf_pk_",
  secret: "nf_sk_",
};

/**
 * Mint a new API key. The plaintext is returned ONCE (shown to the admin, then
 * unrecoverable) - only its SHA-256 hash and a short display prefix are stored.
 * Pass `executor` to mint inside an existing transaction.
 */
export async function createApiKey(
  projectId: string,
  kind: ApiKeyKind,
  name = "default",
  executor: Executor = db,
): Promise<{ plaintext: string; id: string }> {
  const secret = randomToken(32);
  const plaintext = `${KIND_PREFIX[kind]}${secret}`;
  const [row] = await executor
    .insert(apiKeys)
    .values({
      projectId,
      kind,
      name,
      keyHash: sha256(plaintext),
      prefix: `${KIND_PREFIX[kind]}${secret.slice(0, 6)}`,
      // Publishable keys are public - keep the plaintext so it can be shown
      // again. Secret keys are never stored in the clear.
      publicValue: kind === "publishable" ? plaintext : null,
    })
    .returning({ id: apiKeys.id });
  return { plaintext, id: row.id };
}

/**
 * Revoke a key, scoped to its owning project. The `projectId` guard ensures a
 * caller can't revoke a key that belongs to another tenant by guessing its id.
 */
export async function revokeApiKey(id: string, projectId: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.projectId, projectId)));
}

/**
 * Resolve a bearer token to its project + kind, or null if unknown/revoked.
 * Updates `lastUsedAt` opportunistically. Used by the public API auth layer.
 */
export async function resolveApiKey(plaintext: string): Promise<{
  projectId: string;
  kind: ApiKeyKind;
  id: string;
} | null> {
  if (!plaintext.startsWith("nf_pk_") && !plaintext.startsWith("nf_sk_")) {
    return null;
  }
  const hash = sha256(plaintext);
  const row = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)),
  });
  if (!row) return null;
  // Fire-and-forget: drizzle queries are lazy thenables, so the update only
  // runs once awaited - `.then()` kicks it off without blocking the request.
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .then(
      () => {},
      () => {},
    );
  return { projectId: row.projectId, kind: row.kind, id: row.id };
}

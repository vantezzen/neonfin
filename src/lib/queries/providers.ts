import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { providerAccounts } from "@/db/schema";

/**
 * Provider accounts for one owner. Secrets never leave the server - the UI
 * only needs to know whether a webhook secret is configured, so the encrypted
 * blob is reduced to a boolean here.
 */
export async function listProviderAccounts(ownerId: string) {
  const rows = await db.query.providerAccounts.findMany({
    where: eq(providerAccounts.ownerId, ownerId),
    columns: {
      id: true,
      provider: true,
      label: true,
      environment: true,
      webhookSecretEnc: true,
      createdAt: true,
    },
    orderBy: desc(providerAccounts.createdAt),
  });
  return rows.map(({ webhookSecretEnc, ...rest }) => ({
    ...rest,
    hasWebhookSecret: webhookSecretEnc != null,
  }));
}

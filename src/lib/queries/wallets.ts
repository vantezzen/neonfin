import "server-only";
import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  featureGrants,
  ledgerEntries,
  projects,
  subscriptions,
  wallets,
} from "@/db/schema";

async function ownedProjectIds(ownerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, ownerId));
  return rows.map((r) => r.id);
}

/** Wallets across the owner's projects, newest-seen first, filtered by code. */
export async function listWallets(
  ownerId: string,
  opts: { search?: string; limit?: number } = {},
) {
  const ids = await ownedProjectIds(ownerId);
  if (ids.length === 0) return [];
  const scoped = inArray(wallets.projectId, ids);
  const search = opts.search?.trim();
  // Escape LIKE wildcards so a search for "50%" matches literally.
  const escaped = search?.replace(/[\\%_]/g, (m) => `\\${m}`);
  return db.query.wallets.findMany({
    where: escaped ? and(scoped, ilike(wallets.code, `%${escaped}%`)) : scoped,
    orderBy: desc(wallets.lastSeenAt),
    limit: opts.limit ?? 100,
    with: {
      project: { columns: { name: true } },
      balances: { columns: { balance: true } },
    },
  });
}

/** Full wallet detail (balances, access, ledger), scoped to owner. */
export async function getWalletDetail(ownerId: string, walletId: string) {
  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.id, walletId),
    with: {
      project: {
        with: {
          products: { columns: { id: true, name: true, creditUnit: true } },
        },
      },
      balances: { with: { product: { columns: { name: true, creditUnit: true } } } },
      subscriptions: {
        orderBy: desc(subscriptions.createdAt),
        with: {
          product: { columns: { name: true } },
          price: { columns: { label: true, interval: true } },
        },
      },
      featureGrants: { orderBy: desc(featureGrants.createdAt) },
      ledger: { orderBy: desc(ledgerEntries.createdAt), limit: 200 },
    },
  });
  if (!wallet || wallet.project.ownerId !== ownerId) return null;
  return wallet;
}

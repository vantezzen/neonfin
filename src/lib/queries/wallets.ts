import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  featureGrants,
  ledgerEntries,
  orders,
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

/** Wallets across the owner's projects, newest-seen first. */
export async function listWallets(
  ownerId: string,
  opts: {
    search?: string;
    limit?: number;
    offset?: number;
    projectId?: string;
    sort?: "lastSeenAt" | "kind";
    direction?: "asc" | "desc";
  } = {},
) {
  const ids = await ownedProjectIds(ownerId);
  const projectIds = opts.projectId
    ? ids.filter((id) => id === opts.projectId)
    : ids;
  if (projectIds.length === 0) return [];
  const scoped = inArray(wallets.projectId, projectIds);
  const search = opts.search?.trim();
  // Escape LIKE wildcards so a search for "50%" matches literally.
  const escaped = search?.replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = escaped ? `%${escaped}%` : undefined;
  const orderWalletIds = pattern
    ? await db
        .select({ walletId: orders.walletId })
        .from(orders)
        .where(
          and(
            inArray(orders.projectId, projectIds),
            isNotNull(orders.walletId),
            or(
              ilike(orders.id, pattern),
              ilike(orders.providerCheckoutId, pattern),
              ilike(orders.providerCustomerId, pattern),
              ilike(orders.customerEmail, pattern),
              ilike(orders.issuedCode, pattern),
            ),
          ),
        )
        .limit(opts.limit ?? 100)
        .then((rows) => [
          ...new Set(
            rows.flatMap((row) => (row.walletId ? [row.walletId] : [])),
          ),
        ])
    : [];
  const searchWhere = pattern
    ? or(
        ilike(wallets.code, pattern),
        ilike(wallets.externalUserId, pattern),
        ilike(wallets.providerCustomerId, pattern),
        ...(orderWalletIds.length ? [inArray(wallets.id, orderWalletIds)] : []),
      )
    : undefined;
  const order = opts.direction === "asc" ? asc : desc;
  const column = opts.sort === "kind" ? wallets.kind : wallets.lastSeenAt;
  return db.query.wallets.findMany({
    where: searchWhere ? and(scoped, searchWhere) : scoped,
    orderBy: [order(column), order(wallets.id)],
    limit: opts.limit ?? 100,
    offset: opts.offset,
    with: {
      project: { columns: { name: true } },
      balances: {
        columns: { balance: true },
        with: { product: { columns: { creditUnit: true } } },
      },
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

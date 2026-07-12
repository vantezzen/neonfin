import "server-only";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { orders, providerAccounts, subscriptions, wallets, webhookEvents } from "@/db/schema";
import { ownedProjectIds } from "./projects";

export async function listOrders(
  ownerId: string,
  opts: {
    limit?: number;
    offset?: number;
    projectId?: string;
    search?: string;
    status?: "paid" | "pending" | "failed" | "refunded" | "expired";
    sort?: "createdAt";
    direction?: "asc" | "desc";
  } = {},
) {
  const ids = await ownedProjectIds(ownerId);
  const projectIds = opts.projectId
    ? ids.filter((id) => id === opts.projectId)
    : ids;
  if (projectIds.length === 0) return [];
  const conditions = [inArray(orders.projectId, projectIds)];
  const search = opts.search?.trim();
  const escaped = search?.replace(/[\\%_]/g, (match) => `\\${match}`);
  const pattern = escaped ? `%${escaped}%` : undefined;
  if (pattern) {
    conditions.push(
      or(
        ilike(orders.customerEmail, pattern),
        ilike(orders.id, pattern),
        ilike(orders.providerCheckoutId, pattern),
        ilike(orders.issuedCode, pattern),
      )!,
    );
  }
  if (opts.status) conditions.push(eq(orders.status, opts.status));
  const order = opts.direction === "asc" ? asc : desc;
  return db.query.orders.findMany({
    where: and(...conditions),
    orderBy: [order(orders.createdAt), order(orders.id)],
    limit: opts.limit ?? 100,
    offset: opts.offset,
    with: {
      project: { columns: { name: true, slug: true } },
      price: {
        with: {
          product: {
            columns: { name: true },
            // The account environment (test/live) is needed to build the right
            // provider dashboard deep link for each order.
            with: { providerAccount: { columns: { environment: true } } },
          },
        },
      },
    },
  });
}

export async function listSubscriptions(
  ownerId: string,
  opts: { projectId?: string } = {},
) {
  const ids = await ownedProjectIds(ownerId);
  const projectIds = opts.projectId ? ids.filter((id) => id === opts.projectId) : ids;
  if (projectIds.length === 0) return [];
  const walletRows = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(inArray(wallets.projectId, projectIds));
  if (walletRows.length === 0) return [];
  return db.query.subscriptions.findMany({
    where: inArray(subscriptions.walletId, walletRows.map((wallet) => wallet.id)),
    orderBy: desc(subscriptions.createdAt),
    with: {
      wallet: { columns: { id: true, code: true, externalUserId: true } },
      product: {
        columns: { name: true },
        with: { providerAccount: { columns: { environment: true } } },
      },
      price: { columns: { label: true } },
    },
  });
}

export async function listWebhookEvents(
  ownerId: string,
  opts: {
    limit?: number;
    offset?: number;
    provider?: "stripe" | "polar";
    status?: "pending" | "processed" | "skipped" | "error";
  } = {},
) {
  const accounts = await db
    .select({ id: providerAccounts.id, label: providerAccounts.label })
    .from(providerAccounts)
    .where(eq(providerAccounts.ownerId, ownerId));
  const ids = accounts.map((a) => a.id);
  if (ids.length === 0) return [];
  const conditions = [inArray(webhookEvents.providerAccountId, ids)];
  if (opts.provider) conditions.push(eq(webhookEvents.provider, opts.provider));
  if (opts.status) conditions.push(eq(webhookEvents.status, opts.status));
  const events = await db.query.webhookEvents.findMany({
    where: and(...conditions),
    orderBy: desc(webhookEvents.createdAt),
    limit: opts.limit ?? 100,
    offset: opts.offset,
    columns: {
      id: true,
      providerAccountId: true,
      provider: true,
      providerEventId: true,
      type: true,
      status: true,
      error: true,
      createdAt: true,
    },
  });
  const labels = new Map(accounts.map((account) => [account.id, account.label]));
  return events.map((event) => ({
    ...event,
    accountLabel:
      (event.providerAccountId ? labels.get(event.providerAccountId) : null) ??
      event.provider,
  }));
}

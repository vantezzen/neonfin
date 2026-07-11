import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, projects, providerAccounts, webhookEvents } from "@/db/schema";

async function ownedProjectIds(ownerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, ownerId));
  return rows.map((r) => r.id);
}

export async function listOrders(
  ownerId: string,
  opts: {
    limit?: number;
    offset?: number;
    projectId?: string;
    sort?: "createdAt" | "status";
    direction?: "asc" | "desc";
  } = {},
) {
  const ids = await ownedProjectIds(ownerId);
  const projectIds = opts.projectId
    ? ids.filter((id) => id === opts.projectId)
    : ids;
  if (projectIds.length === 0) return [];
  const order = opts.direction === "asc" ? asc : desc;
  const column = opts.sort === "status" ? orders.status : orders.createdAt;
  return db.query.orders.findMany({
    where: inArray(orders.projectId, projectIds),
    orderBy: [order(column), order(orders.id)],
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
    .select({ id: providerAccounts.id })
    .from(providerAccounts)
    .where(eq(providerAccounts.ownerId, ownerId));
  const ids = accounts.map((a) => a.id);
  if (ids.length === 0) return [];
  const conditions = [inArray(webhookEvents.providerAccountId, ids)];
  if (opts.provider) conditions.push(eq(webhookEvents.provider, opts.provider));
  if (opts.status) conditions.push(eq(webhookEvents.status, opts.status));
  return db.query.webhookEvents.findMany({
    where: and(...conditions),
    orderBy: desc(webhookEvents.createdAt),
    limit: opts.limit ?? 100,
    offset: opts.offset,
    columns: {
      id: true,
      provider: true,
      providerEventId: true,
      type: true,
      status: true,
      error: true,
      createdAt: true,
    },
  });
}

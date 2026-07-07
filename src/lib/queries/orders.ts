import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, projects, providerAccounts, webhookEvents } from "@/db/schema";

async function ownedProjectIds(ownerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, ownerId));
  return rows.map((r) => r.id);
}

export async function listOrders(ownerId: string, limit = 100) {
  const ids = await ownedProjectIds(ownerId);
  if (ids.length === 0) return [];
  return db.query.orders.findMany({
    where: inArray(orders.projectId, ids),
    orderBy: desc(orders.createdAt),
    limit,
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

export async function listWebhookEvents(ownerId: string, limit = 100) {
  const accounts = await db
    .select({ id: providerAccounts.id })
    .from(providerAccounts)
    .where(eq(providerAccounts.ownerId, ownerId));
  const ids = accounts.map((a) => a.id);
  if (ids.length === 0) return [];
  return db.query.webhookEvents.findMany({
    where: inArray(webhookEvents.providerAccountId, ids),
    orderBy: desc(webhookEvents.createdAt),
    limit,
  });
}

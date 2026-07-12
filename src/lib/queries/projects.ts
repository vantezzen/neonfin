import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, products, projects } from "@/db/schema";

/** IDs of every project owned by a user - the scope filter for owner-facing lists. */
export async function ownedProjectIds(ownerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, ownerId));
  return rows.map((row) => row.id);
}

export async function listProjects(ownerId: string) {
  return db.query.projects.findMany({
    where: eq(projects.ownerId, ownerId),
    orderBy: desc(projects.createdAt),
    with: {
      products: {
        columns: { id: true, active: true, providerAccountId: true },
        with: { prices: { columns: { providerPriceId: true } } },
      },
    },
  });
}

/** Full project detail, scoped to owner (returns null if not owned). */
export async function getProjectDetail(id: string, ownerId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.ownerId, ownerId)),
    with: {
      products: {
        orderBy: desc(products.createdAt),
        with: { prices: true },
      },
      apiKeys: {
        orderBy: desc(apiKeys.createdAt),
        // keyHash stays server-side; the UI only needs display fields.
        columns: {
          id: true,
          projectId: true,
          kind: true,
          name: true,
          prefix: true,
          publicValue: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
        },
      },
    },
  });
  return project ?? null;
}

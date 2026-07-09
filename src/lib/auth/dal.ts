import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { prices, products, projects, providerAccounts } from "@/db/schema";
import { auth } from "./server";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Require an authenticated developer; redirect to /login otherwise. */
export const requireUser = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
});

/**
 * Load a project only if it belongs to the current user. Redirects to the
 * dashboard on missing/forbidden so ids can't be enumerated across tenants.
 */
export async function requireOwnedProject(projectId: string) {
  const user = await requireUser();
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });
  if (!project) redirect("/dashboard");
  return project;
}

/**
 * Load a product only if it belongs to a project the current user owns.
 * Redirects to the dashboard otherwise, so a child id from a form can never be
 * used to mutate another tenant's product.
 */
export async function requireOwnedProduct(productId: string) {
  const user = await requireUser();
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: { project: { columns: { ownerId: true } } },
  });
  if (!product || product.project.ownerId !== user.id) redirect("/dashboard");
  return product;
}

/**
 * Load a price only if it belongs (via its product) to a project the current
 * user owns. Redirects to the dashboard otherwise.
 */
export async function requireOwnedPrice(priceId: string) {
  const user = await requireUser();
  const price = await db.query.prices.findFirst({
    where: eq(prices.id, priceId),
    with: {
      product: { with: { project: { columns: { ownerId: true } } } },
    },
  });
  if (!price || price.product.project.ownerId !== user.id) {
    redirect("/dashboard");
  }
  return price;
}

/** Assert the current user owns a provider account (for mutations). */
export async function requireOwnedProviderAccount(accountId: string) {
  const user = await requireUser();
  const account = await db.query.providerAccounts.findFirst({
    where: and(
      eq(providerAccounts.id, accountId),
      eq(providerAccounts.ownerId, user.id),
    ),
    columns: {
      id: true,
      ownerId: true,
      provider: true,
      label: true,
      environment: true,
      createdAt: true,
    },
  });
  if (!account) redirect("/dashboard/providers");
  return account;
}

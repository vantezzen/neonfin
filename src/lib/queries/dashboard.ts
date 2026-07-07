import "server-only";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  ledgerEntries,
  orders,
  prices,
  products,
  projects,
  providerAccounts,
  wallets,
} from "@/db/schema";
import { toNum } from "@/lib/credits";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

export type DashboardDay = {
  date: string;
  revenue: number;
  creditsConsumed: number;
};

export type DashboardOverview = {
  revenueCents: number;
  revenueCurrency: string;
  mixedCurrencies: boolean;
  activeWallets: number;
  creditsConsumed: number;
  paidOrders: number;
  series: DashboardDay[];
};

export type DashboardRecentOrder = {
  id: string;
  projectName: string;
  productName: string | null;
  priceLabel: string | null;
  status: string;
  amountCents: number;
  currency: string;
  createdAt: Date;
};

export type DashboardProjectActivity = {
  id: string;
  name: string;
  slug: string;
  revenueCents: number;
  revenueCurrency: string;
  mixedCurrencies: boolean;
  activeWallets: number;
  creditsConsumed: number;
};

export type SetupState = {
  /** Provider connected with a webhook secret in place. */
  hasProvider: boolean;
  /** At least one project exists. */
  hasProject: boolean;
  /** A price is synced to a provider, or there's a paid order. */
  isLive: boolean;
  /** First project's id, for the "open project" link. */
  firstProjectId: string | null;
  /** True once every step is done - the checklist hides. */
  complete: boolean;
};

/**
 * Drives the home setup checklist. Each flag is derived from real owner-scoped
 * data so the checklist reflects actual progress and disappears when finished.
 */
export async function getSetupState(ownerId: string): Promise<SetupState> {
  const [providerRows, projectRows] = await Promise.all([
    db
      .select({ id: providerAccounts.id })
      .from(providerAccounts)
      .where(
        and(
          eq(providerAccounts.ownerId, ownerId),
          isNotNull(providerAccounts.webhookSecretEnc),
        ),
      )
      .limit(1),
    db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.ownerId, ownerId))
      .orderBy(projects.createdAt)
      .limit(1),
  ]);

  const hasProvider = providerRows.length > 0;
  const hasProject = projectRows.length > 0;
  const firstProjectId = projectRows[0]?.id ?? null;

  let isLive = false;
  if (hasProject) {
    const projectIds = await ownedProjectIds(ownerId);
    const [syncedPrice, paidOrder] = await Promise.all([
      db
        .select({ id: prices.id })
        .from(prices)
        .innerJoin(products, eq(prices.productId, products.id))
        .where(
          and(
            inArray(products.projectId, projectIds),
            isNotNull(prices.providerPriceId),
          ),
        )
        .limit(1),
      db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(inArray(orders.projectId, projectIds), eq(orders.status, "paid")),
        )
        .limit(1),
    ]);
    isLive = syncedPrice.length > 0 || paidOrder.length > 0;
  }

  return {
    hasProvider,
    hasProject,
    isLive,
    firstProjectId,
    complete: hasProvider && hasProject && isLive,
  };
}

async function ownedProjectIds(ownerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, ownerId));
  return rows.map((row) => row.id);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function emptySeries(start: Date): DashboardDay[] {
  return Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS);
    return { date: dayKey(date), revenue: 0, creditsConsumed: 0 };
  });
}

export async function getDashboardOverview(
  ownerId: string,
): Promise<DashboardOverview> {
  const now = new Date();
  const start = new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);

  const projectIds = await ownedProjectIds(ownerId);
  const series = emptySeries(start);
  const byDay = new Map(series.map((day) => [day.date, day]));

  if (projectIds.length === 0) {
    return {
      revenueCents: 0,
      revenueCurrency: "USD",
      mixedCurrencies: false,
      activeWallets: 0,
      creditsConsumed: 0,
      paidOrders: 0,
      series,
    };
  }

  const [recentOrders, recentDeductions, activeWalletRows] = await Promise.all([
    db.query.orders.findMany({
      where: and(
        inArray(orders.projectId, projectIds),
        gte(orders.createdAt, start),
      ),
    }),
    db
      .select({
        delta: ledgerEntries.delta,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .innerJoin(wallets, eq(ledgerEntries.walletId, wallets.id))
      .where(
        and(
          inArray(wallets.projectId, projectIds),
          eq(ledgerEntries.reason, "deduction"),
          gte(ledgerEntries.createdAt, start),
        ),
      ),
    db
      .select({ id: wallets.id })
      .from(wallets)
      .where(
        and(
          inArray(wallets.projectId, projectIds),
          gte(wallets.lastSeenAt, start),
        ),
      ),
  ]);

  const paidOrders = recentOrders.filter((order) => order.status === "paid");
  const currencies = new Set(paidOrders.map((order) => order.currency));
  let revenueCents = 0;
  for (const order of paidOrders) {
    revenueCents += order.amountCents;
    // A row stamped by the DB clock can land just outside the JS-clock window.
    const day = byDay.get(dayKey(order.createdAt));
    if (day) day.revenue += order.amountCents / 100;
  }

  let creditsConsumed = 0;
  for (const entry of recentDeductions) {
    const consumed = Math.abs(toNum(entry.delta));
    creditsConsumed += consumed;
    const day = byDay.get(dayKey(entry.createdAt));
    if (day) day.creditsConsumed += consumed;
  }

  return {
    revenueCents,
    revenueCurrency: currencies.values().next().value ?? "USD",
    mixedCurrencies: currencies.size > 1,
    activeWallets: activeWalletRows.length,
    creditsConsumed,
    paidOrders: paidOrders.length,
    series,
  };
}

export async function getRecentDashboardOrders(
  ownerId: string,
  limit = 5,
): Promise<DashboardRecentOrder[]> {
  const projectIds = await ownedProjectIds(ownerId);
  if (projectIds.length === 0) return [];

  const rows = await db.query.orders.findMany({
    where: inArray(orders.projectId, projectIds),
    orderBy: desc(orders.createdAt),
    limit,
    with: {
      project: { columns: { name: true } },
      price: {
        columns: { label: true },
        with: { product: { columns: { name: true } } },
      },
    },
  });

  return rows.map((order) => ({
    id: order.id,
    projectName: order.project.name,
    productName: order.price?.product.name ?? null,
    priceLabel: order.price?.label ?? null,
    status: order.status,
    amountCents: order.amountCents,
    currency: order.currency,
    createdAt: order.createdAt,
  }));
}

export async function getProjectActivity(
  ownerId: string,
  limit = 4,
): Promise<DashboardProjectActivity[]> {
  const now = new Date();
  const start = new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);

  const projectRows = await db.query.projects.findMany({
    where: eq(projects.ownerId, ownerId),
    orderBy: desc(projects.createdAt),
    columns: { id: true, name: true, slug: true },
  });
  if (projectRows.length === 0) return [];

  const projectIds = projectRows.map((project) => project.id);
  const byProject = new Map(
    projectRows.map((project) => [
      project.id,
      {
        ...project,
        revenueCents: 0,
        revenueCurrency: "USD",
        currencies: new Set<string>(),
        activeWallets: 0,
        creditsConsumed: 0,
      },
    ]),
  );

  const [recentOrders, recentDeductions, activeWalletRows] = await Promise.all([
    db.query.orders.findMany({
      where: and(
        inArray(orders.projectId, projectIds),
        gte(orders.createdAt, start),
      ),
      columns: {
        projectId: true,
        status: true,
        amountCents: true,
        currency: true,
      },
    }),
    db
      .select({
        projectId: wallets.projectId,
        delta: ledgerEntries.delta,
      })
      .from(ledgerEntries)
      .innerJoin(wallets, eq(ledgerEntries.walletId, wallets.id))
      .where(
        and(
          inArray(wallets.projectId, projectIds),
          eq(ledgerEntries.reason, "deduction"),
          gte(ledgerEntries.createdAt, start),
        ),
      ),
    db
      .select({ projectId: wallets.projectId, id: wallets.id })
      .from(wallets)
      .where(
        and(
          inArray(wallets.projectId, projectIds),
          gte(wallets.lastSeenAt, start),
        ),
      ),
  ]);

  for (const order of recentOrders) {
    if (order.status !== "paid") continue;
    const project = byProject.get(order.projectId);
    if (!project) continue;
    project.revenueCents += order.amountCents;
    project.currencies.add(order.currency);
    project.revenueCurrency = order.currency;
  }

  for (const entry of recentDeductions) {
    const project = byProject.get(entry.projectId);
    if (project) project.creditsConsumed += Math.abs(toNum(entry.delta));
  }

  for (const wallet of activeWalletRows) {
    const project = byProject.get(wallet.projectId);
    if (project) project.activeWallets += 1;
  }

  return Array.from(byProject.values())
    .map(({ currencies, ...project }) => ({
      ...project,
      mixedCurrencies: currencies.size > 1,
    }))
    .sort((a, b) => {
      const aScore = a.revenueCents + a.creditsConsumed + a.activeWallets;
      const bScore = b.revenueCents + b.creditsConsumed + b.activeWallets;
      return bScore - aScore;
    })
    .slice(0, limit);
}

import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
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
import { ownedProjectIds } from "./projects";

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

  const orderDay =
    sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const deductionDay =
    sql<string>`to_char(${ledgerEntries.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

  const [
    orderSummaryRows,
    dailyOrderRows,
    deductionSummaryRows,
    dailyDeductionRows,
    activeWalletCountRows,
  ] = await Promise.all([
    db
      .select({
        revenueCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
        revenueCurrency: sql<string | null>`min(${orders.currency})`,
        mixedCurrencies: sql<boolean>`count(distinct ${orders.currency}) > 1`,
        paidOrders: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.projectId, projectIds),
          eq(orders.status, "paid"),
          gte(orders.createdAt, start),
        ),
      ),
    db
      .select({
        date: orderDay,
        revenueCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.projectId, projectIds),
          eq(orders.status, "paid"),
          gte(orders.createdAt, start),
        ),
      )
      .groupBy(orderDay),
    db
      .select({
        creditsConsumed: sql<string>`coalesce(sum(abs(${ledgerEntries.delta})), 0)`,
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
      .select({
        date: deductionDay,
        creditsConsumed: sql<string>`coalesce(sum(abs(${ledgerEntries.delta})), 0)`,
      })
      .from(ledgerEntries)
      .innerJoin(wallets, eq(ledgerEntries.walletId, wallets.id))
      .where(
        and(
          inArray(wallets.projectId, projectIds),
          eq(ledgerEntries.reason, "deduction"),
          gte(ledgerEntries.createdAt, start),
        ),
      )
      .groupBy(deductionDay),
    db
      .select({ activeWallets: sql<number>`count(*)::int` })
      .from(wallets)
      .where(
        and(
          inArray(wallets.projectId, projectIds),
          gte(wallets.lastSeenAt, start),
        ),
      ),
  ]);

  const orderSummary = orderSummaryRows[0];
  for (const row of dailyOrderRows) {
    const day = byDay.get(row.date);
    if (day) day.revenue += row.revenueCents / 100;
  }

  const creditsConsumed = toNum(deductionSummaryRows[0]?.creditsConsumed ?? "0");
  for (const row of dailyDeductionRows) {
    const day = byDay.get(row.date);
    if (day) day.creditsConsumed += toNum(row.creditsConsumed);
  }

  return {
    revenueCents: orderSummary?.revenueCents ?? 0,
    revenueCurrency: orderSummary?.revenueCurrency ?? "USD",
    mixedCurrencies: orderSummary?.mixedCurrencies ?? false,
    activeWallets: activeWalletCountRows[0]?.activeWallets ?? 0,
    creditsConsumed,
    paidOrders: orderSummary?.paidOrders ?? 0,
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
        mixedCurrencies: false,
      },
    ]),
  );

  const [orderRows, deductionRows, activeWalletRows] = await Promise.all([
    db
      .select({
        projectId: orders.projectId,
        revenueCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
        revenueCurrency: sql<string | null>`min(${orders.currency})`,
        mixedCurrencies: sql<boolean>`count(distinct ${orders.currency}) > 1`,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.projectId, projectIds),
          eq(orders.status, "paid"),
          gte(orders.createdAt, start),
        ),
      )
      .groupBy(orders.projectId),
    db
      .select({
        projectId: wallets.projectId,
        creditsConsumed: sql<string>`coalesce(sum(abs(${ledgerEntries.delta})), 0)`,
      })
      .from(ledgerEntries)
      .innerJoin(wallets, eq(ledgerEntries.walletId, wallets.id))
      .where(
        and(
          inArray(wallets.projectId, projectIds),
          eq(ledgerEntries.reason, "deduction"),
          gte(ledgerEntries.createdAt, start),
        ),
      )
      .groupBy(wallets.projectId),
    db
      .select({
        projectId: wallets.projectId,
        activeWallets: sql<number>`count(*)::int`,
      })
      .from(wallets)
      .where(
        and(
          inArray(wallets.projectId, projectIds),
          gte(wallets.lastSeenAt, start),
        ),
      )
      .groupBy(wallets.projectId),
  ]);

  for (const order of orderRows) {
    const project = byProject.get(order.projectId);
    if (!project) continue;
    project.revenueCents = order.revenueCents;
    if (order.revenueCurrency) {
      project.currencies.add(order.revenueCurrency);
      project.revenueCurrency = order.revenueCurrency;
    }
    project.mixedCurrencies = order.mixedCurrencies;
  }

  for (const entry of deductionRows) {
    const project = byProject.get(entry.projectId);
    if (project) project.creditsConsumed = toNum(entry.creditsConsumed);
  }

  for (const wallet of activeWalletRows) {
    const project = byProject.get(wallet.projectId);
    if (project) project.activeWallets = wallet.activeWallets;
  }

  return Array.from(byProject.values())
    .map(({ currencies, ...project }) => ({
      ...project,
      mixedCurrencies: project.mixedCurrencies || currencies.size > 1,
    }))
    .sort((a, b) => {
      const aScore = a.revenueCents + a.creditsConsumed + a.activeWallets;
      const bScore = b.revenueCents + b.creditsConsumed + b.activeWallets;
      return bScore - aScore;
    })
    .slice(0, limit);
}

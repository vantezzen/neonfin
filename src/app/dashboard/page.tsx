import Link from "next/link";
import { ArrowRight, FolderKanban, Receipt } from "lucide-react";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/auth/dal";
import { formatLargeNumber, formatDateTime, formatMoney } from "@/lib/format";
import {
  getDashboardOverview,
  getProjectActivity,
  getRecentDashboardOrders,
  getSetupState,
  type DashboardProjectActivity,
  type DashboardRecentOrder,
} from "@/lib/queries/dashboard";
import { DashboardCharts } from "@/components/dashboard/home-charts";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { PageHeader, SectionHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Status, type StatusTone } from "@/components/app/status";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ORDER_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  paid: { label: "Paid", tone: "success" },
  pending: { label: "Pending", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  expired: { label: "Expired", tone: "warning" },
  refunded: { label: "Refunded", tone: "warning" },
};

export default async function DashboardPage() {
  const user = await requireUser();
  const [overview, setup, recentOrders, projectActivity] = await Promise.all([
    getDashboardOverview(user.id),
    getSetupState(user.id),
    getRecentDashboardOrders(user.id),
    getProjectActivity(user.id),
  ]);
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  const stats = [
    {
      label: "Revenue",
      value: overview.mixedCurrencies
        ? "Multiple currencies"
        : formatMoney(overview.revenueCents, overview.revenueCurrency),
      note: overview.mixedCurrencies
        ? "Multiple currencies included"
        : `${overview.paidOrders} paid order${overview.paidOrders === 1 ? "" : "s"}`,
    },
    {
      label: "Active wallets",
      value: formatLargeNumber(overview.activeWallets, "wallets"),
      note: "Seen in the last 30 days",
    },
    {
      label: "Credits consumed",
      value: formatLargeNumber(overview.creditsConsumed),
      note: "Deducted across all projects",
    },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        description="The last 30 days across all your projects."
      />
      <div className="flex flex-col gap-6">
        <SetupChecklist state={setup} appUrl={appUrl} />

        <div className="grid divide-y rounded-xl border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 px-5 py-4">
              <span className="text-[13px] font-medium text-muted-foreground">
                {s.label}
              </span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                {s.value}
              </span>
              <span className="text-xs text-muted-foreground">{s.note}</span>
            </div>
          ))}
        </div>

        <DashboardCharts
          data={overview.series}
          revenueTotal={
            overview.mixedCurrencies
              ? "Multiple currencies"
              : formatMoney(overview.revenueCents, overview.revenueCurrency)
          }
          revenueCurrency={overview.revenueCurrency}
          revenueAvailable={!overview.mixedCurrencies}
          creditsTotal={formatLargeNumber(overview.creditsConsumed)}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <RecentOrders orders={recentOrders} />
          <ProjectActivity projects={projectActivity} />
        </div>
      </div>
    </>
  );
}

function RecentOrders({ orders }: { orders: DashboardRecentOrder[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border p-5">
      <SectionHeader
        title="Recent orders"
        description="The newest checkout attempts across every project."
        action={
          <Link
            href="/dashboard/orders"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            View all
            <ArrowRight data-icon="inline-end" />
          </Link>
        }
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="No orders yet"
          description="Orders appear here as soon as a checkout starts."
          className="py-10"
        />
      ) : (
        <div className="divide-y">
          {orders.map((order) => {
            const status = ORDER_STATUS[order.status] ?? {
              label: order.status,
              tone: "neutral" as const,
            };
            return (
              <div
                key={order.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {order.productName ?? "Checkout"}
                    </span>
                    {order.priceLabel ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {order.priceLabel}
                      </span>
                    ) : null}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {order.projectName} · {formatDateTime(order.createdAt)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-medium tabular-nums">
                    {formatMoney(order.amountCents, order.currency)}
                  </span>
                  <Status tone={status.tone} className="text-xs">
                    {status.label}
                  </Status>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProjectActivity({
  projects,
}: {
  projects: DashboardProjectActivity[];
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border p-5">
      <SectionHeader
        title="Project activity"
        description="Which projects are driving the last 30 days."
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="No projects yet"
          description="Create a project to start seeing activity here."
          className="py-10"
        />
      ) : (
        <div className="divide-y">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className="group flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                  {project.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {project.activeWallets} active wallet
                  {project.activeWallets === 1 ? "" : "s"} ·{" "}
                  {formatLargeNumber(project.creditsConsumed)} credits used
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium tabular-nums">
                  {project.mixedCurrencies
                    ? "Multiple currencies"
                    : formatMoney(project.revenueCents, project.revenueCurrency)}
                </span>
                <ArrowRight className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

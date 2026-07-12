import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listOrders, listSubscriptions } from "@/lib/queries/orders";
import { listProjects } from "@/lib/queries/projects";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Status, type StatusTone } from "@/components/app/status";
import { CopyInline } from "@/components/app/copy";
import { ProviderLink } from "@/components/app/provider-link";
import {
  providerOrderUrl,
  providerSubscriptionUrl,
} from "@/lib/providers/links";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Orders" };

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  paid: { label: "Paid", tone: "success" },
  pending: { label: "Pending", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  expired: { label: "Expired", tone: "warning" },
  refunded: { label: "Refunded", tone: "warning" },
};

type Direction = "asc" | "desc";

function queryDirection(value: string | undefined): Direction {
  return value === "asc" ? "asc" : "desc";
}

function queryStatus(value: string | undefined) {
  return ["paid", "pending", "failed", "refunded", "expired"].includes(
    value ?? "",
  )
    ? (value as "paid" | "pending" | "failed" | "refunded" | "expired")
    : undefined;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    page?: string;
    sort?: string;
    direction?: string;
    q?: string;
    status?: string;
  }>;
}) {
  const {
    project: projectId,
    page: pageValue,
    direction: directionValue,
    q: query,
    status: statusValue,
  } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageValue) || 1));
  const direction = queryDirection(directionValue);
  const status = queryStatus(statusValue);
  const pageSize = 100;
  const user = await requireUser();
  const projects = await listProjects(user.id);
  const selectedProject = projects.find((project) => project.id === projectId);
  const [orderRows, subscriptions] = await Promise.all([
    listOrders(user.id, {
      limit: pageSize + 1,
      offset: (page - 1) * pageSize,
      projectId: selectedProject?.id,
      search: query,
      status,
      direction,
    }),
    listSubscriptions(user.id, { projectId: selectedProject?.id }),
  ]);
  const hasMore = orderRows.length > pageSize;
  const orders = orderRows.slice(0, pageSize);
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (selectedProject) params.set("project", selectedProject.id);
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (direction !== "desc") params.set("direction", direction);
    if (nextPage > 1) params.set("page", String(nextPage));
    const queryString = params.toString();
    return `/dashboard/orders${queryString ? `?${queryString}` : ""}`;
  };
  const sortHref = () => {
    const nextDirection: Direction = direction === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    if (selectedProject) params.set("project", selectedProject.id);
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (nextDirection !== "desc") params.set("direction", nextDirection);
    const queryString = params.toString();
    return `/dashboard/orders${queryString ? `?${queryString}` : ""}`;
  };
  const sortLabel = direction === "asc" ? "↑" : "↓";
  const filtered = Boolean(selectedProject || query || status);

  return (
    <>
      <PageHeader
        title="Orders"
        description={
          selectedProject
            ? `Checkout attempts for ${selectedProject.name}.`
            : "Checkout attempts across your projects."
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Need to refund? Open the order in Stripe or Polar - refunds sync back
        automatically.
      </p>
      <form method="get" className="mb-6 flex flex-wrap items-center gap-2">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search orders"
          className="min-w-52 flex-1"
        />
        {projects.length > 1 ? (
          <NativeSelect
            name="project"
            defaultValue={selectedProject?.id ?? ""}
            className="w-full max-w-xs"
          >
            <NativeSelectOption value="">All projects</NativeSelectOption>
            {projects.map((project) => (
              <NativeSelectOption key={project.id} value={project.id}>
                {project.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
        <NativeSelect name="status" defaultValue={status ?? ""}>
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          <NativeSelectOption value="paid">Paid</NativeSelectOption>
          <NativeSelectOption value="pending">Pending</NativeSelectOption>
          <NativeSelectOption value="failed">Failed</NativeSelectOption>
          <NativeSelectOption value="refunded">Refunded</NativeSelectOption>
          <NativeSelectOption value="expired">Expired</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {subscriptions.length > 0 ? (
        <SubscriptionsTable subscriptions={subscriptions} />
      ) : null}

      {orders.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={filtered ? "No orders match your filters." : "No orders yet"}
          description={
            filtered
              ? "Try another search or clear the filters."
              : "Orders appear as soon as your app starts its first checkout."
          }
          action={
            filtered ? (
              <Link
                href="/dashboard/orders"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Link href={sortHref()} className="hover:text-foreground">
                      Date {sortLabel}
                    </Link>
                  </TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-0">Provider</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const status = STATUS[o.status] ?? {
                    label: o.status,
                    tone: "neutral" as const,
                  };
                  const providerUrl = providerOrderUrl(
                    o.provider,
                    o.price?.product.providerAccount?.environment ??
                      "production",
                    o.providerCheckoutId,
                  );
                  return (
                    <TableRow key={o.id}>
                      <TableCell
                        className="text-muted-foreground tabular-nums"
                        title={o.createdAt.toISOString()}
                      >
                        {formatDateTime(o.createdAt)}
                      </TableCell>
                      <TableCell>{o.project.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.price?.product.name ?? "-"}
                      </TableCell>
                      <TableCell>
                        <Status tone={status.tone}>{status.label}</Status>
                      </TableCell>
                      <TableCell>
                        {o.issuedCode ? (
                          <span className="flex items-center gap-1">
                            {o.walletId ? (
                              <Link
                                href={`/dashboard/wallets/${o.walletId}`}
                                className="font-mono text-xs hover:underline"
                              >
                                {o.issuedCode}
                              </Link>
                            ) : (
                              <code>{o.issuedCode}</code>
                            )}
                            <CopyInline value={o.issuedCode} label="Copy" />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.customerEmail ?? "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(o.amountCents, o.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {providerUrl ? (
                          <ProviderLink
                            href={providerUrl}
                            title={`View this order in ${o.provider}`}
                          >
                            {o.provider}
                          </ProviderLink>
                        ) : (
                          <span className="capitalize text-muted-foreground">
                            {o.provider}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {page > 1 || hasMore ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">Page {page}</span>
              {hasMore ? (
                <Link
                  href={pageHref(page + 1)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function SubscriptionsTable({
  subscriptions,
}: {
  subscriptions: Awaited<ReturnType<typeof listSubscriptions>>;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">
        Subscriptions
      </h2>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Wallet</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Renews / ends</TableHead>
              <TableHead>Provider</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.map((subscription) => {
              const providerUrl = providerSubscriptionUrl(
                subscription.provider,
                subscription.product.providerAccount?.environment ??
                  "production",
                subscription.providerSubscriptionId,
              );
              return (
                <TableRow key={subscription.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/wallets/${subscription.wallet.id}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {subscription.wallet.code ??
                        subscription.wallet.externalUserId ??
                        subscription.wallet.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {subscription.product.name}
                    {subscription.price?.label ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {subscription.price.label}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Status
                      tone={
                        subscription.status === "active" ? "success" : "neutral"
                      }
                    >
                      {subscription.status === "active"
                        ? "Active"
                        : `Canceled${subscription.currentPeriodEnd ? ` - access until ${formatDateTime(subscription.currentPeriodEnd)}` : ""}`}
                    </Status>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {subscription.currentPeriodEnd
                      ? formatDateTime(subscription.currentPeriodEnd)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {providerUrl ? (
                      <ProviderLink href={providerUrl}>
                        {subscription.provider}
                      </ProviderLink>
                    ) : (
                      <span className="capitalize text-muted-foreground">
                        {subscription.provider}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

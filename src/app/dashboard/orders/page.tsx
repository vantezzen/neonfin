import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listOrders } from "@/lib/queries/orders";
import { listProjects } from "@/lib/queries/projects";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Status, type StatusTone } from "@/components/app/status";
import { CopyInline } from "@/components/app/copy";
import { ProviderLink } from "@/components/app/provider-link";
import { providerOrderUrl } from "@/lib/providers/links";
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

export const metadata = { title: "Orders" };

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  paid: { label: "Paid", tone: "success" },
  pending: { label: "Pending", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  expired: { label: "Expired", tone: "warning" },
  refunded: { label: "Refunded", tone: "warning" },
};

type Sort = "createdAt" | "status";
type Direction = "asc" | "desc";

function querySort(value: string | undefined): Sort {
  return value === "status" ? "status" : "createdAt";
}

function queryDirection(value: string | undefined): Direction {
  return value === "asc" ? "asc" : "desc";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    page?: string;
    sort?: string;
    direction?: string;
  }>;
}) {
  const {
    project: projectId,
    page: pageValue,
    sort: sortValue,
    direction: directionValue,
  } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageValue) || 1));
  const sort = querySort(sortValue);
  const direction = queryDirection(directionValue);
  const pageSize = 100;
  const user = await requireUser();
  const projects = await listProjects(user.id);
  const selectedProject = projects.find((project) => project.id === projectId);
  const orderRows = await listOrders(user.id, {
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
    projectId: selectedProject?.id,
    sort,
    direction,
  });
  const hasMore = orderRows.length > pageSize;
  const orders = orderRows.slice(0, pageSize);
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (selectedProject) params.set("project", selectedProject.id);
    if (sort !== "createdAt") params.set("sort", sort);
    if (direction !== "desc") params.set("direction", direction);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return `/dashboard/orders${query ? `?${query}` : ""}`;
  };
  const sortHref = (column: Sort) => {
    const nextDirection: Direction =
      sort === column && direction === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    if (selectedProject) params.set("project", selectedProject.id);
    if (column !== "createdAt") params.set("sort", column);
    if (nextDirection !== "desc") params.set("direction", nextDirection);
    const query = params.toString();
    return `/dashboard/orders${query ? `?${query}` : ""}`;
  };
  const sortLabel = (column: Sort) =>
    sort === column ? (direction === "asc" ? "↑" : "↓") : "";

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
      {projects.length > 1 ? (
        <form method="get" className="mb-4 flex items-center gap-2">
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
          <Button type="submit" variant="outline">Filter</Button>
        </form>
      ) : null}
      {orders.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="No orders yet"
          description="Orders appear as soon as your app starts its first checkout."
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Link href={sortHref("createdAt")} className="hover:text-foreground">
                    Date {sortLabel("createdAt")}
                  </Link>
                </TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>
                  <Link href={sortHref("status")} className="hover:text-foreground">
                    Status {sortLabel("status")}
                  </Link>
                </TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-0" />
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
                  o.price?.product.providerAccount?.environment ?? "production",
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
                        <CopyInline value={o.issuedCode} />
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
                      <ProviderLink
                        href={providerUrl}
                        title={`View this order in ${o.provider}`}
                      >
                        {o.provider}
                      </ProviderLink>
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
                <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Previous
                </Link>
              ) : <span />}
              <span className="text-sm text-muted-foreground">Page {page}</span>
              {hasMore ? (
                <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Next
                </Link>
              ) : <span />}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

import Link from "next/link";
import { Search, Wallet, X } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listWallets } from "@/lib/queries/wallets";
import { listProjects } from "@/lib/queries/projects";
import { generateCode } from "@/lib/actions/wallets";
import { toNum } from "@/lib/credits";
import { formatLargeNumber, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Wallets" };

const KIND_LABEL: Record<string, string> = {
  code: "Anonymous code",
  external: "External user",
};

type Sort = "lastSeenAt" | "kind";
type Direction = "asc" | "desc";

function querySort(value: string | undefined): Sort {
  return value === "kind" ? "kind" : "lastSeenAt";
}

function queryDirection(value: string | undefined): Direction {
  return value === "asc" ? "asc" : "desc";
}

export default async function WalletsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    project?: string;
    page?: string;
    sort?: string;
    direction?: string;
  }>;
}) {
  const {
    search,
    project: projectId,
    page: pageValue,
    sort: sortValue,
    direction: directionValue,
  } = await searchParams;
  const query = typeof search === "string" ? search : undefined;
  const page = Math.max(1, Math.floor(Number(pageValue) || 1));
  const sort = querySort(sortValue);
  const direction = queryDirection(directionValue);
  const pageSize = 100;

  const user = await requireUser();
  const projects = await listProjects(user.id);
  const selectedProject = projects.find((project) => project.id === projectId);
  const walletRows = await listWallets(user.id, {
    search: query,
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
    projectId: selectedProject?.id,
    sort,
    direction,
  });
  const hasMore = walletRows.length > pageSize;
  const rows = walletRows.slice(0, pageSize);
  const codeProjects = projects.filter((p) => p.mode === "credit_codes");
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (selectedProject) params.set("project", selectedProject.id);
    if (query) params.set("search", query);
    if (sort !== "lastSeenAt") params.set("sort", sort);
    if (direction !== "desc") params.set("direction", direction);
    if (nextPage > 1) params.set("page", String(nextPage));
    const search = params.toString();
    return `/dashboard/wallets${search ? `?${search}` : ""}`;
  };
  const sortHref = (column: Sort) => {
    const nextDirection: Direction =
      sort === column && direction === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();
    if (selectedProject) params.set("project", selectedProject.id);
    if (query) params.set("search", query);
    if (column !== "lastSeenAt") params.set("sort", column);
    if (nextDirection !== "desc") params.set("direction", nextDirection);
    const nextQuery = params.toString();
    return `/dashboard/wallets${nextQuery ? `?${nextQuery}` : ""}`;
  };
  const sortLabel = (column: Sort) =>
    sort === column ? (direction === "asc" ? "↑" : "↓") : "";

  return (
    <>
      <PageHeader
        title="Wallets"
        description={
          selectedProject
              ? `Search wallets and inspect ledgers for ${selectedProject.name}.`
              : "Search wallets, inspect ledgers, and adjust balances."
        }
        action={
          codeProjects.length > 0 ? (
            <FormDialog
              trigger="Generate code"
              triggerVariant="default"
              triggerSize="default"
              title="Generate a credit code"
              description="Mints a fresh wallet with the product's free grant applied."
              action={generateCode}
              submitLabel="Generate"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="gen-project">Project</Label>
                <NativeSelect id="gen-project" name="projectId" required>
                  {codeProjects.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </FormDialog>
          ) : null
        }
      />

      <form method="get" className="mb-4 flex items-center gap-2">
        {projects.length > 1 ? (
          <NativeSelect
            name="project"
            defaultValue={selectedProject?.id ?? ""}
            className="w-full max-w-48"
          >
            <NativeSelectOption value="">All projects</NativeSelectOption>
            {projects.map((project) => (
              <NativeSelectOption key={project.id} value={project.id}>
                {project.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={query}
            placeholder="Search code, email, order…"
            className="pl-8 font-mono placeholder:font-sans placeholder:normal-case"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        {query ? (
          <Link
            href={
              selectedProject
                ? `/dashboard/wallets?project=${selectedProject.id}`
                : "/dashboard/wallets"
            }
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear wallet search"
            title="Clear search"
          >
            <X className="size-4" />
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title={query ? `No wallets match “${query}”` : "No wallets yet"}
          description={
            query
              ? "Search by wallet code, external user id, customer email, order id, checkout id, or provider customer id."
              : "Wallets appear here automatically when the SDK creates them on a user's first visit."
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>
                  <Link href={sortHref("kind")} className="hover:text-foreground">
                    Kind {sortLabel("kind")}
                  </Link>
                </TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">
                  <Link href={sortHref("lastSeenAt")} className="hover:text-foreground">
                    Last seen {sortLabel("lastSeenAt")}
                  </Link>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => {
                const total = w.balances.reduce(
                  (s, b) => s + toNum(b.balance),
                  0,
                );
                const units = new Set(
                  w.balances.map((balance) => balance.product.creditUnit),
                );
                const creditSummary =
                  units.size === 1
                    ? `${formatLargeNumber(total)} ${[...units][0]}`
                    : `${w.balances.length} balances`;
                return (
                  <TableRow key={w.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/wallets/${w.id}`}
                        className="font-mono text-[13px] font-medium hover:underline"
                      >
                        {w.code ?? w.externalUserId ?? w.id}
                      </Link>
                    </TableCell>
                    <TableCell>{w.project.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {KIND_LABEL[w.kind] ?? w.kind}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {creditSummary}
                    </TableCell>
                    <TableCell
                      className="text-right text-muted-foreground tabular-nums"
                      title={w.lastSeenAt.toISOString()}
                    >
                      {formatDateTime(w.lastSeenAt)}
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

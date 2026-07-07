import Link from "next/link";
import { Search, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listWallets } from "@/lib/queries/wallets";
import { listProjects } from "@/lib/queries/projects";
import { generateCode } from "@/lib/actions/wallets";
import { toNum } from "@/lib/credits";
import { formatLargeNumber, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
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

export default async function WalletsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const query = typeof search === "string" ? search : undefined;

  const user = await requireUser();
  const [rows, projects] = await Promise.all([
    listWallets(user.id, { search: query }),
    listProjects(user.id),
  ]);
  const codeProjects = projects.filter((p) => p.mode === "credit_codes");

  return (
    <>
      <PageHeader
        title="Wallets"
        description="Search codes, inspect ledgers, and adjust balances."
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
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={query}
            placeholder="Search by code…"
            className="pl-8 font-mono placeholder:font-sans placeholder:normal-case"
            autoCapitalize="characters"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title={query ? `No wallets match “${query}”` : "No wallets yet"}
          description={
            query
              ? "Check the code for typos - codes look like SKIP-8F3K-L9PQ-2MVT."
              : "Wallets appear here automatically when the SDK creates them on a user's first visit."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => {
                const total = w.balances.reduce(
                  (s, b) => s + toNum(b.balance),
                  0,
                );
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
                      {formatLargeNumber(total)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatDateTime(w.lastSeenAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

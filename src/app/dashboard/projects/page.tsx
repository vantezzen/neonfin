import Link from "next/link";
import { ArrowRight, Boxes, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listProjects } from "@/lib/queries/projects";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Status } from "@/components/app/status";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Projects" };

const MODE_LABEL = {
  credit_codes: "Anonymous codes",
  external_auth: "External auth",
} as const;

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each side project that plugs into neonFin."
        action={
          <Link href="/dashboard/projects/new" className={cn(buttonVariants())}>
            <Plus className="size-4" />
            New project
          </Link>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<Boxes />}
          title="No projects yet"
          description="A project holds your products, prices, and API keys. Create one to get started."
          action={
            <Link
              href="/dashboard/projects/new"
              className={cn(buttonVariants())}
            >
              <Plus className="size-4" />
              New project
            </Link>
          }
        />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border">
          {projects.map((p) => {
            const live = p.products.some(
              (product) =>
                product.providerAccountId &&
                product.prices.some((price) => price.providerPriceId),
            );
            const count = p.products.length;
            return (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {p.name}
                    </span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      /{p.slug}
                    </span>
                  </div>
                  <span className="text-[13px] text-muted-foreground">
                    {count} product{count === 1 ? "" : "s"} ·{" "}
                    {MODE_LABEL[p.mode]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <Status
                    tone={live ? "success" : "warning"}
                    className="text-[13px] text-muted-foreground"
                  >
                    {live ? "Live" : "Setup needed"}
                  </Status>
                  <ArrowRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { X } from "lucide-react";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/auth/dal";
import { getProjectDetail } from "@/lib/queries/projects";
import { listProviderAccounts } from "@/lib/queries/providers";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProjectForm } from "@/components/dashboard/project-form";
import { ProductsSection } from "@/components/dashboard/products-section";
import { ApiKeysSection } from "@/components/dashboard/api-keys-section";
import { DevQuickstart } from "@/components/dashboard/dev-quickstart";
import { DeleteProjectButton } from "@/components/dashboard/delete-project-button";
import { ProjectTabs } from "@/components/dashboard/project-tabs";
import { ProjectFirstSteps } from "@/components/dashboard/project-first-steps";
import { CopyInline } from "@/components/app/copy";
import { DevAiCoding } from "@/components/dashboard/dev-ai-coding";
import { Status } from "@/components/app/status";
import { buttonVariants } from "@/components/ui/button";

const MODE_LABEL = {
  credit_codes: "Anonymous credit codes",
  external_auth: "External auth",
} as const;

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ "test-checkout"?: string; order?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getProjectDetail(id, user.id);
  if (!project) notFound();
  const providerAccounts = await listProviderAccounts(user.id);
  const appUrl = env().NEXT_PUBLIC_APP_URL;

  const publishableKey =
    project.apiKeys.find((k) => k.kind === "publishable" && !k.revokedAt)
      ?.publicValue ?? null;
  const projectSettings = {
    id: project.id,
    name: project.name,
    slug: project.slug,
    mode: project.mode,
    codePrefix: project.codePrefix,
    allowedOrigins: project.allowedOrigins,
    codeExpiresInDays: project.codeExpiresInDays,
    anonymousWalletsPerHour: project.anonymousWalletsPerHour,
    outboundWebhookUrl: project.outboundWebhookUrl,
    hasOutboundWebhookSecret: Boolean(project.outboundWebhookSecret),
    hasWallets: project.wallets.length > 0,
  };

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/projects", label: "Projects" }}
        title={project.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <CopyInline value={project.slug} label={`/${project.slug}`} />
            <span>·</span>
            <span>{MODE_LABEL[project.mode]}</span>
          </span>
        }
        action={
          <>
            <Link
              href={`/dashboard/orders?project=${project.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Orders
            </Link>
            <Link
              href={`/dashboard/wallets?project=${project.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Wallets
            </Link>
          </>
        }
      />

      <Suspense fallback={null}>
        <TestCheckoutOutcome
          projectId={project.id}
          searchParams={searchParams}
        />
      </Suspense>

      <div className="mb-6">
        <ProjectFirstSteps
          projectId={project.id}
          products={project.products}
          providerAccounts={providerAccounts}
          hasPublishableKey={Boolean(publishableKey)}
          hasAllowedOrigins={project.allowedOrigins.length > 0}
        />
      </div>

      <ProjectTabs
        products={
          <ProductsSection
            projectId={project.id}
            products={project.products}
            providerAccounts={providerAccounts}
          />
        }
        developers={
          <div className="flex flex-col gap-10">
            <ApiKeysSection projectId={project.id} keys={project.apiKeys} />
            <DevAiCoding appUrl={appUrl} publishableKey={publishableKey} />
            <DevQuickstart appUrl={appUrl} publishableKey={publishableKey} />
          </div>
        }
        settings={
          <div className="flex max-w-2xl flex-col gap-10">
            <ProjectForm project={projectSettings} />
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold tracking-tight text-destructive">
                Danger zone
              </h2>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-destructive/25 px-4 py-3.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    Delete this project
                  </span>
                  <p className="text-[13px] text-muted-foreground">
                    Removes its products, wallets, orders, and API keys. This
                    cannot be undone.
                  </p>
                </div>
                <DeleteProjectButton
                  projectId={project.id}
                  projectName={project.name}
                />
              </div>
            </section>
          </div>
        }
      />
    </>
  );
}

async function TestCheckoutOutcome({
  projectId,
  searchParams,
}: {
  projectId: string;
  searchParams: Promise<{ "test-checkout"?: string; order?: string }>;
}) {
  const outcome = await searchParams;
  const result = outcome["test-checkout"];
  if (result !== "success" && result !== "cancelled") return null;

  const order = outcome.order
    ? await db.query.orders.findFirst({
        where: and(
          eq(orders.id, outcome.order),
          eq(orders.projectId, projectId),
        ),
        columns: { status: true },
      })
    : null;
  const paid = order?.status === "paid";

  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
      <div className="flex-1">
        <Status tone={result === "success" && paid ? "success" : "neutral"}>
          {result === "cancelled"
            ? "Test checkout cancelled - no order was completed."
            : paid
              ? "Test payment received - your integration works end to end."
              : "Test checkout completed - waiting for the webhook to record it."}
        </Status>
        {result === "success" ? (
          <div className="mt-2 flex gap-4 text-xs">
            {paid ? (
              <>
                <Link
                  href={`/dashboard/orders?project=${projectId}`}
                  className="font-medium hover:underline"
                >
                  View order
                </Link>
                <Link
                  href="/dashboard/webhooks"
                  className="font-medium hover:underline"
                >
                  Webhook log
                </Link>
              </>
            ) : (
              <Link
                href="/dashboard/providers"
                className="font-medium hover:underline"
              >
                Provider status
              </Link>
            )}
          </div>
        ) : null}
      </div>
      <Link
        href={`/dashboard/projects/${projectId}`}
        aria-label="Dismiss test checkout outcome"
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </Link>
    </div>
  );
}

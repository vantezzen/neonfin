import { notFound } from "next/navigation";
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

const MODE_LABEL = {
  credit_codes: "Anonymous credit codes",
  external_auth: "External auth",
} as const;

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
      />

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
                <DeleteProjectButton projectId={project.id} />
              </div>
            </section>
          </div>
        }
      />
    </>
  );
}

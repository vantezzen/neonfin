import { PageHeader } from "@/components/dashboard/page-header";
import { ProjectWizard } from "@/components/app/project-wizard";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/projects", label: "Projects" }}
        title="New project"
        description="Create the project first, then finish products, prices, and integration from its setup guide."
      />
      <ProjectWizard />
    </>
  );
}

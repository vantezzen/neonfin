"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ProviderConnectWizard } from "@/components/dashboard/provider-connect-wizard";
import { ProjectWizardDialog } from "@/components/app/project-wizard";
import { FirstSteps, type FirstStep } from "@/components/app/first-steps";
import type { SetupState } from "@/lib/queries/dashboard";

/**
 * A state-driven "get started" card on the dashboard home. Each step reflects
 * real progress (from getSetupState) and opens the relevant wizard in place.
 * The whole card hides once setup is complete - see the early return.
 */
export function SetupChecklist({
  state,
  appUrl,
}: {
  state: SetupState;
  appUrl: string;
}) {
  if (state.complete) return null;

  const steps: FirstStep[] = [
    {
      done: state.hasProvider,
      title: "Connect a payment provider",
      description: "Add your Stripe or Polar keys so purchases can be charged.",
      action: (
        <div className="flex flex-wrap items-center gap-2">
          <ProviderConnectWizard appUrl={appUrl} size="sm" />
          <Link
            href="/docs/workflows/providers"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Setup guide
          </Link>
        </div>
      ),
    },
    {
      done: state.hasProject,
      title: "Create your first project",
      description:
        "Create the project, then finish products, prices, and integration there.",
      action: <ProjectWizardDialog />,
    },
    {
      done: state.isLive,
      title: "Finish project setup",
      description:
        "Add products and prices, attach checkout, then install the SDK.",
      action: state.firstProjectId ? (
        <Link
          href={`/dashboard/projects/${state.firstProjectId}`}
          className={cn(buttonVariants({ size: "sm" }))}
        >
          Open project
        </Link>
      ) : (
        <Link
          href="/docs/getting-started"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        >
          Read the guide
        </Link>
      ),
    },
  ];

  return (
    <FirstSteps
      title="Get started"
      description="Three steps from zero to your first paid credits."
      steps={steps}
    />
  );
}

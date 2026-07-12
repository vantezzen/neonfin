"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ProviderConnectWizard } from "@/components/dashboard/provider-connect-wizard";
import { ProjectWizardDialog } from "@/components/app/project-wizard";
import { FirstSteps, type FirstStep } from "@/components/app/first-steps";
import type { SetupState } from "@/lib/queries/dashboard";
import { Button } from "@/components/ui/button";

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
  const [completionDismissed, setCompletionDismissed] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage persists this one-time completion card.
    setCompletionDismissed(
      window.localStorage.getItem("pay:setup-complete-dismissed") === "true",
    );
  }, []);

  if (state.complete) {
    if (!state.completedRecently || completionDismissed) return null;
    return (
      <div className="rounded-xl border px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">You’re live 🎉</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Orders, wallets, and webhooks now fill in as your app gets used.
            </p>
            <div className="mt-3 flex gap-3 text-sm">
              <Link
                href="/docs/workflows"
                className="font-medium hover:underline"
              >
                Docs
              </Link>
              <Link
                href="/dashboard/orders"
                className="font-medium hover:underline"
              >
                Orders
              </Link>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss setup completion"
            onClick={() => {
              window.localStorage.setItem(
                "pay:setup-complete-dismissed",
                "true",
              );
              setCompletionDismissed(true);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  const steps: FirstStep[] = [
    {
      done: state.hasProject,
      title: "Create your first project",
      description:
        "Create the project, then finish products, prices, and integration there.",
      action: <ProjectWizardDialog />,
    },
    {
      done: state.hasProvider,
      title: "Connect a payment provider",
      description:
        "Paste a Stripe or Polar key. This powers checkout for every project.",
      note: state.incompleteProvider
        ? "Almost there - finish the webhook step so payments get recorded."
        : undefined,
      action: (
        <div className="flex flex-wrap items-center gap-2">
          <ProviderConnectWizard
            appUrl={appUrl}
            size="sm"
            resumeAccount={state.incompleteProvider ?? undefined}
          />
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
      done: state.isLive,
      title: "Create a product and go live",
      description: "Add a product and price, then run a test checkout.",
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

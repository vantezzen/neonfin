"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { FirstSteps, type FirstStep } from "@/components/app/first-steps";
import {
  AddPriceButton,
  NewProductButton,
  knownFeaturesOf,
  productPriceNoun,
  type ProductWithPrices,
  type ProviderOption,
} from "@/components/dashboard/products-section";

export function ProjectFirstSteps({
  projectId,
  products,
  providerAccounts,
  hasPublishableKey,
  hasAllowedOrigins,
}: {
  projectId: string;
  products: ProductWithPrices[];
  providerAccounts: ProviderOption[];
  hasPublishableKey: boolean;
  hasAllowedOrigins: boolean;
}) {
  const firstProduct =
    products.reduce<ProductWithPrices | null>(
      (first, product) =>
        !first || product.createdAt < first.createdAt ? product : first,
      null,
    ) ?? null;
  const knownFeatures = knownFeaturesOf(products);
  const actionNoun = firstProduct
    ? productPriceNoun(firstProduct.type)
    : "price";
  const stepNoun = firstProduct?.type === "subscription" ? "tier" : "price";
  const integrationKey = `pay:first-steps:${projectId}:integrated`;
  const originsKey = `pay:first-steps:${projectId}:origins-reviewed`;
  const [integrationDone, setIntegrationDone] = useState(false);
  const [originsDone, setOriginsDone] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is the external source for this user-confirmed checklist item.
      setIntegrationDone(
        window.localStorage.getItem(integrationKey) === "true",
      );
      setOriginsDone(window.localStorage.getItem(originsKey) === "true");
    } catch {
      // Ignore private-mode/storage failures; the step remains manually clickable.
    }
  }, [integrationKey, originsKey]);

  function markIntegrationDone() {
    setIntegrationDone(true);
    try {
      window.localStorage.setItem(integrationKey, "true");
    } catch {
      // Non-critical: the in-memory state still gives immediate feedback.
    }
  }

  function markOriginsDone() {
    setOriginsDone(true);
    try {
      window.localStorage.setItem(originsKey, "true");
    } catch {
      // Non-critical: the in-memory state still gives immediate feedback.
    }
  }

  const steps: FirstStep[] = [
    {
      done: products.length > 0,
      title: "Create a product",
      description:
        "Choose whether you sell credits, a subscription, or an unlock.",
      action: (
        <NewProductButton
          projectId={projectId}
          providerAccounts={providerAccounts}
          size="sm"
        />
      ),
    },
    {
      done: firstProduct ? firstProduct.prices.length > 0 : false,
      title: `Create a ${stepNoun}`,
      description:
        actionNoun === "tier"
          ? "Add the first tier for this subscription."
          : "Add the first purchasable price for this product.",
      action: firstProduct ? (
        <AddPriceButton
          product={firstProduct}
          projectId={projectId}
          knownFeatures={knownFeatures}
        />
      ) : null,
    },
    {
      done: hasPublishableKey && integrationDone,
      title: "Integrate into your app",
      description:
        "Open the quick-start snippets, then mark this done after wiring them into your app.",
      action: (
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/projects/${projectId}?tab=developers`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Developers
          </Link>
          <Button type="button" size="sm" onClick={markIntegrationDone}>
            <Check className="size-3.5" />
            Mark done
          </Button>
        </div>
      ),
    },
    {
      done: hasAllowedOrigins || originsDone,
      title: "Review allowed origins",
      description:
        "Restrict browser calls to your app's domains in Settings - recommended before launch.",
      action: (
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/projects/${projectId}?tab=settings&highlight=allowed-origins#allowed-origins`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Settings
          </Link>
          <Button type="button" size="sm" onClick={markOriginsDone}>
            <Check className="size-3.5" />
            Mark done
          </Button>
        </div>
      ),
    },
  ];

  if (steps.every((step) => step.done)) return null;

  return (
    <FirstSteps
      description="Finish the pieces that make this project usable in an app."
      steps={steps}
    />
  );
}

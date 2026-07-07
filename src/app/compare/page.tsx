import type { Metadata } from "next";
import { MarketingIndexPage } from "@/components/marketing/page";
import { MarketingShell } from "@/components/marketing/shell";
import { comparisons } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Billing Comparisons",
  description:
    "Compare neonFin with direct Stripe integration and custom billing infrastructure for side projects.",
  alternates: {
    canonical: "/compare",
  },
  openGraph: {
    title: "Billing comparisons · neonFin",
    description:
      "Understand when neonFin fits beside Stripe, Polar, and custom billing code for small developer products.",
    url: "/compare",
  },
};

export default function ComparePage() {
  return (
    <MarketingShell>
      <MarketingIndexPage
        eyebrow="Compare"
        title="Billing comparisons for side projects"
        description="Clear comparisons for developers deciding whether to wire payment providers directly, build custom billing infrastructure, or use neonFin as the reusable billing layer."
        pages={comparisons}
      />
    </MarketingShell>
  );
}

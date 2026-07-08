import type { Metadata } from "next";
import { MarketingIndexPage } from "@/components/marketing/page";
import { MarketingShell } from "@/components/marketing/shell";
import { comparisons } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Billing Comparisons",
  description:
    "Compare vantezzen/pay with direct Stripe integration and custom billing infrastructure for side projects.",
  alternates: {
    canonical: "/compare",
  },
  openGraph: {
    title: "Billing comparisons · vantezzen/pay",
    description:
      "Understand when vantezzen/pay fits beside Stripe, Polar, and custom billing code for small developer products.",
    url: "/compare",
  },
};

export default function ComparePage() {
  return (
    <MarketingShell>
      <MarketingIndexPage
        eyebrow="Compare"
        title="Billing comparisons for side projects"
        description="Clear comparisons for developers deciding whether to wire payment providers directly, build custom billing infrastructure, or use vantezzen/pay as the reusable billing layer."
        pages={comparisons}
      />
    </MarketingShell>
  );
}

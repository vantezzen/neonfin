import type { Metadata } from "next";
import { MarketingIndexPage } from "@/components/marketing/page";
import { MarketingShell } from "@/components/marketing/shell";
import { guides } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Guides for Side Project Billing",
  description:
    "Practical neonFin guides for billing side projects, no-auth monetization, shadcn payment components, and self-hosted payment layers.",
  alternates: {
    canonical: "/guides",
  },
  openGraph: {
    title: "Guides for side project billing · neonFin",
    description:
      "Learn how to charge for small developer products without building the billing layer from scratch.",
    url: "/guides",
  },
};

export default function GuidesPage() {
  return (
    <MarketingShell>
      <MarketingIndexPage
        eyebrow="Guides"
        title="Billing guides for small developer products"
        description="Deep, practical guides for charging for side projects, selling access without auth, installing shadcn payment components, and running your own payment layer."
        pages={guides}
      />
    </MarketingShell>
  );
}

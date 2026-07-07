import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingArticlePage } from "@/components/marketing/page";
import { MarketingShell } from "@/components/marketing/shell";
import {
  comparisons,
  getMarketingPage,
  marketingPath,
} from "@/lib/marketing";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return comparisons.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getMarketingPage("comparison", slug);

  if (!page) {
    return {};
  }

  return {
    title: page.seoTitle,
    description: page.description,
    alternates: {
      canonical: marketingPath(page),
    },
    openGraph: {
      title: page.seoTitle,
      description: page.description,
      url: marketingPath(page),
      type: "article",
      publishedTime: page.updated,
      modifiedTime: page.updated,
    },
    twitter: {
      card: "summary",
      title: page.seoTitle,
      description: page.description,
    },
  };
}

export default async function ComparisonPage({ params }: Props) {
  const { slug } = await params;
  const page = getMarketingPage("comparison", slug);

  if (!page) {
    notFound();
  }

  return (
    <MarketingShell>
      <MarketingArticlePage page={page} />
    </MarketingShell>
  );
}

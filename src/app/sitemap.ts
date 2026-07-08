import type { MetadataRoute } from "next";
import { source } from "@/lib/docs/source";
import { marketingPages, marketingPath } from "@/lib/marketing";
import { siteUrl } from "@/lib/seo";

const movedDocs = new Set([
  "/docs/installation",
  "/docs/client",
  "/docs/deploy",
]);

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = source
    .getPages()
    .filter((page) => !movedDocs.has(page.url))
    .map((page) => ({
      url: siteUrl(page.url),
      changeFrequency: "monthly" as const,
      priority: page.url === "/docs" ? 0.9 : 0.7,
    }));

  return [
    {
      url: siteUrl("/"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: siteUrl("/guides"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: siteUrl("/compare"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...marketingPages.map((page) => ({
      url: siteUrl(marketingPath(page)),
      lastModified: page.updated,
      changeFrequency: "monthly" as const,
      priority: page.type === "guide" ? 0.85 : 0.75,
    })),
    ...docs,
  ];
}

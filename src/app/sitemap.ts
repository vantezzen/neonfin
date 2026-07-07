import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { siteUrl } from "@/lib/seo";

const movedDocs = new Set(["/docs/installation", "/docs/client", "/docs/deploy"]);

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
    ...docs,
  ];
}

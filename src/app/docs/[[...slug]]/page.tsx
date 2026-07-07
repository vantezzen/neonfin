import { source } from "@/lib/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { notFound, permanentRedirect } from "next/navigation";
import { getMDXComponents } from "@/components/docs/mdx";
import type { Metadata } from "next";
import { createRelativeLink } from "fumadocs-ui/mdx";

const movedDocs = new Map([
  ["/docs/installation", "/docs/getting-started"],
  ["/docs/client", "/docs/api/client-reference"],
  ["/docs/deploy", "/docs/self-host"],
]);

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const movedTo = movedDocs.get(page.url);
  if (movedTo && movedTo !== page.url) permanentRedirect(movedTo);

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/docs/[[...slug]]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: `${page.data.title} · Docs`,
    description: page.data.description,
    alternates: {
      canonical: page.url,
    },
    openGraph: {
      title: `${page.data.title} · neonFin Docs`,
      description: page.data.description,
      url: page.url,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: `${page.data.title} · neonFin Docs`,
      description: page.data.description,
    },
  };
}

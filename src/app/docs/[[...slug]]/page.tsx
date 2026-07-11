import { source } from "@/lib/docs/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import { notFound, permanentRedirect } from "next/navigation";
import { getMDXComponents } from "@/components/docs/mdx";
import type { Metadata } from "next";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { movedDocs } from "@/lib/docs/moved";

export default async function Page(props: PageProps<"/docs/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const movedTo = movedDocs.get(page.url);
  if (movedTo && movedTo !== page.url) permanentRedirect(movedTo);
  const markdownUrl = `${page.url}.mdx`;

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pt-2 pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/vantezzen/pay/blob/main/content/docs/${page.path}`}
        />
      </div>
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
      title: `${page.data.title} · vantezzen/pay Docs`,
      description: page.data.description,
      url: page.url,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: `${page.data.title} · vantezzen/pay Docs`,
      description: page.data.description,
    },
  };
}

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { jsonLd, siteName, siteUrl } from "@/lib/seo";
import {
  type MarketingPage,
  marketingPath,
  marketingPages,
} from "@/lib/marketing";
import { cn } from "@/lib/utils";

export function MarketingIndexPage({
  title,
  description,
  eyebrow,
  pages,
}: {
  title: string;
  description: string;
  eyebrow: string;
  pages: MarketingPage[];
}) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl("/"),
    },
    hasPart: pages.map((page) => ({
      "@type": "Article",
      headline: page.title,
      description: page.description,
      url: siteUrl(marketingPath(page)),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <section className="border-b bg-canvas">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-24 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
              {eyebrow}
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {description}
            </p>
          </div>
          <div className="rounded-xl border bg-background p-5 shadow-xs">
            <p className="text-sm font-medium">Discovery focus</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "side project billing",
                "no-auth monetization",
                "shadcn payments",
                "self-hosted payment layer",
              ].map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Practical pages for developers who are already trying to charge
              for a useful small tool.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
        <div className="grid gap-4 sm:grid-cols-2">
          {pages.map((page) => (
            <Link
              key={page.slug}
              href={marketingPath(page)}
              className="group flex min-h-72 flex-col justify-between rounded-xl border bg-background p-6 transition-all duration-200 hover:border-foreground/15 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[0_12px_32px_-18px_rgb(0_0_0/0.22)]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{page.eyebrow}</Badge>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Updated {formatDate(page.updated)}
                  </span>
                </div>
                <h2 className="mt-5 text-2xl leading-snug font-semibold tracking-tight text-balance">
                  {page.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {page.description}
                </p>
              </div>
              <div className="mt-8 flex items-center justify-between gap-4 border-t pt-5">
                <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {page.intent}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export function MarketingArticlePage({ page }: { page: MarketingPage }) {
  const related = marketingPages
    .filter((candidate) => candidate.slug !== page.slug)
    .filter((candidate) =>
      candidate.tags.some((tag) => page.tags.includes(tag)),
    )
    .slice(0, 3);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": siteUrl(`${marketingPath(page)}#article`),
        headline: page.seoTitle,
        description: page.description,
        dateModified: page.updated,
        author: {
          "@type": "Organization",
          name: siteName,
        },
        publisher: {
          "@type": "Organization",
          name: siteName,
        },
        mainEntityOfPage: siteUrl(marketingPath(page)),
      },
      {
        "@type": "FAQPage",
        "@id": siteUrl(`${marketingPath(page)}#faq`),
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <article>
        <section className="border-b bg-canvas">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 sm:py-20 lg:grid-cols-[1fr_360px]">
            <div>
              <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                {page.eyebrow}
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
                {page.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {page.description}
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {page.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <aside className="rounded-xl border bg-background p-5 shadow-xs lg:self-end">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4" />
                Search intent
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {page.intent}
              </p>
              <div className="mt-5 flex items-center gap-2 border-t pt-4 font-mono text-[11px] text-muted-foreground">
                <Clock3 className="size-3.5" />
                Updated {formatDate(page.updated)}
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-xl border bg-background p-4">
              <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                On this page
              </p>
              <nav className="mt-4 flex flex-col gap-2 text-sm">
                {page.sections.map((section) => (
                  <a
                    key={section.title}
                    href={`#${sectionId(section.title)}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {section.title}
                  </a>
                ))}
                <a
                  href="#faq"
                  className="text-muted-foreground hover:text-foreground"
                >
                  FAQ
                </a>
              </nav>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="grid gap-3 sm:grid-cols-3">
              {page.heroBullets.map((bullet) => (
                <div
                  key={bullet}
                  className="rounded-xl border bg-background p-4 text-sm leading-relaxed text-muted-foreground"
                >
                  <CheckCircle2 className="mb-3 size-4 text-foreground" />
                  {bullet}
                </div>
              ))}
            </div>

            <div className="mt-10 space-y-5">
              {page.sections.map((section) => (
                <section
                  key={section.title}
                  id={sectionId(section.title)}
                  className="scroll-mt-24 rounded-xl border bg-background p-6 sm:p-8"
                >
                  <h2 className="text-2xl font-semibold tracking-tight text-balance">
                    {section.title}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {section.body}
                  </p>
                  {section.bullets ? (
                    <ul className="mt-6 grid gap-3">
                      {section.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
                        >
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {section.code ? (
                    <pre className="mt-6 overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
                      <code>{section.code}</code>
                    </pre>
                  ) : null}
                </section>
              ))}
            </div>

            <section
              id="faq"
              className="mt-5 scroll-mt-24 rounded-xl border bg-background p-6 sm:p-8"
            >
              <div className="flex items-center gap-2">
                <FileText className="size-4" />
                <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
              </div>
              <div className="mt-6 divide-y">
                {page.faqs.map((faq) => (
                  <div key={faq.question} className="py-5 first:pt-0 last:pb-0">
                    <h3 className="text-sm font-medium">{faq.question}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-5 overflow-hidden rounded-xl bg-primary p-8 text-primary-foreground sm:p-10">
              <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-balance">
                {page.cta.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/70">
                {page.cta.body}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className={cn(
                    buttonVariants(),
                    "bg-primary-foreground text-primary hover:bg-primary-foreground/90",
                  )}
                >
                  Get started
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/docs/getting-started"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10",
                  )}
                >
                  Read the quickstart
                </Link>
              </div>
            </section>

            {related.length > 0 ? (
              <section className="mt-12">
                <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                  Related
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {related.map((item) => (
                    <Link
                      key={item.slug}
                      href={marketingPath(item)}
                      className="group rounded-xl border bg-background p-4 text-sm transition-colors hover:border-foreground/15"
                    >
                      <span className="text-muted-foreground">
                        {item.eyebrow}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-3 font-medium">
                        {item.title}
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </article>
    </>
  );
}

function sectionId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

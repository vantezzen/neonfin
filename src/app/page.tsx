import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  KeyRound,
  Plug,
  RefreshCw,
  ServerCog,
  Ticket,
  Wallet,
} from "lucide-react";
import appLogo from "@/app/icon.png";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/auth/dal";
import { jsonLd, siteDescription, siteName, siteUrl } from "@/lib/seo";
import { buttonVariants } from "@/components/ui/button";
import { CodeSnippet } from "@/components/app/copy";
import { HeroDemo } from "@/components/landing/hero-demo";
import dashboardImage from "@/assets/dashboard.png";

export const metadata: Metadata = {
  title: "Credits and Checkout for Side Projects",
  description:
    "Connect Stripe or Polar once, define credits, and install shadcn payment components for wallets, checkout, and gates in every project you ship.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "vantezzen/pay - credits and checkout for side projects",
    description:
      "Self-hosted credits, wallets, checkout, and shadcn payment components for small developer products.",
    url: "/",
  },
};

const GATE_SNIPPET = `const { deduct } = useCredits();

<CreditGate cost={10}>
  <Button onClick={() => deduct(10)}>
    Process file
  </Button>
</CreditGate>`;

const STEPS = [
  {
    title: "Connect a provider once",
    body: "Paste a Stripe or Polar key. vantezzen/pay manages the catalog and listens for payments.",
  },
  {
    title: "Define products & credits",
    body: "Minutes, images, runs - with prices and an optional free monthly allowance.",
  },
  {
    title: "Paste three snippets",
    body: "Install the components, wrap your app, call deduct() when work starts. Done.",
  },
] as const;

const FEATURES = [
  {
    icon: Ticket,
    title: "No auth required, unless you already have one",
    body: "Visitors get a wallet on their first visit and can restore it on any device. Great for tools too small to deserve auth.",
  },
  {
    icon: Wallet,
    title: "Credits, not invoices",
    body: "Sell minutes, images, or runs. Free monthly allowances and retry-safe spending are built in.",
  },
  {
    icon: Plug,
    title: "No extra fees, providers keep the money",
    body: "Taxes, invoices, and subscriptions stay with Stripe or Polar. vantezzen/pay adds no extra layers or fees.",
  },
  {
    icon: KeyRound,
    title: "Components you own",
    body: "Balance, purchase, and gate components install into your codebase and match your theme.",
  },
  {
    icon: RefreshCw,
    title: "Checkout resumes itself",
    body: "After paying, users land right back where they were - balance updated, nothing to build.",
  },
  {
    icon: ServerCog,
    title: "Yours to run",
    body: "One small self-hosted app powers payments for every project you'll ever ship.",
  },
] as const;

/* ---------------------------------------------------------------- nav */

function AuthButtonsFallback() {
  return (
    <>
      <Link
        href="/login"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "text-muted-foreground",
        )}
      >
        Sign in
      </Link>
      <Link href="/register" className={cn(buttonVariants(), "ml-1")}>
        Get started
      </Link>
    </>
  );
}

// Session comes from cookies (dynamic) - must stream inside <Suspense> so the
// rest of the page stays a static shell.
async function NavAuth() {
  const session = await getSession();
  if (session) {
    return (
      <Link href="/dashboard" className={cn(buttonVariants(), "ml-1")}>
        Dashboard
        <ArrowRight className="size-4" />
      </Link>
    );
  }
  return <AuthButtonsFallback />;
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src={appLogo}
            alt=""
            width={26}
            height={26}
            className="rounded-md"
          />
          <span className="text-[15px] font-semibold tracking-tight">
            vantezzen/pay
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/guides"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "text-muted-foreground",
            )}
          >
            Guides
          </Link>
          <Link
            href="/docs"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "text-muted-foreground",
            )}
          >
            Docs
          </Link>
          <Suspense fallback={<AuthButtonsFallback />}>
            <NavAuth />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Aurora backdrop - the logo's coral/green/violet, barely there. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(480px_260px_at_26%_8%,--theme(--color-rose-400/9%),transparent_70%),radial-gradient(520px_280px_at_74%_6%,--theme(--color-violet-400/10%),transparent_70%),radial-gradient(640px_320px_at_50%_45%,--theme(--color-emerald-400/7%),transparent_70%)]"
      />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-6 pt-20 pb-14 text-center sm:pt-60">
        <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance duration-700 fill-mode-backwards delay-100 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 sm:text-[3.4rem]">
          Charge for your side project
          <br />
          without building billing
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-balance text-muted-foreground duration-700 fill-mode-backwards delay-200 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 sm:text-lg">
          The billing microservice for all your side projects:
          <br /> Connect Stripe or Polar once, define credits, and every project
          you ship gets wallets, checkout, and drop-in components - in an
          afternoon, not a week.
        </p>
        <div className="mt-9 flex items-center gap-3 duration-700 fill-mode-backwards delay-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3">
          <Link
            href="/register"
            className={cn(buttonVariants({ size: "lg" }), "px-5")}
          >
            Start selling
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/docs"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "px-5",
            )}
          >
            Read the docs
          </Link>
        </div>
        <p className="mt-6 font-mono text-xs text-muted-foreground/70 duration-700 fill-mode-backwards delay-400 motion-safe:animate-in motion-safe:fade-in">
          Stripe & Polar · shadcn registry · self-hostable
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- demo */

function Demo() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6">
      <div className="grid overflow-hidden rounded-2xl border bg-canvas shadow-xs lg:grid-cols-2">
        {/* The app the user sees - animated spend → gate → top-up loop. */}
        <div className="relative flex items-center justify-center border-b px-8 py-12 sm:px-12 sm:py-16 lg:border-r lg:border-b-0">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(--theme(--color-foreground/5%)_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
          />
          <HeroDemo className="relative" />
        </div>
        {/* The code that ships it */}
        <div className="flex flex-col justify-center gap-3 p-8 sm:p-12">
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            The entire integration
          </span>
          <CodeSnippet code={GATE_SNIPPET} />
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            The gate shows your feature while credits last and swaps in the
            purchase flow when they run out - the loop on the left, verbatim.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- steps */

function Steps() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
      <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
        How it works
      </span>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        One afternoon, three steps
      </h2>
      <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="relative flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background font-mono text-xs text-muted-foreground">
                {i + 1}
              </span>
              {i < STEPS.length - 1 ? (
                <span className="hidden h-px flex-1 bg-border sm:block" />
              ) : null}
            </div>
            <h3 className="mt-1 text-sm font-semibold">{step.title}</h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- features */

function Features() {
  return (
    <section className="border-y bg-canvas">
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
          Why vantezzen/pay
        </span>
        <h2 className="mt-2 max-w-md text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          The layer Stripe leaves to you - handled
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Providers move money. The wallets, metering, and UI around them are
          what eat the week - that layer is vantezzen/pay.
        </p>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group flex flex-col gap-3 rounded-xl border bg-background p-5 transition-all duration-200 hover:border-foreground/15 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.15)]"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-4" />
              </span>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>

        <Image
          src={dashboardImage}
          alt="vantezzen/pay dashboard"
          width={1200}
          className={cn("mt-16 rounded-xl shadow-sm")}
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ cta+footer */

async function CtaButton() {
  const session = await getSession();
  return (
    <Link
      href={session ? "/dashboard" : "/register"}
      className={cn(
        buttonVariants({ size: "lg" }),
        "bg-primary-foreground px-5 text-primary hover:bg-primary-foreground/90",
      )}
    >
      {session ? "Open your dashboard" : "Create your account"}
      <ArrowRight className="size-4" />
    </Link>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center ring-1 ring-primary/20 sm:px-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-[radial-gradient(320px_150px_at_35%_100%,--theme(--color-rose-400/22%),transparent),radial-gradient(320px_150px_at_65%_100%,--theme(--color-violet-400/22%),transparent),radial-gradient(400px_170px_at_50%_100%,--theme(--color-emerald-400/12%),transparent)]"
        />
        <h2 className="relative text-3xl font-semibold tracking-tight text-balance text-primary-foreground sm:text-4xl">
          Ship the fun part
        </h2>
        <p className="relative mx-auto mt-4 max-w-md text-sm leading-relaxed text-balance text-primary-foreground/70">
          Set up vantezzen/pay once. Every side project after that gets payments for
          the cost of a copy-paste.
        </p>
        <div className="relative mt-8 flex justify-center">
          <Suspense
            fallback={
              <span
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-primary-foreground px-5 text-primary",
                )}
              >
                Create your account
                <ArrowRight className="size-4" />
              </span>
            }
          >
            <CtaButton />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Image
            src={appLogo}
            alt=""
            width={20}
            height={20}
            className="rounded"
          />
          <span className="font-medium text-foreground">vantezzen/pay</span>
          <span>· payments for side projects</span>
        </div>
        <nav className="flex items-center gap-5 text-[13px] text-muted-foreground">
          <Link href="/guides" className="hover:text-foreground">
            Guides
          </Link>
          <Link href="/compare" className="hover:text-foreground">
            Compare
          </Link>
          <Link href="/docs" className="hover:text-foreground">
            Docs
          </Link>
          <Link href="/docs/self-host" className="hover:text-foreground">
            Self-host
          </Link>
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": siteUrl("/#software"),
        name: siteName,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: siteUrl("/"),
        description: siteDescription,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
      {
        "@type": "WebSite",
        "@id": siteUrl("/#website"),
        name: siteName,
        url: siteUrl("/"),
        description: siteDescription,
      },
    ],
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <Nav />
      <main className="flex-1">
        <Hero />
        <Demo />
        <Steps />
        <Features />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

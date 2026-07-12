import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import appLogo from "@/app/icon.png";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
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
            href="https://github.com/vantezzen/pay"
            className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground")}
          >
            <GitHubIcon /> GitHub
          </Link>
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
            href="/compare"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "text-muted-foreground",
            )}
          >
            Compare
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
          <Link href="/register" className={cn(buttonVariants(), "ml-1")}>
            Get started
            <ArrowRight className="size-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.02c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.74-1.55-2.57-.3-5.27-1.29-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
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
          <Link href="https://github.com/vantezzen/pay" className="hover:text-foreground">GitHub</Link>
          <Link href="/docs/llms.txt" className="hover:text-foreground">llms.txt</Link>
        </nav>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

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

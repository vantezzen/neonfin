import type { Metadata } from "next";
import Link from "next/link";
import { Aperture } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PayProvider } from "@/components/pay/provider";

export const metadata: Metadata = {
  title: { default: "Demo · vantezzen/pay", template: "%s · vantezzen/pay" },
  robots: {
    index: false,
    follow: false,
  },
};

export default function ExampleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_EXAMPLE_PAY_URL;
  const publishableKey = process.env.NEXT_PUBLIC_EXAMPLE_PAY_KEY;

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
              <Aperture className="size-4" />
            </span>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-semibold">Prism Studio</span>
              <Link
                href="/"
                className="hidden shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline"
              >
                a vantezzen/pay demo
              </Link>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/docs"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Docs
            </Link>
            <Link href="/register" className={buttonVariants({ size: "sm" })}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-x-hidden">
        {baseUrl && publishableKey ? (
          <PayProvider baseUrl={baseUrl} publishableKey={publishableKey}>
            {children}
          </PayProvider>
        ) : (
          <div className="mx-auto mt-6 max-w-md rounded-xl border bg-background p-6 text-center">
            <p className="font-medium">Demo not configured</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Set <code>NEXT_PUBLIC_EXAMPLE_PAY_URL</code> and{" "}
              <code>NEXT_PUBLIC_EXAMPLE_PAY_KEY</code>, then follow{" "}
              <code>src/app/example/SETUP.md</code> to create the demo catalog
              in your dashboard.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <p>Built with the vantezzen/pay registry components.</p>
          <div className="flex items-center gap-4">
            <Link
              href="/docs/getting-started/quickstart"
              className="transition-colors hover:text-foreground"
            >
              Quickstart
            </Link>
            <Link
              href="/docs"
              className="transition-colors hover:text-foreground"
            >
              Docs
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

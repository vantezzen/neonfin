import type { Metadata } from "next";
import { PayProvider } from "@/components/pay/provider";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { default: "Example · vantezzen/pay", template: "%s · vantezzen/pay" },
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
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="border-b bg-background/80 px-6 py-4">
        <div className="mx-auto max-w-5xl"><Link href="/" className="font-semibold">vantezzen/pay</Link></div>
      </header>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <PayProvider
            baseUrl={process.env.NEXT_PUBLIC_EXAMPLE_PAY_URL!}
            publishableKey={process.env.NEXT_PUBLIC_EXAMPLE_PAY_KEY!}
          >
            {children}
          </PayProvider>
        </div>
      </main>
      <footer className="px-6 py-10">
        <div className="mx-auto max-w-5xl rounded-xl border bg-background p-6 text-center">
          <p className="font-medium">Like what you see? This whole page is the registry components with default styling.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/register" className={buttonVariants()}>Get started</Link>
            <Link href="/docs" className={buttonVariants({ variant: "outline" })}>Read the docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import { PayProvider } from "@/components/pay/provider";

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
    <div className="flex min-h-svh bg-muted/30">
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
    </div>
  );
}

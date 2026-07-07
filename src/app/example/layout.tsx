import type { Metadata } from "next";
import { NeonfinProvider } from "@/components/neonfin/provider";

export const metadata: Metadata = {
  title: { default: "Example · neonFin", template: "%s · neonFin" },
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
          <NeonfinProvider
            baseUrl={process.env.NEXT_PUBLIC_EXAMPLE_NEONFIN_URL!}
            publishableKey={process.env.NEXT_PUBLIC_EXAMPLE_NEONFIN_KEY!}
          >
            {children}
          </NeonfinProvider>
        </div>
      </main>
    </div>
  );
}

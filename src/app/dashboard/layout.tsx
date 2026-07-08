import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { DashboardNav, MobileNav } from "@/components/dashboard/nav";
import { NavUser } from "@/components/dashboard/nav-user";

export const metadata: Metadata = {
  title: { default: "Dashboard · vantezzen/pay", template: "%s · vantezzen/pay" },
  robots: {
    index: false,
    follow: false,
  },
};

// Auth touches headers()/cookies() - dynamic per request. With Cache
// Components that must live inside a <Suspense> boundary so the static shell
// can prerender while the gated content streams.
async function Guarded({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = (
    <Suspense fallback={null}>
      <NavUser />
    </Suspense>
  );

  return (
    <div className="flex min-h-svh bg-canvas">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 lg:block">
        <Suspense fallback={null}>
          <DashboardNav footer={account} />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <MobileNav footer={account} />
        </Suspense>
        {/* The content "sheet": a white panel floating on the gray canvas. */}
        <main className="flex flex-1 flex-col px-2 pb-2 lg:py-2 lg:pl-0">
          <div className="flex-1 rounded-2xl border bg-background shadow-xs">
            <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
              <Suspense fallback={null}>
                <Guarded>{children}</Guarded>
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

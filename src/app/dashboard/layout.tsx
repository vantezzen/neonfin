import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { DashboardNav, MobileNav } from "@/components/dashboard/nav";
import { NavUser } from "@/components/dashboard/nav-user";
import { Skeleton } from "@/components/ui/skeleton";

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
    <Suspense fallback={<Skeleton className="h-8 w-32" />}>
      <NavUser />
    </Suspense>
  );

  return (
    <div className="flex min-h-svh bg-canvas">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 lg:block">
        <Suspense fallback={<NavSkeleton />}>
          <DashboardNav footer={account} />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<Skeleton className="h-10 w-full" />}>
          <MobileNav footer={account} />
        </Suspense>
        {/* The content "sheet": a white panel floating on the gray canvas. */}
        <main className="flex flex-1 flex-col px-2 pb-2 lg:py-2 lg:pl-0">
          <div className="flex-1 rounded-2xl border bg-background shadow-xs">
            <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
              <Suspense fallback={<DashboardLoadingFallback />}>
                <Guarded>{children}</Guarded>
              </Suspense>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function NavSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function DashboardLoadingFallback() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";

export default function DashboardNotFound() {
  return (
    <EmptyState
      title="Not found"
      description="This page doesn’t exist or you don’t have access to it."
      action={<Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link>}
    />
  );
}

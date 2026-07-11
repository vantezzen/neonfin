"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-64 flex-col items-start justify-center gap-3">
      <h1 className="text-lg font-semibold">We couldn&apos;t load this page</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Please try again. If this keeps happening, use the error reference below
        when you contact support.
      </p>
      {error.digest ? (
        <code className="text-xs text-muted-foreground">{error.digest}</code>
      ) : null}
      <Button type="button" onClick={unstable_retry}>
        Try again
      </Button>
    </div>
  );
}

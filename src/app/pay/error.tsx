"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function PayErrorPage({
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
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">We couldn&apos;t load your payment details</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your payment has not been changed. Try again in a moment.
      </p>
      <Button type="button" onClick={unstable_retry}>
        Try again
      </Button>
    </div>
  );
}

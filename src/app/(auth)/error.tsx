"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AuthError({
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
    <div className="flex flex-col gap-3 p-6">
      <h1 className="text-lg font-semibold">We couldn&apos;t load this page</h1>
      <p className="text-sm text-muted-foreground">Please try again.</p>
      <Button type="button" className="w-fit" onClick={unstable_retry}>
        Try again
      </Button>
    </div>
  );
}

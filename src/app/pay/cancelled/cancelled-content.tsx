"use client";

import { useSyncExternalStore } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

function popupOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === value ? value : null;
  } catch {
    return null;
  }
}

const subscribeToBrowser = () => () => {};

export function CancelledContent({ returnOrigin }: { returnOrigin?: string }) {
  const targetOrigin = popupOrigin(returnOrigin);
  const isBrowser = useSyncExternalStore(
    subscribeToBrowser,
    () => true,
    () => false,
  );
  const canReturn =
    isBrowser && !window.opener && targetOrigin;

  return (
    <div className="max-w-md text-center">
      <XCircle className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-3 text-xl font-semibold tracking-tight">
        Checkout cancelled
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        No charge was made. Your items are still available whenever you’re
        ready.
      </p>
      {canReturn ? (
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          onClick={() => window.location.assign(targetOrigin)}
        >
          Return to app
        </Button>
      ) : null}
    </div>
  );
}

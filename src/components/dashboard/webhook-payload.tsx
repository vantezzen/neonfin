"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WebhookPayload({ eventId }: { eventId: string }) {
  const [payload, setPayload] = useState<unknown>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dashboard/webhooks/${eventId}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as { payload?: unknown; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load payload");
      setPayload(data.payload);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load payload");
    } finally {
      setLoading(false);
    }
  }

  if (payload !== undefined) {
    return (
      <pre className="max-h-96 overflow-auto border-t bg-muted/30 p-4 font-mono text-xs leading-relaxed">
        {JSON.stringify(payload, null, 2)}
      </pre>
    );
  }
  return (
    <div className="border-t bg-muted/30 px-4 py-2.5">
      <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
        {loading ? <Loader2 className="size-3 animate-spin" /> : null}
        {loading ? "Loading…" : "Load payload"}
      </Button>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

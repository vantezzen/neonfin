import { ChevronDown, Webhook } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { replayWebhookEvent } from "@/lib/actions/webhooks";
import { listWebhookEvents } from "@/lib/queries/orders";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Status, type StatusTone } from "@/components/app/status";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Webhooks" };

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  processed: { label: "Processed", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
};

export default async function WebhooksPage() {
  const user = await requireUser();
  const events = await listWebhookEvents(user.id);

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Provider events received, verified, and processed."
      />
      {events.length === 0 ? (
        <EmptyState
          icon={<Webhook />}
          title="No webhook events yet"
          description="Add the endpoint shown on the Providers page, then complete a test checkout."
        />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border">
          {events.map((e) => {
            const status = STATUS[e.status] ?? {
              label: e.status,
              tone: "neutral" as const,
            };
            return (
              <details key={e.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground/60 transition-transform group-open:rotate-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                    <code className="truncate font-mono text-[13px] font-medium">
                      {e.type}
                    </code>
                    <span className="text-xs text-muted-foreground capitalize">
                      {e.provider}
                    </span>
                    {e.error ? (
                      <span className="truncate text-xs text-destructive">
                        {e.error}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <Status tone={status.tone} className="text-[13px]">
                      {status.label}
                    </Status>
                    <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                      {formatDateTime(e.createdAt)}
                    </span>
                  </div>
                </summary>
                <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    Replay re-runs fulfillment from the stored verified payload.
                  </p>
                  <form action={replayWebhookEvent}>
                    <input type="hidden" name="id" value={e.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Replay
                    </Button>
                  </form>
                </div>
                <pre className="max-h-96 overflow-auto border-t bg-muted/30 p-4 font-mono text-xs leading-relaxed">
                  {JSON.stringify(e.payload, null, 2)}
                </pre>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}

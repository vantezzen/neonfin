import Link from "next/link";
import { ChevronDown, Webhook } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listWebhookEvents } from "@/lib/queries/orders";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Status, type StatusTone } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { ReplayWebhookButton } from "@/components/dashboard/replay-webhook-button";
import { WebhookPayload } from "@/components/dashboard/webhook-payload";
import { buttonVariants } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

export const metadata = { title: "Webhooks" };

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "neutral" },
  processed: { label: "Processed", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
};

function queryProvider(value: string | undefined): "stripe" | "polar" | undefined {
  return value === "stripe" || value === "polar" ? value : undefined;
}

function queryStatus(
  value: string | undefined,
): "pending" | "processed" | "skipped" | "error" | undefined {
  return ["pending", "processed", "skipped", "error"].includes(value ?? "")
    ? (value as "pending" | "processed" | "skipped" | "error")
    : undefined;
}

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; provider?: string; status?: string }>;
}) {
  const {
    page: pageValue,
    provider: providerValue,
    status: statusValue,
  } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageValue) || 1));
  const provider = queryProvider(providerValue);
  const filterStatus = queryStatus(statusValue);
  const pageSize = 25;
  const user = await requireUser();
  const eventRows = await listWebhookEvents(user.id, {
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
    provider,
    status: filterStatus,
  });
  const hasMore = eventRows.length > pageSize;
  const events = eventRows.slice(0, pageSize);
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (provider) params.set("provider", provider);
    if (filterStatus) params.set("status", filterStatus);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return `/dashboard/webhooks${query ? `?${query}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Provider events received, verified, and processed."
      />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect name="provider" defaultValue={provider ?? ""}>
          <NativeSelectOption value="">All providers</NativeSelectOption>
          <NativeSelectOption value="stripe">Stripe</NativeSelectOption>
          <NativeSelectOption value="polar">Polar</NativeSelectOption>
        </NativeSelect>
        <NativeSelect name="status" defaultValue={filterStatus ?? ""}>
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          <NativeSelectOption value="processed">Processed</NativeSelectOption>
          <NativeSelectOption value="error">Error</NativeSelectOption>
          <NativeSelectOption value="skipped">Skipped</NativeSelectOption>
          <NativeSelectOption value="pending">Pending</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      {events.length === 0 ? (
        <EmptyState
          icon={<Webhook />}
          title="No webhook events yet"
          description={
            provider || filterStatus
              ? "Try clearing a filter or complete another test checkout."
              : "Add the endpoint shown on the Providers page, then complete a test checkout."
          }
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
                    <span className="text-xs text-muted-foreground">
                      {e.accountLabel}
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
                    <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline" title={e.createdAt.toISOString()}>
                      {formatDateTime(e.createdAt)}
                    </span>
                  </div>
                </summary>
                <div className="border-t bg-muted/20 px-4 py-3 text-xs">
                  <p className="text-muted-foreground">Provider event <code>{e.providerEventId}</code></p>
                  {e.error ? <pre className="mt-2 whitespace-pre-wrap text-xs text-destructive">{e.error}</pre> : null}
                </div>
                <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    Replay re-runs fulfillment from the stored verified payload.
                  </p>
                  <ReplayWebhookButton eventId={e.id} />
                </div>
                <WebhookPayload eventId={e.id} />
              </details>
            );
          })}
        </div>
      )}
      {events.length > 0 && (page > 1 || hasMore) ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          ) : <span />}
          <span className="text-sm text-muted-foreground">Page {page}</span>
          {hasMore ? (
            <Link
              href={pageHref(page + 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next
            </Link>
          ) : <span />}
        </div>
      ) : null}
    </>
  );
}

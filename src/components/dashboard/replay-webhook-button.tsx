"use client";

import { MutationForm } from "@/components/app/mutation-form";
import { Button } from "@/components/ui/button";
import { replayWebhookEvent } from "@/lib/actions/webhooks";

export function ReplayWebhookButton({ eventId }: { eventId: string }) {
  return (
    <MutationForm action={replayWebhookEvent} successMessage="Webhook replayed">
      {(pending) => (
        <>
          <input type="hidden" name="id" value={eventId} />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending ? "Replaying…" : "Replay"}
          </Button>
        </>
      )}
    </MutationForm>
  );
}

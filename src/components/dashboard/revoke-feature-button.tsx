"use client";

import { Trash2 } from "lucide-react";
import { MutationForm } from "@/components/app/mutation-form";
import { Button } from "@/components/ui/button";
import { revokeWalletFeature } from "@/lib/actions/wallets";

export function RevokeFeatureButton({
  walletId,
  feature,
}: {
  walletId: string;
  feature: string;
}) {
  return (
    <MutationForm
      action={revokeWalletFeature}
      successMessage="Feature grant revoked"
    >
      {(pending) => (
        <>
          <input type="hidden" name="walletId" value={walletId} />
          <input type="hidden" name="feature" value={feature} />
          <Button
            type="submit"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            title="Revoke manual grant"
            aria-label="Revoke manual grant"
            disabled={pending}
          >
            <Trash2 className="size-3" />
          </Button>
        </>
      )}
    </MutationForm>
  );
}

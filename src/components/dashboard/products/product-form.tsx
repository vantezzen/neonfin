"use client";
import type * as React from "react";
import { useState } from "react";
import { HelpCircle } from "lucide-react";
import type { Product, ProductType } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRODUCT_TYPES } from "./meta";

export function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {typeof label === "string" ? (
        <Label className="text-xs">{label}</Label>
      ) : (
        <div className="flex items-center gap-2 text-xs leading-none font-medium">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function FreeGrantHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="How free grants work"
      >
        <HelpCircle className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Free grants</DialogTitle>
            <DialogDescription>
              The starting balance for each product credit type.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              A one-time grant is added when a wallet first sees this product. A
              monthly grant tops the balance back up to the grant amount; it
              does not stack unused free credits.
            </p>
            <p>
              Paid purchases and subscription renewals add credits separately
              through provider webhooks.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Free grant amount + period, shared by the credits form and the
 *  subscription "Metered credits" section. */
function FreeGrantFields({ defaults }: { defaults?: Product }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label={
          <span className="inline-flex items-center gap-1.5">
            Free grant <FreeGrantHelp />
          </span>
        }
      >
        <Input
          name="freeGrantCredits"
          type="number"
          min="0"
          step="any"
          defaultValue={defaults?.freeGrant?.credits ?? ""}
          placeholder="0 = none"
        />
      </Field>
      <Field label="Grant period">
        <NativeSelect
          name="freeGrantPeriod"
          className="w-full"
          defaultValue={defaults?.freeGrant?.period ?? "monthly"}
        >
          <NativeSelectOption value="monthly">monthly</NativeSelectOption>
          <NativeSelectOption value="once">once</NativeSelectOption>
        </NativeSelect>
      </Field>
    </div>
  );
}

/** The product fields shared by the create and edit dialogs. */
export function ProductFields({
  fixedType,
  defaults,
  creditsInUse,
}: {
  fixedType?: ProductType;
  defaults?: Product;
  /** Whether any existing price already grants credits (opens the credits section). */
  creditsInUse?: boolean;
}) {
  const [type, setType] = useState<ProductType>(
    defaults?.type ?? fixedType ?? "credits",
  );
  const editable = defaults !== undefined;
  // Credits are opt-in for subscriptions - only surface the metering config
  // when it's already in use so features-only plans stay simple.
  const creditsConfigured =
    Boolean(creditsInUse) ||
    Boolean(defaults?.freeGrant) ||
    (editable && defaults?.creditUnit !== "credits");

  return (
    <>
      <Field label="Name">
        <Input
          name="name"
          defaultValue={defaults?.name}
          placeholder={
            type === "subscription"
              ? "Membership"
              : type === "one_time"
                ? "Full access"
                : "Processing hours"
          }
          required
        />
      </Field>

      {editable ? (
        <Field label="Type">
          <NativeSelect
            name="type"
            className="w-full"
            defaultValue={type}
            onChange={(e) => setType(e.currentTarget.value as ProductType)}
          >
            {PRODUCT_TYPES.map((t) => (
              <NativeSelectOption key={t.key} value={t.key}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <input type="hidden" name="type" value={type} />
      )}

      {type === "credits" ? (
        <Field label="Credit unit">
          <Input
            name="creditUnit"
            defaultValue={defaults?.creditUnit ?? "credits"}
            placeholder="minutes"
          />
        </Field>
      ) : null}

      <Field label="Description (optional)">
        <Input
          name="description"
          defaultValue={defaults?.description ?? ""}
          placeholder="Shown to users at checkout"
        />
      </Field>

      {type === "credits" ? (
        <FreeGrantFields defaults={defaults} />
      ) : type === "subscription" ? (
        <details
          className="rounded-lg border px-3 py-2"
          open={creditsConfigured || undefined}
        >
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Metered credits (optional)
          </summary>
          <div className="flex flex-col gap-4 pt-3">
            <p className="text-xs text-muted-foreground">
              Skip this if your tiers only unlock features. Set it up when tiers
              also include a usage balance your app deducts from (e.g. 500 API
              calls each month).
            </p>
            <Field label="Credit unit">
              <Input
                name="creditUnit"
                defaultValue={defaults?.creditUnit ?? "credits"}
                placeholder="API calls"
              />
            </Field>
            <FreeGrantFields defaults={defaults} />
            <Field label="Included credits each cycle">
              <NativeSelect
                name="renewalMode"
                className="w-full"
                defaultValue={defaults?.renewalMode ?? "refresh"}
              >
                <NativeSelectOption value="refresh">
                  Refresh to the included amount
                </NativeSelectOption>
                <NativeSelectOption value="add">
                  Add on top each cycle
                </NativeSelectOption>
              </NativeSelect>
              <span className="text-xs text-muted-foreground">
                Refresh tops the balance up to the included amount each cycle
                (unused credits don&apos;t stack). Add accumulates them.
              </span>
            </Field>
          </div>
        </details>
      ) : (
        <input
          type="hidden"
          name="creditUnit"
          value={defaults?.creditUnit ?? "credits"}
        />
      )}
    </>
  );
}

"use client";
import type { Price, ProductType } from "@/db/schema";
import { CURRENCIES } from "@/lib/currencies";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Field } from "./product-form";

/** A text input for feature slugs, with a hint of keys already used nearby. */
function FeaturesField({
  defaultValue,
  knownFeatures,
}: {
  defaultValue?: string;
  knownFeatures: string[];
}) {
  return (
    <Field label="Unlocks features (optional)">
      <Input
        name="features"
        defaultValue={defaultValue}
        placeholder="analytics, export"
        autoCapitalize="none"
        spellCheck={false}
      />
      <span className="text-xs text-muted-foreground">
        Space or comma separated slugs. Reference them with{" "}
        <code>useFeature()</code> / <code>&lt;FeatureGate&gt;</code>.
        {knownFeatures.length ? ` In use: ${knownFeatures.join(", ")}.` : ""}
      </span>
    </Field>
  );
}

/** Type-aware price fields shared by the add and edit dialogs. */
export function PriceFields({
  type,
  unit,
  price,
  knownFeatures,
}: {
  type: ProductType;
  unit: string;
  price?: Price;
  knownFeatures: string[];
}) {
  const synced = Boolean(price?.providerPriceId);
  const isSub = type === "subscription";
  const isUnlock = type === "one_time";
  const amountDefault =
    price !== undefined ? (price.amountCents / 100).toString() : undefined;
  const creditsDefault =
    price !== undefined ? Number(price.creditsGranted).toString() : undefined;
  const intervalDefault =
    price && price.interval !== "one_time" ? price.interval : "month";

  return (
    <>
      {isSub || isUnlock ? (
        <Field label={isSub ? "Tier name" : "Offer name (optional)"}>
          <Input
            name="label"
            defaultValue={price?.label ?? ""}
            placeholder={isSub ? "Pro" : "Full access"}
          />
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={amountDefault}
            placeholder="9.99"
            disabled={synced}
            required
          />
        </Field>
        <Field label="Currency">
          <NativeSelect
            name="currency"
            className="w-full"
            defaultValue={price?.currency ?? "USD"}
            disabled={synced}
          >
            {CURRENCIES.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        {isSub ? (
          <Field label="Billing">
            <NativeSelect
              name="interval"
              className="w-full"
              defaultValue={intervalDefault}
              disabled={synced}
            >
              <NativeSelectOption value="month">monthly</NativeSelectOption>
              <NativeSelectOption value="year">yearly</NativeSelectOption>
            </NativeSelect>
          </Field>
        ) : (
          <input type="hidden" name="interval" value="one_time" />
        )}

        {!isSub && !isUnlock ? (
          <Field label={`Credits granted (${unit})`}>
            <Input
              name="creditsGranted"
              type="number"
              step="any"
              min="0"
              defaultValue={creditsDefault}
              placeholder="600"
              required
            />
          </Field>
        ) : null}
      </div>

      {isSub || isUnlock ? (
        <>
          <FeaturesField
            defaultValue={price?.features.join(", ")}
            knownFeatures={knownFeatures}
          />
          <Field
            label={
              isSub
                ? `Included ${unit} per cycle (optional)`
                : `Included ${unit} (optional)`
            }
          >
            <Input
              name="creditsGranted"
              type="number"
              step="any"
              min="0"
              defaultValue={creditsDefault}
              placeholder="0"
            />
            <span className="text-xs text-muted-foreground">
              {isSub
                ? "Leave empty for a features-only tier. The unit and refresh behavior are set on the product."
                : "Leave empty for a features-only unlock."}
            </span>
          </Field>
        </>
      ) : null}

      {synced ? (
        <p className="text-xs text-muted-foreground">
          Amount, currency, and billing are fixed at your provider - to change
          them, delete this price and add a new one. Credits, tier name, and
          features stay editable.
        </p>
      ) : null}
    </>
  );
}

"use client";
import { Pencil } from "lucide-react";
import type { Price } from "@/db/schema";
import { createPrice, updatePrice } from "@/lib/actions/products";
import { FormDialog } from "@/components/app/form-dialog";
import { typeMeta } from "./meta";
import type { ProductWithPrices } from "./meta";
import { PriceFields } from "./price-form";

export function AddPriceButton({
  product,
  projectId,
  knownFeatures,
}: {
  product: ProductWithPrices;
  projectId: string;
  knownFeatures: string[];
}) {
  const meta = typeMeta(product.type);
  return (
    <FormDialog
      trigger={`Add ${meta.priceNoun}`}
      title={`Add ${meta.priceNoun}`}
      description={
        product.type === "subscription"
          ? "A tier is a recurring plan - set what it costs, then what it unlocks: features, included credits, or both."
          : product.type === "one_time"
            ? "A one-time offer unlocks features (and optional credits) for a single payment."
            : "A pack sells a number of credits for a one-time payment."
      }
      action={createPrice}
      submitLabel={`Add ${meta.priceNoun}`}
      triggerSize="sm"
      triggerVariant="outline"
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="projectId" value={projectId} />
      <PriceFields
        type={product.type}
        unit={product.creditUnit}
        knownFeatures={knownFeatures}
      />
    </FormDialog>
  );
}

export function EditPriceButton({
  price,
  product,
  knownFeatures,
}: {
  price: Price;
  product: ProductWithPrices;
  knownFeatures: string[];
}) {
  return (
    <FormDialog
      trigger={<Pencil className="size-3.5" />}
      triggerVariant="ghost"
      triggerSize="icon-xs"
      title="Edit price"
      description="Credits, tier name, and features are always editable. Amount and billing lock once synced to a provider."
      action={updatePrice}
      submitLabel="Save changes"
    >
      <input type="hidden" name="id" value={price.id} />
      <PriceFields
        type={product.type}
        unit={product.creditUnit}
        price={price}
        knownFeatures={knownFeatures}
      />
    </FormDialog>
  );
}

"use client";
import type * as React from "react";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { ProductType } from "@/db/schema";
import { createProduct } from "@/lib/actions/products";
import { FormDialog } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { PRODUCT_TYPES, typeMeta } from "./meta";
import type { ProviderOption } from "./meta";
import { ProductFields, Field } from "./product-form";

export function NewProductButton({
  projectId,
  providerAccounts,
  size = "default",
  variant = "default",
}: {
  projectId: string;
  providerAccounts: ProviderOption[];
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [type, setType] = useState<ProductType | null>(null);
  const meta = type ? typeMeta(type) : null;

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => setPickerOpen(true)}
      >
        <Plus className="size-4" /> New product
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>What are you selling?</DialogTitle>
            <DialogDescription>
              Pick a shape - you can add prices and connect a provider next.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRODUCT_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  setType(t.key);
                }}
                className="flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <t.icon className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground">
                  {t.tagline}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <FormDialog
        open={type !== null}
        onOpenChange={(o) => {
          if (!o) setType(null);
        }}
        title={meta ? `New ${meta.label.toLowerCase()}` : "New product"}
        description={meta?.description}
        action={createProduct}
        submitLabel="Create product"
      >
        <input type="hidden" name="projectId" value={projectId} />
        {type ? <ProductFields fixedType={type} /> : null}
        <Field label="Payment provider">
          {providerAccounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Connect a provider in Settings to enable checkout. You can add the
              product now and attach one later.
            </p>
          ) : (
            <NativeSelect name="providerAccountId" className="w-full">
              <NativeSelectOption value="">
                None (no checkout)
              </NativeSelectOption>
              {providerAccounts.map((a) => (
                <NativeSelectOption key={a.id} value={a.id}>
                  {a.label} ({a.provider})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </Field>
      </FormDialog>
    </>
  );
}

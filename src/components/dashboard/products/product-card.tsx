"use client";
import type * as React from "react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { Product } from "@/db/schema";
import { humanizeFeatureKey } from "@/lib/features";
import {
  attachProvider,
  createTestCheckout,
  deletePrice,
  deleteProduct,
  syncProduct,
  toggleProduct,
  updateProduct,
} from "@/lib/actions/products";
import { formatLargeNumber, formatInterval, formatMoney } from "@/lib/format";
import { FormDialog } from "@/components/app/form-dialog";
import { ConfirmAction } from "@/components/app/confirm-action";
import { MutationForm } from "@/components/app/mutation-form";
import { CopyInline } from "@/components/app/copy";
import { ProviderLink } from "@/components/app/provider-link";
import { providerProductUrl } from "@/lib/providers/links";
import { Status } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { typeMeta } from "./meta";
import type { ProductWithPrices, ProviderOption } from "./meta";
import { ProductFields, Field } from "./product-form";
import { AddPriceButton, EditPriceButton } from "./price-buttons";

function TestCheckoutButton({
  priceId,
  sandbox,
}: {
  priceId: string;
  sandbox: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const title = sandbox
    ? "Open a sandbox checkout and verify the webhook"
    : "Connect this product to a sandbox provider to test checkout";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      disabled={!sandbox || pending}
      aria-label="Test checkout"
      title={title}
      onClick={() => {
        startTransition(async () => {
          const result = await createTestCheckout(priceId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          if (result.url) window.location.assign(result.url);
        });
      }}
    >
      <FlaskConical className="size-3.5" />
    </Button>
  );
}

/** Rarely-used product actions, tucked behind an overflow menu. */
function ProductMenu({
  product,
  projectId,
  creditsInUse,
}: {
  product: Product;
  projectId: string;
  creditsInUse: boolean;
}) {
  const toggleRef = useRef<HTMLFormElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleProduct,
    {},
  );

  useEffect(() => {
    if (toggleState.error) toast.error(toggleState.error);
    if (toggleState.ok) {
      toast.success(product.active ? "Product deactivated" : "Product activated");
    }
  }, [product.active, toggleState]);

  return (
    <>
      <form ref={toggleRef} action={toggleAction} className="hidden">
        <input type="hidden" name="id" value={product.id} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="active" value={String(product.active)} />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Product actions">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={togglePending}
            onClick={() => toggleRef.current?.requestSubmit()}
          >
            {product.active ? (
              <>
                <EyeOff /> Deactivate
              </>
            ) : (
              <>
                <Eye /> Activate
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmAction
            action={deleteProduct}
            trigger={
              <DropdownMenuItem variant="destructive">
                <Trash2 /> Delete product
              </DropdownMenuItem>
            }
            title={`Delete “${product.name}”?`}
            description="Its prices and wallet balances will be removed. This cannot be undone."
            confirmLabel="Delete product"
            pendingLabel="Deleting…"
            successMessage="Product deleted"
          >
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="projectId" value={projectId} />
          </ConfirmAction>
        </DropdownMenuContent>
      </DropdownMenu>

      <FormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit product"
        description="Change this product's name, type, or credit settings. Prices are managed separately."
        action={updateProduct}
        submitLabel="Save changes"
      >
        <input type="hidden" name="id" value={product.id} />
        <ProductFields defaults={product} creditsInUse={creditsInUse} />
      </FormDialog>
    </>
  );
}

function AttachProviderButton({
  productId,
  projectId,
  providerAccounts,
  current,
}: {
  productId: string;
  projectId: string;
  providerAccounts: ProviderOption[];
  current: string | null;
}) {
  return (
    <FormDialog
      trigger={current ? "Change provider" : "Connect provider"}
      triggerVariant="ghost"
      triggerSize="xs"
      title="Connect a provider"
      description="Attach a Stripe/Polar account so this product's prices can be purchased. Existing prices are synced automatically."
      action={attachProvider}
      submitLabel="Connect & sync"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="productId" value={productId} />
      <Field label="Provider account">
        <NativeSelect
          name="providerAccountId"
          className="w-full"
          defaultValue={current ?? ""}
        >
          <NativeSelectOption value="">None</NativeSelectOption>
          {providerAccounts.map((a) => (
            <NativeSelectOption key={a.id} value={a.id}>
              {a.label} ({a.provider})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </FormDialog>
  );
}

export function ProductCard({
  product,
  projectId,
  providerAccounts,
  knownFeatures,
}: {
  product: ProductWithPrices;
  projectId: string;
  providerAccounts: ProviderOption[];
  knownFeatures: string[];
}) {
  const meta = typeMeta(product.type);
  const attached = providerAccounts.find(
    (a) => a.id === product.providerAccountId,
  );
  const hasUnsynced = product.prices.some((p) => !p.providerPriceId);
  // Deep link to the product at the provider (Stripe shows its prices there too).
  const productUrl = attached
    ? providerProductUrl(
        attached.provider,
        attached.environment,
        product.providerProductId,
      )
    : null;

  const grant = product.freeGrant
    ? ` · ${formatLargeNumber(product.freeGrant.credits)} free ${
        product.freeGrant.period === "monthly" ? "every month" : "once"
      }`
    : "";
  // Only mention the credit unit when credits are actually in play - a
  // features-only subscription shouldn't read as credit-metered.
  const tierCreditsInUse = product.prices.some(
    (p) => Number(p.creditsGranted) > 0,
  );
  const creditsInPlay =
    product.type === "credits" ||
    Boolean(product.freeGrant) ||
    tierCreditsInUse;
  const subtitle =
    meta.label +
    (meta.metered && creditsInPlay
      ? ` · metered in ${product.creditUnit}`
      : "") +
    grant;

  return (
    <div className="overflow-hidden rounded-xl border">
      {/* Header: name + essentials on the left, the two actions on the right. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <meta.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{product.name}</span>
            {!product.active ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                Inactive
              </span>
            ) : null}
          </div>
          <p className="truncate text-[13px] text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <AddPriceButton
            product={product}
            projectId={projectId}
            knownFeatures={knownFeatures}
          />
          <ProductMenu
            product={product}
            projectId={projectId}
            creditsInUse={tierCreditsInUse}
          />
        </div>
      </div>

      {/* Prices: one calm line each; actions appear on hover. */}
      {product.prices.length > 0 ? (
        <div className="divide-y border-t">
          {product.prices.map((price) => (
            <div
              key={price.id}
              className="group flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span className="shrink-0 font-medium tabular-nums">
                {formatMoney(price.amountCents, price.currency)}
                {price.interval !== "one_time" ? (
                  <span className="font-normal text-muted-foreground">
                    {formatInterval(price.interval)}
                  </span>
                ) : null}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {price.label ? (
                  <span className="font-medium">{price.label}</span>
                ) : null}
                {Number(price.creditsGranted) > 0 ? (
                  <span className="text-muted-foreground">
                    {formatLargeNumber(price.creditsGranted)}{" "}
                    {product.creditUnit}
                    {price.interval !== "one_time" ? " / cycle" : ""}
                  </span>
                ) : null}
                {price.features.map((f) => (
                  <span
                    key={f}
                    className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {humanizeFeatureKey(f)}
                  </span>
                ))}
                {price.label === null &&
                Number(price.creditsGranted) === 0 &&
                price.features.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : null}
              </span>
              {!price.providerPriceId ? (
                <Status
                  tone="warning"
                  className="text-xs text-muted-foreground"
                >
                  Not synced
                </Status>
              ) : null}
              <div className="ml-auto flex shrink-0 items-center gap-1 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <CopyInline value={price.id} label="Copy ID" />
                {price.providerPriceId && productUrl ? (
                  <ProviderLink
                    href={productUrl}
                    iconOnly
                    title={`View in ${attached?.label ?? "provider"}`}
                    className="p-1"
                  />
                ) : null}
                {price.providerPriceId ? (
                  <TestCheckoutButton
                    priceId={price.id}
                    sandbox={attached?.environment === "sandbox"}
                  />
                ) : null}
                <EditPriceButton
                  price={price}
                  product={product}
                  knownFeatures={knownFeatures}
                />
                <ConfirmAction
                  action={deletePrice}
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete price"
                      title="Delete price"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  }
                  title="Delete this price?"
                  description="Existing orders keep their history. This price can no longer be used for new checkouts."
                  confirmLabel="Delete price"
                  pendingLabel="Deleting…"
                  successMessage="Price deleted"
                >
                  <input type="hidden" name="id" value={price.id} />
                  <input type="hidden" name="projectId" value={projectId} />
                </ConfirmAction>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="border-t px-4 py-3 text-[13px] text-muted-foreground">
          No {meta.priceNoun}s yet - use “Add {meta.priceNoun}” so users can buy
          in.
        </p>
      )}

      {/* Provider strip: a single status line + the one action that fixes it. */}
      {providerAccounts.length > 0 ? (
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2">
          <Status
            tone={attached ? (hasUnsynced ? "warning" : "success") : "warning"}
            className="text-xs text-muted-foreground"
          >
            {attached
              ? hasUnsynced
                ? "Some prices aren't synced yet"
                : `Live via ${attached.label}`
              : "No payment provider - checkout is disabled"}
          </Status>
          <div className="flex shrink-0 items-center gap-1">
            {productUrl ? (
              <ProviderLink href={productUrl} className="mr-1">
                View in {attached?.label ?? "provider"}
              </ProviderLink>
            ) : null}
            {attached && hasUnsynced ? (
              <MutationForm
                action={syncProduct}
                successMessage="Product prices synced"
              >
                {(pending) => (
                  <>
                    <input type="hidden" name="id" value={product.id} />
                    <input type="hidden" name="projectId" value={projectId} />
                    <Button type="submit" variant="ghost" size="xs" disabled={pending}>
                      <RefreshCw className={pending ? "size-3 animate-spin" : "size-3"} />
                      {pending ? "Syncing…" : "Sync now"}
                    </Button>
                  </>
                )}
              </MutationForm>
            ) : null}
            <AttachProviderButton
              productId={product.id}
              projectId={projectId}
              providerAccounts={providerAccounts}
              current={product.providerAccountId}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

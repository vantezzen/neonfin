"use client";
import type * as React from "react";
import { useRef, useState } from "react";
import {
  Coins,
  Eye,
  EyeOff,
  HelpCircle,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  Unlock,
} from "lucide-react";
import type { Price, Product, ProductType } from "@/db/schema";
import { humanizeFeatureKey } from "@/lib/features";
import {
  attachProvider,
  createPrice,
  createProduct,
  deletePrice,
  deleteProduct,
  syncProduct,
  toggleProduct,
  updatePrice,
  updateProduct,
} from "@/lib/actions/products";
import { CURRENCIES } from "@/lib/currencies";
import { formatLargeNumber, formatInterval, formatMoney } from "@/lib/format";
import { FormDialog } from "@/components/app/form-dialog";
import { CopyInline } from "@/components/app/copy";
import { ProviderLink } from "@/components/app/provider-link";
import { providerProductUrl } from "@/lib/providers/links";
import { EmptyState } from "@/components/app/empty-state";
import { Status } from "@/components/app/status";
import { SectionHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

export type ProductWithPrices = Product & { prices: Price[] };
export type ProviderOption = {
  id: string;
  label: string;
  provider: "stripe" | "polar";
  environment: string;
};

/** The three product shapes, shown as cards in the "New product" picker. */
const PRODUCT_TYPES: {
  key: ProductType;
  label: string;
  icon: typeof Coins;
  tagline: string;
  description: string;
  /** What one price row represents for this type. */
  priceNoun: string;
  /** Whether this type meters a credit balance (shows unit + free grant). */
  metered: boolean;
}[] = [
  {
    key: "credits",
    label: "Credit pack",
    icon: Coins,
    tagline: "Sell credits, meter usage",
    description:
      "Users buy a balance and spend it as they go - API calls, minutes, generations.",
    priceNoun: "pack",
    metered: true,
  },
  {
    key: "subscription",
    label: "Subscription",
    icon: Repeat,
    tagline: "Recurring access & tiers",
    description:
      "Recurring plans (tiers) that unlock features and/or include credits each cycle.",
    priceNoun: "tier",
    metered: true,
  },
  {
    key: "one_time",
    label: "One-time unlock",
    icon: Unlock,
    tagline: "Pay once, keep forever",
    description:
      "A single payment that permanently unlocks features (and optional credits).",
    priceNoun: "offer",
    metered: false,
  },
];

function typeMeta(type: ProductType) {
  return PRODUCT_TYPES.find((t) => t.key === type) ?? PRODUCT_TYPES[0];
}

export function productPriceNoun(type: ProductType): string {
  return typeMeta(type).priceNoun;
}

/** All feature slugs already used across a project's prices (for input hints). */
export function knownFeaturesOf(products: ProductWithPrices[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    for (const price of p.prices) for (const f of price.features) set.add(f);
  }
  return [...set].sort();
}

export function ProductsSection({
  projectId,
  products,
  providerAccounts,
}: {
  projectId: string;
  products: ProductWithPrices[];
  providerAccounts: ProviderOption[];
}) {
  const knownFeatures = knownFeaturesOf(products);
  return (
    <div className="flex flex-col gap-4">
      {products.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="No products yet"
          description="Sell credits, a subscription, or a one-time unlock - pick a shape and neonFin handles the rest."
          action={
            <NewProductButton
              projectId={projectId}
              providerAccounts={providerAccounts}
            />
          }
        />
      ) : (
        <>
          <SectionHeader
            title="Products"
            description="Credit packs, subscriptions, and one-time unlocks - each with its own prices."
            action={
              <NewProductButton
                projectId={projectId}
                providerAccounts={providerAccounts}
              />
            }
          />
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              projectId={projectId}
              providerAccounts={providerAccounts}
              knownFeatures={knownFeatures}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ProductCard({
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
              <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <CopyInline value={price.id} label="Copy ID" />
                {price.providerPriceId && productUrl ? (
                  <ProviderLink
                    href={productUrl}
                    iconOnly
                    title={`View in ${attached?.label ?? "provider"}`}
                    className="p-1"
                  />
                ) : null}
                <EditPriceButton
                  price={price}
                  product={product}
                  knownFeatures={knownFeatures}
                />
                <form
                  action={deletePrice}
                  onSubmit={(e) => {
                    if (
                      !confirm(
                        "Delete this price? Existing orders keep their history.",
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="id" value={price.id} />
                  <input type="hidden" name="projectId" value={projectId} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete price"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </form>
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
              <form action={syncProduct}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="projectId" value={projectId} />
                <Button type="submit" variant="ghost" size="xs">
                  <RefreshCw className="size-3" /> Sync now
                </Button>
              </form>
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
  const deleteRef = useRef<HTMLFormElement>(null);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <form ref={toggleRef} action={toggleProduct} className="hidden">
        <input type="hidden" name="id" value={product.id} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="active" value={String(product.active)} />
      </form>
      <form ref={deleteRef} action={deleteProduct} className="hidden">
        <input type="hidden" name="id" value={product.id} />
        <input type="hidden" name="projectId" value={projectId} />
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
          <DropdownMenuItem onClick={() => toggleRef.current?.requestSubmit()}>
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
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              if (
                confirm(
                  `Delete "${product.name}" and its prices? Wallet balances for it are removed. This cannot be undone.`,
                )
              ) {
                deleteRef.current?.requestSubmit();
              }
            }}
          >
            <Trash2 /> Delete product
          </DropdownMenuItem>
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

function Field({
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

/** The product fields shared by the create and edit dialogs. */
function ProductFields({
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
function PriceFields({
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

export function AddPriceButton({
  product,
  projectId,
  knownFeatures,
  triggerSize = "sm",
  triggerVariant = "outline",
}: {
  product: ProductWithPrices;
  projectId: string;
  knownFeatures: string[];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
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
      triggerSize={triggerSize}
      triggerVariant={triggerVariant}
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

function EditPriceButton({
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

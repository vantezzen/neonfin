"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Check, Loader2, Settings, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  PayError,
  type CheckoutFlow,
  type Price,
  type Product,
} from "@/lib/pay";
import {
  usePay,
  usePayCheckout,
  useSubscriptions,
} from "@/components/pay/provider";

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatCredits(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(6)));
}

/** "full_access" -> "Full access" */
export function humanizeFeature(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const INTERVAL: Record<Price["interval"], string> = {
  one_time: "",
  month: "/mo",
  year: "/yr",
};

/** The headline for an offer: its tier label, or its included credits, or name. */
function offerTitle(product: Product, price: Price): string {
  if (price.label) return price.label;
  if (price.creditsGranted > 0) {
    return `${formatCredits(price.creditsGranted)} ${product.creditUnit}`;
  }
  return product.name;
}

export type PurchaseOption = {
  product: Product;
  price: Price;
  discountCode?: string;
};

export type PurchaseFilters = {
  /** Limit options to one product. */
  productId?: string;
  /** Limit options to any of these products. */
  productIds?: string[];
  /** Require prices to unlock every listed feature. */
  features?: string[];
  /** Require prices that grant credits for their product. */
  grantsCredits?: boolean;
  /** Final custom predicate for project-specific filtering. */
  match?: (option: PurchaseOption) => boolean;
};

export type PurchaseOptionControls = {
  busy: boolean;
  disabled: boolean;
  current: boolean;
  recurring: boolean;
  buy: () => void;
};

export function PurchaseOptionButton({
  option: { product, price, discountCode },
  controls,
}: {
  option: PurchaseOption;
  controls: PurchaseOptionControls;
}) {
  return (
    <button
      type="button"
      disabled={controls.disabled}
      onClick={controls.buy}
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
        "hover:bg-accent disabled:pointer-events-none disabled:opacity-60",
        controls.current && controls.recurring && "border-primary/40",
      )}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 font-medium">
          {offerTitle(product, price)}
          {controls.current && controls.recurring ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <Check className="size-3" /> Current plan
            </span>
          ) : null}
        </span>
        {price.label && price.creditsGranted > 0 ? (
          <span className="text-sm text-muted-foreground">
            {formatCredits(price.creditsGranted)} {product.creditUnit}
            {controls.recurring ? " / period" : ""}
          </span>
        ) : null}
        {price.features.length > 0 ? (
          <span className="flex flex-wrap gap-1 pt-0.5">
            {price.features.map((f) => (
              <span
                key={f}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {humanizeFeature(f)}
              </span>
            ))}
          </span>
        ) : null}
        <span className="text-sm text-muted-foreground">{product.name}</span>
      </span>
      <div className="flex flex-col items-end gap-1">
        <span
          className={cn(
            "flex shrink-0 items-center gap-2 font-medium tabular-nums",
            discountCode ? "line-through text-muted-foreground" : "",
          )}
        >
          {controls.busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {formatMoney(price.amountCents, price.currency)}
          <span className="text-muted-foreground">
            {INTERVAL[price.interval]}
          </span>
        </span>

        {discountCode ? (
          <span className="text-muted-foreground">
            Discount applied at checkout
          </span>
        ) : null}
      </div>
    </button>
  );
}

function matchesFilters(
  { product, price }: PurchaseOption,
  filters?: PurchaseFilters,
): boolean {
  if (!filters) return true;
  if (filters.productId && product.id !== filters.productId) return false;
  if (filters.productIds?.length && !filters.productIds.includes(product.id)) {
    return false;
  }
  if (filters.grantsCredits && price.creditsGranted <= 0) return false;
  if (filters.features?.some((feature) => !price.features.includes(feature))) {
    return false;
  }
  return filters.match?.({ product, price }) ?? true;
}

export type PurchaseDialogProps = {
  /** Limit options to a single product. Prefer `filters` for new code. */
  productId?: string;
  /** Filter products/prices shown in the dialog. */
  filters?: PurchaseFilters;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional trigger element (e.g. a <Button>). */
  children?: React.ReactNode;
  title?: string;
  description?: string;
  emptyMessage?: string;
  /**
   * `auto` opens checkout in a popup on desktop and redirects on mobile.
   * Use `redirect` when your app cannot support popups.
   */
  flow?: CheckoutFlow;
  /** Let customers enter a provider promotion/discount code at checkout. */
  allowPromotionCodes?: boolean;
  /** Apply or prefill a provider promotion/discount code for this checkout. */
  discountCode?: string;
  /** Pre-fill the receipt and wallet-recovery email. */
  customerEmail?: string;
  /** Show the optional receipt and wallet-recovery email field. */
  collectCustomerEmail?: boolean;
  renderOption?: (
    option: PurchaseOption,
    controls: PurchaseOptionControls,
  ) => React.ReactNode;
};

/**
 * Renders purchasable offers (credit packs, subscription tiers, one-time
 * unlocks) and starts provider checkout on select. Popup checkout refreshes
 * this page automatically; redirect checkout resumes when the user returns.
 *
 * If the wallet already subscribes to a product shown here, that product's
 * tiers are marked "Current plan" and a "Manage subscription" button opens the
 * billing portal (where the provider handles plan changes) - since a fresh
 * checkout can't switch an existing subscription.
 */
export function PurchaseDialog({
  productId,
  filters,
  flow = "auto",
  open,
  onOpenChange,
  children,
  title = "Buy credits or subscription",
  description = "Choose an option to continue.",
  emptyMessage = "No purchase options are available yet.",
  allowPromotionCodes = true,
  discountCode,
  customerEmail,
  collectCustomerEmail = true,
  renderOption,
}: PurchaseDialogProps) {
  const client = usePay();
  const startCheckout = usePayCheckout();
  const subscriptions = useSubscriptions();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enteredEmail, setEnteredEmail] = useState("");
  const receiptEmailId = React.useId();

  // controlled/uncontrolled open state
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setError(null);
    setProducts(null);
    client
      .getProducts()
      .then((p) => active && setProducts(p))
      .catch(() => active && setError("Couldn't load purchase options."));
    return () => {
      active = false;
    };
  }, [isOpen, client]);

  const subscribedProductIds = new Set(subscriptions.map((s) => s.productId));

  async function buy(priceId: string) {
    const email = (customerEmail ?? enteredEmail).trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address or leave it blank.");
      return;
    }
    setBusy(priceId);
    setError(null);
    try {
      await startCheckout(priceId, {
        flow,
        allowPromotionCodes,
        discountCode,
        ...(email ? { customerEmail: email } : {}),
      });
      setBusy(null);
      setOpen(false);
    } catch (err) {
      setBusy(null);
      if (err instanceof PayError && err.code === "already_subscribed") {
        setError(
          "You already have a plan for this. Use “Manage subscription” to change it.",
        );
      } else if (err instanceof PayError && err.code === "popup_blocked") {
        setError(
          "The checkout popup was blocked. Allow popups or use redirect checkout.",
        );
      } else if (err instanceof PayError && err.code === "checkout_cancelled") {
        setError("Checkout was cancelled. No charge was made.");
      } else if (err instanceof PayError && err.code === "checkout_closed") {
        setError(
          "Confirming your payment. This page will update automatically when it is recorded.",
        );
      } else {
        setError("Couldn't start checkout. Please try again.");
      }
    }
  }

  async function openPortal() {
    setPortalBusy(true);
    setError(null);
    try {
      const url = await client.getPortalUrl();
      if (typeof window !== "undefined") window.location.assign(url);
    } catch {
      setError("Couldn't open the billing portal. Please try again.");
      setPortalBusy(false);
    }
  }

  const effectiveFilters: PurchaseFilters | undefined =
    productId && !filters?.productId ? { ...filters, productId } : filters;
  const options = (products ?? [])
    .flatMap((product) => product.prices.map((price) => ({ product, price })))
    .filter((option) => matchesFilters(option, effectiveFilters));

  // Show "Manage subscription" if any product on offer is already subscribed.
  const canManage = options.some((o) => subscribedProductIds.has(o.product.id));

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {children ? (
        <DialogTrigger
          render={
            React.isValidElement(children) ? (
              (children as React.ReactElement<Record<string, unknown>>)
            ) : (
              <Button>{children}</Button>
            )
          }
        />
      ) : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {busy ? (
          <p className="text-sm text-muted-foreground">
            {flow === "redirect"
              ? "Redirecting you to checkout…"
              : "Finish payment in the checkout window. Your balance updates here automatically."}
          </p>
        ) : null}

        {collectCustomerEmail && customerEmail === undefined ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={receiptEmailId} className="text-xs">
              Receipt and recovery email <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={receiptEmailId}
              type="email"
              autoComplete="email"
              value={enteredEmail}
              onChange={(event) => setEnteredEmail(event.currentTarget.value)}
              placeholder="you@example.com"
            />
          </div>
        ) : null}

        {products === null && !error ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : options.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            {options.map(({ product, price }) => {
              const subscription = subscriptions.find(
                (s) => s.productId === product.id,
              );
              const recurring = price.interval !== "one_time";
              const current =
                recurring &&
                Boolean(subscription) &&
                (!subscription?.priceId || subscription.priceId === price.id);
              const controls = {
                busy: busy === price.id,
                disabled:
                  busy !== null ||
                  (recurring && subscribedProductIds.has(product.id)),
                current,
                recurring,
                buy: () => buy(price.id),
              };
              return renderOption ? (
                <React.Fragment key={price.id}>
                  {renderOption({ product, price }, controls)}
                </React.Fragment>
              ) : (
                <PurchaseOptionButton
                  key={price.id}
                  option={{ product, price, discountCode }}
                  controls={controls}
                />
              );
            })}
          </div>
        )}

        {canManage ? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={openPortal}
              disabled={portalBusy}
            >
              {portalBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Settings className="size-4" />
              )}
              Manage subscription
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export type PurchaseButtonProps = {
  productId?: string;
  filters?: PurchaseFilters;
  title?: string;
  description?: string;
  emptyMessage?: string;
  flow?: CheckoutFlow;
  allowPromotionCodes?: boolean;
  discountCode?: string;
  customerEmail?: string;
  collectCustomerEmail?: boolean;
  renderOption?: PurchaseDialogProps["renderOption"];
  className?: string;
  children?: React.ReactNode;
} & React.ComponentProps<typeof Button>;

/** A button that opens the {@link PurchaseDialog}. */
export function PurchaseButton({
  productId,
  filters,
  title,
  description,
  emptyMessage,
  flow,
  allowPromotionCodes = true,
  discountCode,
  customerEmail,
  collectCustomerEmail,
  renderOption,
  children = filters?.features?.length === 1 ? (
    `Unlock ${humanizeFeature(filters.features[0]!)}`
  ) : filters?.grantsCredits ? (
    "Buy credits"
  ) : (
    <ShoppingCart className="size-4" />
  ),
  ...props
}: PurchaseButtonProps) {
  const ariaLabel =
    props["aria-label"] ??
    (typeof children === "string" ? undefined : "Open purchase options");

  return (
    <PurchaseDialog
      productId={productId}
      filters={filters}
      title={title}
      description={description}
      emptyMessage={emptyMessage}
      flow={flow}
      allowPromotionCodes={allowPromotionCodes}
      discountCode={discountCode}
      customerEmail={customerEmail}
      collectCustomerEmail={collectCustomerEmail}
      renderOption={renderOption}
    >
      <Button {...props} aria-label={ariaLabel}>
        {children}
      </Button>
    </PurchaseDialog>
  );
}

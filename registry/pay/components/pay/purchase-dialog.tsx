"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Coins,
  KeyRound,
  Loader2,
  Repeat2,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  PayError,
  resolveCheckoutFlow,
  type CheckoutFlow,
  type Price,
  type Product,
} from "@/lib/pay";
import { formatCredits, formatMoney } from "@/lib/pay/format";
import {
  usePay,
  usePayCheckout,
  usePayMode,
  usePayProducts,
  useSubscriptions,
} from "@/components/pay/provider";

/* ------------------------------------------------------------------------ */
/* Formatting helpers — exported so custom `renderOption` UIs can reuse them */
/* ------------------------------------------------------------------------ */

/** "full_access" -> "Full access" */
export function humanizeFeature(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The headline for an offer: its tier label, or its included credits, or name. */
export function offerTitle(product: Product, price: Price): string {
  if (price.label) return price.label;
  if (price.creditsGranted > 0) {
    return `${formatCredits(price.creditsGranted)} ${product.creditUnit}`;
  }
  return product.name;
}

/** "≈ $0.83 per 100 minutes" — lets buyers compare packs at a glance. */
export function unitPriceHint(price: Price, product: Product): string | null {
  if (price.creditsGranted <= 0 || price.amountCents <= 0) return null;
  const centsPerUnit = price.amountCents / price.creditsGranted;
  const units = centsPerUnit >= 10 ? 1 : 100;
  const unit =
    units === 1
      ? product.creditUnit.replace(/ies$/, "y").replace(/s$/, "")
      : `${units} ${product.creditUnit}`;
  return `≈ ${formatMoney(centsPerUnit * units, price.currency)} per ${unit}`;
}

const INTERVAL_SUFFIX: Record<Price["interval"], string> = {
  one_time: "",
  month: "per month",
  year: "per year",
};

/**
 * The commitment line under an offer title. Its job is to remove purchase
 * anxiety, not to categorize: one-time offers say there is no subscription,
 * recurring offers say they can be cancelled.
 */
function offerKind(product: Product, price: Price): string {
  if (price.interval !== "one_time") return "Cancel anytime";
  if (product.type === "credits") return "One-time top-up — no subscription";
  return "One-time purchase";
}

function ProductIcon({ type }: { type: Product["type"] }) {
  const Icon =
    type === "credits" ? Coins : type === "subscription" ? Repeat2 : KeyRound;
  return <Icon className="size-4" aria-hidden />;
}

/* ------------------------------------------------------------------------ */
/* Option card                                                               */
/* ------------------------------------------------------------------------ */

export type PurchaseOption = {
  product: Product;
  price: Price;
  discountCode?: string;
};

/**
 * Which price to highlight: a price id, or a selector that receives the
 * dialog's filtered, price-sorted options and returns a price id (or null
 * for no highlight). The selector is called during render; keep it pure.
 */
export type RecommendedPrice =
  | string
  | ((options: PurchaseOption[]) => string | null | undefined);

/**
 * Recommend the middle-priced option — a safe anchor when three or more
 * offers are shown. Returns null for fewer than two options.
 *
 * ```tsx
 * <PurchaseButton filters={{ grantsCredits: true }}
 *   recommendedPriceId={recommendMiddleOption} />
 * ```
 */
export function recommendMiddleOption(
  options: PurchaseOption[],
): string | null {
  if (options.length < 2) return null;
  const sorted = [...options].sort(
    (a, b) => a.price.amountCents - b.price.amountCents,
  );
  return sorted[Math.floor(sorted.length / 2)]!.price.id;
}

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

/** Everything a custom `renderOption` needs to behave like the default card. */
export type PurchaseOptionControls = {
  /** This option's checkout is currently starting/in progress. */
  busy: boolean;
  /** Not selectable right now (another checkout running, or already subscribed). */
  disabled: boolean;
  /** The wallet's active subscription is on this exact tier. */
  current: boolean;
  /** The price renews (month/year) rather than being a one-time payment. */
  recurring: boolean;
  /** Marked via `recommendedPriceId`. */
  recommended?: boolean;
  /** Start checkout for this option. */
  buy: () => void;
};

export function PurchaseOptionButton({
  option: { product, price, discountCode },
  controls,
  recommendedLabel = "Popular",
}: {
  option: PurchaseOption;
  controls: PurchaseOptionControls;
  recommendedLabel?: string;
}) {
  const unitHint = unitPriceHint(price, product);
  const title = offerTitle(product, price);
  const kind = offerKind(product, price);
  const suffix = INTERVAL_SUFFIX[price.interval];
  const actionLabel = controls.current
    ? "Your current plan"
    : controls.busy
      ? "Opening secure checkout…"
      : "Continue with this option";
  const hasDetails =
    price.creditsGranted > 0 ||
    price.features.length > 0 ||
    Boolean(unitHint) ||
    Boolean(discountCode);

  return (
    <button
      type="button"
      disabled={controls.disabled}
      onClick={controls.buy}
      aria-busy={controls.busy || undefined}
      aria-current={controls.current ? "true" : undefined}
      aria-label={`${title}, ${formatMoney(price.amountCents, price.currency)}${suffix ? ` ${suffix}` : ""}. ${kind}. ${actionLabel}`}
      className={cn(
        "group/option relative flex w-full flex-col overflow-hidden rounded-2xl border bg-background text-left shadow-xs transition-all duration-200",
        "hover:border-primary/40 hover:bg-accent/20 hover:shadow-md motion-safe:hover:-translate-y-0.5",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-60",
        controls.current &&
          controls.recurring &&
          "border-primary/30 bg-primary/[0.025]",
        controls.recommended && "border-primary/70 ring-1 ring-primary/20",
      )}
    >
      {controls.recommended ? (
        <span className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden />
      ) : null}

      <span className="flex w-full items-start justify-between gap-4 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold tracking-tight">
              {title}
            </span>
            {controls.recommended ? (
              <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
                {recommendedLabel}
              </span>
            ) : null}
            {controls.current && controls.recurring ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                <Check className="size-3" aria-hidden /> Current plan
              </span>
            ) : null}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {kind}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end">
          <span className="text-xl font-semibold tracking-tight tabular-nums">
            {formatMoney(price.amountCents, price.currency)}
          </span>
          {suffix ? (
            <span className="text-xs text-muted-foreground">{suffix}</span>
          ) : null}
        </span>
      </span>

      {hasDetails ? (
        <span className="flex w-full flex-col gap-2 border-t border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
          {price.creditsGranted > 0 ? (
            <span className="flex items-center gap-2 text-sm">
              <Coins className="size-4 text-primary" aria-hidden />
              <span>
                <span className="font-medium">
                  {formatCredits(price.creditsGranted)} {product.creditUnit}
                </span>
                {controls.recurring
                  ? " included every billing period"
                  : " included"}
              </span>
            </span>
          ) : null}
          {price.features.length > 0 ? (
            <span className="flex flex-wrap gap-x-4 gap-y-1.5">
              {price.features.map((feature) => (
                <span
                  key={feature}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <BadgeCheck className="size-3.5 text-primary" aria-hidden />
                  {humanizeFeature(feature)}
                </span>
              ))}
            </span>
          ) : null}
          {unitHint || discountCode ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {unitHint ? <span>{unitHint}</span> : null}
              {discountCode ? (
                <span className="inline-flex items-center gap-1">
                  <Tag className="size-3" aria-hidden /> Discount applied at
                  checkout
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      ) : null}

      <span className="flex min-h-11 w-full items-center justify-between border-t px-4 py-2.5 text-sm font-medium sm:px-5">
        <span>{actionLabel}</span>
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover/option:bg-primary group-hover/option:text-primary-foreground">
          {controls.busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : controls.current ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <ArrowRight className="size-3.5" aria-hidden />
          )}
        </span>
      </span>
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

/* ------------------------------------------------------------------------ */
/* Dialog                                                                    */
/* ------------------------------------------------------------------------ */

export type PurchaseDialogProps = {
  /** Limit options to a single product. Prefer `filters` for new code. */
  productId?: string;
  /** Filter products/prices shown in the dialog. */
  filters?: PurchaseFilters;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional trigger element (e.g. a <Button>). */
  children?: React.ReactNode;
  /** Defaults to a title derived from `filters` ("Add credits", "Unlock …"). */
  title?: string;
  /** Defaults to a context-aware line about what happens after payment. */
  description?: string;
  /** Body of the empty state when no options match. */
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
  /** Pre-fill the receipt and wallet-recovery email (hides the field). */
  customerEmail?: string;
  /**
   * Show the optional receipt and wallet-recovery email field. Defaults to
   * true for anonymous credit-code wallets (where the email doubles as
   * recovery) and false for external-auth wallets.
   */
  collectCustomerEmail?: boolean;
  /** Highlight one price as the suggested option — an id or a selector. */
  recommendedPriceId?: RecommendedPrice;
  /** Pill text for the recommended option. */
  recommendedLabel?: string;
  /** Show the vantezzen/pay attribution link. */
  showBranding?: boolean;
  /**
   * Replace the default option card. Receives the option and the same
   * controls the default card uses — spread `controls.buy`/`disabled`/`busy`
   * onto your own element. Remember a stable `key` is applied for you.
   */
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
 * billing portal (where the provider handles plan changes) — since a fresh
 * checkout can't switch an existing subscription.
 */
export function PurchaseDialog({
  productId,
  filters,
  flow = "auto",
  open,
  onOpenChange,
  children,
  title,
  description,
  emptyMessage = "Please check back soon.",
  allowPromotionCodes = true,
  discountCode,
  customerEmail,
  collectCustomerEmail,
  recommendedPriceId,
  recommendedLabel = "Popular",
  showBranding = true,
  renderOption,
}: PurchaseDialogProps) {
  const client = usePay();
  const mode = usePayMode();
  const startCheckout = usePayCheckout();
  const subscriptions = useSubscriptions();
  const { products, productsError, loadProducts } = usePayProducts();
  const [busy, setBusy] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enteredEmail, setEnteredEmail] = useState("");
  const dialogTitleRef = React.useRef<HTMLHeadingElement>(null);
  const receiptEmailId = React.useId();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Controlled/uncontrolled open state. Internal state always tracks, so
  // passing only `onOpenChange` (as a listener) still works.
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  // On open, clear transient banners and revalidate the shared catalog in the
  // background — cached options render instantly while prices silently refresh.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    loadProducts({ revalidate: true }).catch(() => {
      // productsError renders below when there is nothing cached to show.
    });
  }, [isOpen, loadProducts]);

  // The error banner renders at the top of the scroll area — make sure it is
  // seen even when the user was scrolled down in a long option list.
  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ top: 0 });
  }, [error]);

  const subscribedProductIds = new Set(subscriptions.map((s) => s.productId));

  async function buy(priceId: string) {
    const email = (customerEmail ?? enteredEmail).trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address or leave it blank.");
      emailInputRef.current?.focus();
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
          "Checkout closed before payment completed. If you did pay, your balance updates automatically — otherwise you can try again.",
        );
      } else {
        console.error("[pay] Failed to start checkout:", err);
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
    } catch (err) {
      console.error("[pay] Failed to open billing portal:", err);
      setError("Couldn't open the billing portal. Please try again.");
      setPortalBusy(false);
    }
  }

  const effectiveFilters: PurchaseFilters | undefined =
    productId && !filters?.productId ? { ...filters, productId } : filters;
  const options = (products ?? []).flatMap((product) =>
    product.prices
      .map((price) => ({ product, price }))
      .filter((option) => matchesFilters(option, effectiveFilters))
      .sort((a, b) => a.price.amountCents - b.price.amountCents),
  );
  const offeredProducts = Array.from(
    new Map(
      options.map((option) => [option.product.id, option.product]),
    ).values(),
  );
  const productCount = offeredProducts.length;
  const singleProduct = productCount === 1 ? offeredProducts[0]! : null;

  // A selector resolves against the exact options this dialog renders; a
  // literal id passes through. Selectors only run for a non-empty option list.
  const resolvedRecommendedId =
    typeof recommendedPriceId === "function"
      ? options.length > 0
        ? (recommendedPriceId(options) ?? undefined)
        : undefined
      : recommendedPriceId;

  const singleFeature =
    effectiveFilters?.features?.length === 1
      ? effectiveFilters.features[0]!
      : null;
  const effectiveTitle =
    title ??
    (singleFeature
      ? `Unlock ${humanizeFeature(singleFeature)}`
      : effectiveFilters?.grantsCredits
        ? "Add credits"
        : "Choose your plan");
  // The description's job is to promise instant gratification — security
  // reassurance lives in the footer, once.
  const effectiveDescription =
    description ??
    (effectiveFilters?.grantsCredits
      ? "Credits are added to your balance the moment payment completes."
      : singleFeature
        ? "Access unlocks the moment payment completes."
        : "You'll be back here the moment payment completes.");

  const showEmail =
    (collectCustomerEmail ?? mode === "credit_codes") &&
    customerEmail === undefined;

  // Show "Manage subscription" if any product on offer is already subscribed.
  const canManage = options.some((o) => subscribedProductIds.has(o.product.id));
  const hasSubscriptionDisabledOption = options.some(
    ({ product, price }) =>
      price.interval !== "one_time" && subscribedProductIds.has(product.id),
  );

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
      <DialogContent
        initialFocus={dialogTitleRef}
        className="flex max-h-[min(92svh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="relative overflow-hidden border-b bg-muted/30 px-5 pt-5 pb-4 pr-14 sm:px-6 sm:pt-6 sm:pb-5 sm:pr-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/[0.07] to-transparent"
          />
          <DialogHeader className="relative gap-2">
            <DialogTitle
              ref={dialogTitleRef}
              tabIndex={-1}
              className="text-xl leading-tight font-semibold tracking-tight outline-none sm:text-2xl"
            >
              {effectiveTitle}
            </DialogTitle>
            <DialogDescription className="max-w-md leading-relaxed">
              {effectiveDescription}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        >
          <div className="flex flex-col gap-4">
            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            {busy ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground"
              >
                <Loader2
                  className="mt-0.5 size-4 shrink-0 animate-spin"
                  aria-hidden
                />
                {resolveCheckoutFlow(flow) === "redirect"
                  ? "Taking you to secure checkout…"
                  : "Secure checkout is open in a new window — finish there and this page updates by itself."}
              </p>
            ) : null}

            {singleProduct ? (
              <div className="flex items-start gap-3 rounded-xl bg-muted/40 px-3.5 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
                  <ProductIcon type={singleProduct.type} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{singleProduct.name}</p>
                  {singleProduct.description ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {singleProduct.description}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {products === null && !productsError ? (
              <div
                className="flex flex-col gap-3"
                aria-label="Loading purchase options"
              >
                <div className="h-40 animate-pulse rounded-2xl border bg-muted/40" />
                <div className="h-40 animate-pulse rounded-2xl border bg-muted/40" />
              </div>
            ) : products === null && productsError ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center">
                <ShoppingCart
                  className="mx-auto size-5 text-destructive"
                  aria-hidden
                />
                <p className="mt-3 text-sm font-medium">
                  Couldn't load purchase options.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Please check your connection and try again.
                </p>
              </div>
            ) : options.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
                <ShoppingCart
                  className="mx-auto size-5 text-muted-foreground"
                  aria-hidden
                />
                <p className="mt-3 text-sm font-medium">
                  Nothing to purchase yet
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {emptyMessage}
                </p>
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-3">
                {options.map(({ product, price }, index) => {
                  const subscription = subscriptions.find(
                    (subscription) => subscription.productId === product.id,
                  );
                  const recurring = price.interval !== "one_time";
                  const current =
                    recurring &&
                    Boolean(subscription) &&
                    (!subscription?.priceId ||
                      subscription.priceId === price.id);
                  const controls: PurchaseOptionControls = {
                    busy: busy === price.id,
                    disabled:
                      busy !== null ||
                      (recurring && subscribedProductIds.has(product.id)),
                    current,
                    recurring,
                    recommended: resolvedRecommendedId === price.id,
                    buy: () => buy(price.id),
                  };
                  const startsGroup =
                    productCount > 1 &&
                    (index === 0 ||
                      options[index - 1]?.product.id !== product.id);
                  return (
                    <React.Fragment key={price.id}>
                      {startsGroup ? (
                        <div
                          className={cn(
                            "flex items-start gap-3",
                            index > 0 && "pt-3",
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                            <ProductIcon type={product.type} />
                          </span>
                          <div>
                            <p className="text-sm font-semibold">
                              {product.name}
                            </p>
                            {product.description ? (
                              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                {product.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {renderOption ? (
                        renderOption({ product, price }, controls)
                      ) : (
                        <PurchaseOptionButton
                          option={{ product, price, discountCode }}
                          controls={controls}
                          recommendedLabel={recommendedLabel}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {showEmail ? (
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <Label htmlFor={receiptEmailId} className="text-sm font-medium">
                  Email{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Get your receipt and a recovery link for these credits.
                </p>
                <Input
                  ref={emailInputRef}
                  id={receiptEmailId}
                  type="email"
                  autoComplete="email"
                  value={enteredEmail}
                  onChange={(event) =>
                    setEnteredEmail(event.currentTarget.value)
                  }
                  placeholder="you@example.com"
                  className="mt-3 h-10 bg-background"
                />
              </div>
            ) : null}

            {canManage ? (
              <div className="rounded-xl border p-3.5">
                {hasSubscriptionDisabledOption ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    To switch plans, use billing management — a new checkout
                    can't change an existing subscription.
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full",
                    hasSubscriptionDisabledOption && "mt-3",
                  )}
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
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t bg-muted/30 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium">Secure checkout</p>
              <p className="text-[11px] text-muted-foreground">
                Card details are entered only on the payment provider's page.
              </p>
            </div>
          </div>
          {showBranding ? (
            <a
              href="https://pay.vantezzen.io"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              powered by <span className="font-medium">vantezzen/pay</span>
            </a>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Trigger button                                                            */
/* ------------------------------------------------------------------------ */

export type PurchaseButtonProps = Omit<
  PurchaseDialogProps,
  "open" | "onOpenChange" | "children"
> &
  React.ComponentProps<typeof Button>;

/** A button that opens the {@link PurchaseDialog}. */
export function PurchaseButton({
  productId,
  filters,
  title,
  description,
  emptyMessage,
  flow,
  allowPromotionCodes,
  discountCode,
  customerEmail,
  collectCustomerEmail,
  recommendedPriceId,
  recommendedLabel,
  showBranding,
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
      recommendedPriceId={recommendedPriceId}
      recommendedLabel={recommendedLabel}
      showBranding={showBranding}
      renderOption={renderOption}
    >
      <Button {...props} aria-label={ariaLabel}>
        {children}
      </Button>
    </PurchaseDialog>
  );
}

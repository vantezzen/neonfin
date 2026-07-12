import type { Price, Product, ProductType } from "@/db/schema";
import { Coins, Repeat, Unlock } from "lucide-react";

export type ProductWithPrices = Product & { prices: Price[] };
export type ProviderOption = {
  id: string;
  label: string;
  provider: "stripe" | "polar";
  environment: string;
};

/** The three product shapes, shown as cards in the "New product" picker. */
export const PRODUCT_TYPES: {
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

export function typeMeta(type: ProductType) {
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

export type BillingPlanKey = "free" | "indie" | "studio" | "all_access";

export type BillingLimit = number | null;

export type BillingPlan = {
  key: BillingPlanKey;
  name: string;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  summary: string;
  limits: {
    projects: BillingLimit;
    providerAccounts: BillingLimit;
    productsPerProject: BillingLimit;
    pricesPerProduct: BillingLimit;
    paidOrdersPerMonth: BillingLimit;
    apiRequestsPerMonth: BillingLimit;
    webhookRetentionDays: BillingLimit;
  };
  features: string[];
};

export const BILLING_PLANS = {
  free: {
    key: "free",
    name: "Free",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    summary: "Generous hosted access for real side projects.",
    limits: {
      projects: 10,
      providerAccounts: null,
      productsPerProject: 3,
      pricesPerProduct: 3,
      paidOrdersPerMonth: 100,
      apiRequestsPerMonth: null,
      webhookRetentionDays: 30,
    },
    features: [
      "Stripe and Polar providers",
      "Credits, subscriptions, and one-time unlocks",
      "shadcn registry components",
      "Self-hosting docs and Docker setup",
    ],
  },
  indie: {
    key: "indie",
    name: "Indie",
    monthlyPriceCents: 1_000,
    yearlyPriceCents: 10_000,
    summary: "For developers running several paid side projects.",
    limits: {
      projects: null,
      providerAccounts: null,
      productsPerProject: 10,
      pricesPerProduct: 10,
      paidOrdersPerMonth: 1_000,
      apiRequestsPerMonth: null,
      webhookRetentionDays: 90,
    },
    features: [
      "Higher hosted usage limits",
      "Longer webhook log retention",
      "Email support",
    ],
  },
  studio: {
    key: "studio",
    name: "Studio",
    monthlyPriceCents: 2_000,
    yearlyPriceCents: 20_000,
    summary: "For studios or teams shipping many small products.",
    limits: {
      projects: null,
      providerAccounts: null,
      productsPerProject: null,
      pricesPerProduct: null,
      paidOrdersPerMonth: 10_000,
      apiRequestsPerMonth: null,
      webhookRetentionDays: 365,
    },
    features: [
      "Team-scale hosted limits",
      "One-year webhook log retention",
      "Priority support",
    ],
  },
  all_access: {
    key: "all_access",
    name: "All access",
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    summary: "Internal/support override with no hosted limits.",
    limits: {
      projects: null,
      providerAccounts: null,
      productsPerProject: null,
      pricesPerProduct: null,
      paidOrdersPerMonth: null,
      apiRequestsPerMonth: null,
      webhookRetentionDays: null,
    },
    features: ["All hosted features and unlimited usage"],
  },
} satisfies Record<BillingPlanKey, BillingPlan>;

export function isUnlimited(limit: BillingLimit): boolean {
  return limit === null;
}

export function exceedsLimit(used: number, limit: BillingLimit): boolean {
  return limit !== null && used >= limit;
}

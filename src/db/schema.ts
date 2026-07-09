import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createId } from "../lib/id";
import { user } from "./auth-schema";

export * from "./auth-schema";

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------
const createdAt = timestamp("created_at", { withTimezone: true })
  .defaultNow()
  .notNull();

// Money is stored in integer minor units (cents). Credits are `numeric` so
// fractional deductions (e.g. a 10-minute clip against an hours wallet) stay
// exact - all credit arithmetic happens in SQL, never in JS floats.
const credits = (name: string) => numeric(name, { precision: 20, scale: 6 });

// ---------------------------------------------------------------------------
// projects - one per side project
// ---------------------------------------------------------------------------
export type ProjectMode = "credit_codes" | "external_auth";
export type FreeGrant = { credits: number; period: "monthly" | "once" } | null;

export const projects = pgTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("proj")),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    mode: text("mode").$type<ProjectMode>().notNull().default("credit_codes"),
    // CORS allowlist for publishable-key browser calls.
    allowedOrigins: text("allowed_origins").array().notNull().default([]),
    // Prefix for generated credit codes, e.g. "SKIP" -> SKIP-8F3K-L9PQ-2MVT.
    codePrefix: text("code_prefix").notNull().default("NF"),
    // Anonymous code wallets expire after this many inactive days. Null = never.
    codeExpiresInDays: integer("code_expires_in_days"),
    // Abuse dampening for free anonymous wallets; enforced per project/IP/hour.
    anonymousWalletsPerHour: integer("anonymous_wallets_per_hour")
      .notNull()
      .default(20),
    createdAt,
  },
  (t) => [
    uniqueIndex("projects_owner_slug_uq").on(t.ownerId, t.slug),
    index("projects_owner_idx").on(t.ownerId),
  ],
);

// ---------------------------------------------------------------------------
// providerAccounts - Stripe/Polar credentials (encrypted at rest)
// ---------------------------------------------------------------------------
export type Provider = "stripe" | "polar";

export const providerAccounts = pgTable(
  "provider_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("prov")),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").$type<Provider>().notNull(),
    label: text("label").notNull(),
    secretKeyEnc: text("secret_key_enc").notNull(),
    webhookSecretEnc: text("webhook_secret_enc"),
    // Polar sandbox vs production; Stripe test/live is implied by the key.
    environment: text("environment").notNull().default("production"),
    createdAt,
  },
  (t) => [index("provider_accounts_owner_idx").on(t.ownerId)],
);

// ---------------------------------------------------------------------------
// products - a sellable thing within a project
// ---------------------------------------------------------------------------
export type ProductType = "credits" | "subscription" | "one_time";

// How included credits are applied on each paid subscription cycle:
// - "refresh": top the balance UP TO the included amount (never reduce, never
//   stack) - "you get N per month". Same math as the free grant.
// - "add": add the included amount on top each cycle (credits accumulate).
export type RenewalMode = "refresh" | "add";

export const products = pgTable(
  "products",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("prod")),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").references(
      () => providerAccounts.id,
      { onDelete: "restrict" },
    ),
    name: text("name").notNull(),
    description: text("description"),
    // credits = metered credit pack, subscription = recurring access/tiers,
    // one_time = pay-once permanent unlock. All share the same engine; the type
    // is a UI template + drives checkout mode and included-credit behavior.
    type: text("type").$type<ProductType>().notNull().default("credits"),
    // The product's own credit unit + optional free grant + per-wallet balance.
    creditUnit: text("credit_unit").notNull().default("credits"),
    freeGrant: jsonb("free_grant").$type<FreeGrant>(),
    // Only meaningful for subscription products with included credits.
    renewalMode: text("renewal_mode")
      .$type<RenewalMode>()
      .notNull()
      .default("refresh"),
    // Provider-side mirror id, created when a price is first provisioned.
    providerProductId: text("provider_product_id"),
    active: boolean("active").notNull().default(true),
    createdAt,
  },
  (t) => [index("products_project_idx").on(t.projectId)],
);

// ---------------------------------------------------------------------------
// prices - a product can have several purchase options
// ---------------------------------------------------------------------------
export type PriceInterval = "one_time" | "month" | "year";

export const prices = pgTable(
  "prices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("price")),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // A price IS the offer. For subscriptions each price is a tier ("Basic").
    label: text("label"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    // Credits granted on purchase / included each cycle, e.g. 600 for "10 hours".
    // "0" = no credits (pure access offer).
    creditsGranted: credits("credits_granted").notNull(),
    // Feature slugs this offer unlocks (vantezzen/pay-only; never synced to provider).
    features: text("features").array().notNull().default([]),
    interval: text("interval")
      .$type<PriceInterval>()
      .notNull()
      .default("one_time"),
    providerPriceId: text("provider_price_id"),
    active: boolean("active").notNull().default(true),
    createdAt,
  },
  (t) => [index("prices_product_idx").on(t.productId)],
);

// ---------------------------------------------------------------------------
// wallets - one balance per identity (credit code OR external user)
// ---------------------------------------------------------------------------
export type WalletKind = "code" | "external";

export const wallets = pgTable(
  "wallets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("wal")),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<WalletKind>().notNull(),
    code: text("code"),
    externalUserId: text("external_user_id"),
    // Balances live per-product in `credit_balances` (a product = a credit type).
    // Provider customer id, captured on first paid order (for portal links).
    providerCustomerId: text("provider_customer_id"),
    createdAt,
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("wallets_code_uq").on(t.code),
    uniqueIndex("wallets_project_external_uq").on(
      t.projectId,
      t.externalUserId,
    ),
    index("wallets_project_idx").on(t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// creditBalances - one balance per (wallet, product); product = credit type
// ---------------------------------------------------------------------------
export const creditBalances = pgTable(
  "credit_balances",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("bal")),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // Denormalized cache of SUM(ledger.delta) for this (wallet, product).
    balance: credits("balance").notNull().default("0"),
    // Next monthly free-grant refill; null when the product has no free grant.
    freeGrantResetAt: timestamp("free_grant_reset_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    uniqueIndex("credit_balances_wallet_product_uq").on(
      t.walletId,
      t.productId,
    ),
    index("credit_balances_wallet_idx").on(t.walletId),
  ],
);

// ---------------------------------------------------------------------------
// ledgerEntries - append-only; every balance change
// ---------------------------------------------------------------------------
export type LedgerReason =
  "purchase" | "deduction" | "free_grant" | "manual" | "refund" | "expiry";

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("led")),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    delta: credits("delta").notNull(),
    reason: text("reason").$type<LedgerReason>().notNull(),
    // Per-wallet idempotency for deductions; a retried request is a no-op.
    idempotencyKey: text("idempotency_key"),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt,
  },
  (t) => [
    index("ledger_wallet_idx").on(t.walletId),
    // Dashboard aggregates filter by reason within a time window.
    index("ledger_reason_created_idx").on(t.reason, t.createdAt),
    uniqueIndex("ledger_wallet_idempotency_uq").on(
      t.walletId,
      t.idempotencyKey,
    ),
  ],
);

// ---------------------------------------------------------------------------
// orders - a checkout attempt and its fulfillment
// ---------------------------------------------------------------------------
export type OrderStatus = "pending" | "paid" | "failed" | "refunded";

export const orders = pgTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("ord")),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    priceId: text("price_id").references(() => prices.id, {
      onDelete: "set null",
    }),
    walletId: text("wallet_id").references(() => wallets.id, {
      onDelete: "set null",
    }),
    provider: text("provider").$type<Provider>().notNull(),
    providerCheckoutId: text("provider_checkout_id"),
    providerCustomerId: text("provider_customer_id"),
    customerEmail: text("customer_email"),
    status: text("status").$type<OrderStatus>().notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    // Entitlement snapshot captured at checkout time. Fulfillment, refunds, and
    // access derivation use this immutable copy so later product/price edits don't
    // change what an already-created order grants or revokes.
    productIdSnapshot: text("product_id_snapshot"),
    creditUnitSnapshot: text("credit_unit_snapshot"),
    creditsGrantedSnapshot: credits("credits_granted_snapshot"),
    featuresSnapshot: text("features_snapshot").array().notNull().default([]),
    intervalSnapshot: text("interval_snapshot").$type<PriceInterval>(),
    renewalModeSnapshot: text("renewal_mode_snapshot").$type<RenewalMode>(),
    priceLabelSnapshot: text("price_label_snapshot"),
    // The credit code issued/topped-up on fulfillment, surfaced to the buyer.
    issuedCode: text("issued_code"),
    createdAt,
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    index("orders_project_idx").on(t.projectId),
    index("orders_checkout_idx").on(t.providerCheckoutId),
    // Wallet expiry checks look up paid orders per wallet on most reads.
    index("orders_wallet_idx").on(t.walletId),
  ],
);

// ---------------------------------------------------------------------------
// subscriptions - a wallet's recurring access to a product, driven by provider
// webhooks. Access (features + included credits) is DERIVED from active rows;
// we never store the feature flags themselves, so cancel/refund can't drift.
// ---------------------------------------------------------------------------
export type SubscriptionStatus = "active" | "canceled";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("sub")),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceId: text("price_id").references(() => prices.id, {
      onDelete: "set null",
    }),
    // The order that started this subscription (its first paid cycle).
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    provider: text("provider").$type<Provider>().notNull(),
    // Provider's subscription id - the match key for renewal/cancel events.
    providerSubscriptionId: text("provider_subscription_id"),
    status: text("status")
      .$type<SubscriptionStatus>()
      .notNull()
      .default("active"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt,
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
  },
  (t) => [
    index("subscriptions_wallet_idx").on(t.walletId),
    uniqueIndex("subscriptions_provider_sub_uq").on(
      t.provider,
      t.providerSubscriptionId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// featureGrants - manual/support feature access, independent of any purchase.
// Subscription- and purchase-derived access is computed separately.
// ---------------------------------------------------------------------------
export const featureGrants = pgTable(
  "feature_grants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("feat")),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    note: text("note"),
    createdAt,
  },
  (t) => [
    uniqueIndex("feature_grants_wallet_feature_uq").on(t.walletId, t.feature),
    index("feature_grants_wallet_idx").on(t.walletId),
  ],
);

// ---------------------------------------------------------------------------
// webhookEvents - raw log for idempotency + debugging + replay
// ---------------------------------------------------------------------------
// `pending` = row claimed, fulfillment not yet confirmed (allows safe retry of
// a delivery that failed mid-fulfillment). Text column, so no migration needed.
export type WebhookStatus = "pending" | "processed" | "skipped" | "error";

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("evt")),
    providerAccountId: text("provider_account_id").references(
      () => providerAccounts.id,
      { onDelete: "set null" },
    ),
    provider: text("provider").$type<Provider>().notNull(),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: text("status").$type<WebhookStatus>().notNull(),
    error: text("error"),
    createdAt,
  },
  (t) => [
    uniqueIndex("webhook_provider_account_event_uq").on(
      t.providerAccountId,
      t.provider,
      t.providerEventId,
    ),
    // The dashboard webhook log filters by the owner's accounts.
    index("webhook_events_account_idx").on(t.providerAccountId),
  ],
);

// ---------------------------------------------------------------------------
// apiKeys - publishable (browser) + secret (server) per project
// ---------------------------------------------------------------------------
export type ApiKeyKind = "publishable" | "secret";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId("key")),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ApiKeyKind>().notNull(),
    name: text("name").notNull().default("default"),
    keyHash: text("key_hash").notNull(),
    // Display prefix, e.g. "pay_pk_7F3K" - enough to identify without revealing.
    prefix: text("prefix").notNull(),
    // Full plaintext, stored ONLY for publishable keys (public by design so they
    // can be shown/copied anytime). Always null for secret keys.
    publicValue: text("public_value"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt,
  },
  (t) => [
    uniqueIndex("api_keys_hash_uq").on(t.keyHash),
    index("api_keys_project_idx").on(t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// rateLimitBuckets - Postgres-backed token buckets for API abuse controls
// ---------------------------------------------------------------------------
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  tokens: numeric("tokens", { precision: 20, scale: 6 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const projectsRelations = relations(projects, ({ many }) => ({
  products: many(products),
  wallets: many(wallets),
  apiKeys: many(apiKeys),
  orders: many(orders),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  project: one(projects, {
    fields: [products.projectId],
    references: [projects.id],
  }),
  providerAccount: one(providerAccounts, {
    fields: [products.providerAccountId],
    references: [providerAccounts.id],
  }),
  prices: many(prices),
}));

export const pricesRelations = relations(prices, ({ one }) => ({
  product: one(products, {
    fields: [prices.productId],
    references: [products.id],
  }),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  project: one(projects, {
    fields: [wallets.projectId],
    references: [projects.id],
  }),
  ledger: many(ledgerEntries),
  balances: many(creditBalances),
  subscriptions: many(subscriptions),
  featureGrants: many(featureGrants),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  wallet: one(wallets, {
    fields: [subscriptions.walletId],
    references: [wallets.id],
  }),
  product: one(products, {
    fields: [subscriptions.productId],
    references: [products.id],
  }),
  price: one(prices, {
    fields: [subscriptions.priceId],
    references: [prices.id],
  }),
}));

export const featureGrantsRelations = relations(featureGrants, ({ one }) => ({
  wallet: one(wallets, {
    fields: [featureGrants.walletId],
    references: [wallets.id],
  }),
}));

export const creditBalancesRelations = relations(creditBalances, ({ one }) => ({
  wallet: one(wallets, {
    fields: [creditBalances.walletId],
    references: [wallets.id],
  }),
  product: one(products, {
    fields: [creditBalances.productId],
    references: [products.id],
  }),
}));

export const ledgerRelations = relations(ledgerEntries, ({ one }) => ({
  wallet: one(wallets, {
    fields: [ledgerEntries.walletId],
    references: [wallets.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  project: one(projects, {
    fields: [orders.projectId],
    references: [projects.id],
  }),
  price: one(prices, { fields: [orders.priceId], references: [prices.id] }),
  wallet: one(wallets, { fields: [orders.walletId], references: [wallets.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [apiKeys.projectId],
    references: [projects.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type Project = typeof projects.$inferSelect;
export type ProviderAccount = typeof providerAccounts.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Price = typeof prices.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type CreditBalance = typeof creditBalances.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type FeatureGrant = typeof featureGrants.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;

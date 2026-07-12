import { createHash } from "node:crypto";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { createId } from "../src/lib/id";
import { encryptSecret } from "../shared/secret-encryption";

loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL;
loadEnvConfig(join(process.cwd(), "services/provider"), undefined, console, true);

const DEMO_EMAIL = "pay@vantezzen.io";
const DEMO_PASSWORD = "1234";
const DAY_MS = 24 * 60 * 60 * 1000;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed the database with NODE_ENV=production");
  process.exit(1);
}

function daysAgo(days: number, hour = 10): Date {
  const date = new Date(Date.now() - days * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

function daysFromNow(days: number, hour = 10): Date {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function apiKey(projectId: string, kind: schema.ApiKeyKind, name: string) {
  const visible =
    kind === "publishable"
      ? `pay_pk_demo_${projectId.slice(-8)}_${name.toLowerCase()}`
      : `pay_sk_demo_${projectId.slice(-8)}_${name.toLowerCase()}`;

  return {
    id: createId("key"),
    projectId,
    kind,
    name,
    keyHash: sha256(visible),
    prefix: visible.slice(0, 16),
    publicValue: kind === "publishable" ? visible : null,
    lastUsedAt: daysAgo(kind === "publishable" ? 1 : 3, 14),
    createdAt: daysAgo(67),
  };
}

// ---------------------------------------------------------------------------
// Bulk seeding helpers - randomized-but-reproducible data generation.
// ---------------------------------------------------------------------------
const BULK_WALLET_COUNT = 1000;
const BULK_ORDER_COUNT = 500;
const BULK_WINDOW_DAYS = 30;

// Small seeded PRNG (mulberry32) so each run is varied but reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x1a2b3c4d);
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)];
const roundCredits = (n: number) => Math.round(n * 100) / 100;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(prefix: string): string {
  const group = () =>
    Array.from({ length: 4 }, () => pick([...CODE_ALPHABET])).join("");
  return `${prefix}-${group()}-${group()}-${group()}`;
}

// A random instant within the last `days`, never in the future.
function randomRecentDate(days: number): Date {
  return new Date(Date.now() - Math.floor(rand() * days * DAY_MS));
}
// A random instant between `from` and now.
function randomDateBetween(from: Date): Date {
  const span = Math.max(Date.now() - from.getTime(), 0);
  return new Date(from.getTime() + Math.floor(rand() * span));
}

const ORDER_STATUS_WEIGHTS: [schema.OrderStatus, number][] = [
  ["paid", 76],
  ["pending", 9],
  ["failed", 9],
  ["refunded", 6],
];
function pickOrderStatus(): schema.OrderStatus {
  const total = ORDER_STATUS_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [status, weight] of ORDER_STATUS_WEIGHTS) {
    if ((roll -= weight) < 0) return status;
  }
  return "paid";
}

const USAGE_NOTES = [
  "Social clips",
  "Podcast highlights",
  "Batch render",
  "Ad variants",
  "API render run",
  "Thumbnail set",
  "Hero images",
  "Campaign export",
];

const demoEventIds = [
  "evt_demo_clip_creator_paid",
  "evt_demo_clip_starter_paid",
  "evt_demo_clip_refund",
  "evt_demo_clip_failed",
  "evt_demo_render_scale_paid",
  "evt_demo_render_scale_renewal",
  "evt_demo_render_priority_paid",
  "evt_demo_render_replay_error",
];

const client = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(client, { schema });

try {
  const userId = createId("usr");
  const stripeAccountId = createId("prov");
  const polarAccountId = createId("prov");
  const clipForgeId = createId("proj");
  const renderPilotId = createId("proj");
  const launchNotesId = createId("proj");

  const clipMinutesId = createId("prod");
  const clipCreatorId = createId("prod");
  const renderCreditsId = createId("prod");
  const renderPriorityId = createId("prod");
  const launchSeatsId = createId("prod");

  const starterPackId = createId("price");
  const launchPackId = createId("price");
  const creatorMonthlyId = createId("price");
  const studioMonthlyId = createId("price");
  const developerMonthlyId = createId("price");
  const scaleMonthlyId = createId("price");
  const priorityUnlockId = createId("price");
  const startupMonthlyId = createId("price");

  const walletAvaId = createId("wal");
  const walletSamId = createId("wal");
  const walletRefundId = createId("wal");
  const walletRenderUserId = createId("wal");
  const walletAcmeId = createId("wal");
  const walletLaunchId = createId("wal");

  const orderClipLaunchId = createId("ord");
  const orderClipCreatorId = createId("ord");
  const orderClipStarterId = createId("ord");
  const orderClipRefundId = createId("ord");
  const orderClipFailedId = createId("ord");
  const orderRenderScaleFirstId = createId("ord");
  const orderRenderScaleRenewalId = createId("ord");
  const orderRenderPriorityId = createId("ord");
  const orderRenderPendingId = createId("ord");
  const orderLaunchStartupId = createId("ord");

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, DEMO_EMAIL));

    for (const row of existing) {
      const providerRows = await tx
        .select({ id: schema.providerAccounts.id })
        .from(schema.providerAccounts)
        .where(eq(schema.providerAccounts.ownerId, row.id));
      const providerIds = providerRows.map((provider) => provider.id);

      if (providerIds.length > 0) {
        await tx
          .delete(schema.webhookEvents)
          .where(inArray(schema.webhookEvents.providerAccountId, providerIds));
      }

      await tx
        .delete(schema.projects)
        .where(eq(schema.projects.ownerId, row.id));
      await tx
        .delete(schema.providerAccounts)
        .where(eq(schema.providerAccounts.ownerId, row.id));
      await tx.delete(schema.user).where(eq(schema.user.id, row.id));
    }

    await tx
      .delete(schema.webhookEvents)
      .where(inArray(schema.webhookEvents.providerEventId, demoEventIds));
    await tx
      .delete(schema.verification)
      .where(eq(schema.verification.identifier, DEMO_EMAIL));

    await tx.insert(schema.user).values({
      id: userId,
      name: "vantezzen/pay Demo",
      email: DEMO_EMAIL,
      emailVerified: true,
      image: null,
      createdAt: daysAgo(92),
      updatedAt: daysAgo(1),
    });
    await tx.insert(schema.account).values({
      id: createId("acct"),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: daysAgo(92),
      updatedAt: daysAgo(1),
    });

    await tx.insert(schema.providerAccounts).values([
      {
        id: stripeAccountId,
        ownerId: userId,
        provider: "stripe",
        label: "Stripe Test - SaaS Demo",
        secretKeyEnc: await encryptSecret("sk_test_demo_pay_screenshots", {
          accountId: stripeAccountId,
          provider: "stripe",
          purpose: "provider_api_key",
        }),
        webhookSecretEnc: await encryptSecret("whsec_demo_clipforge", {
          accountId: stripeAccountId,
          provider: "stripe",
          purpose: "webhook_secret",
        }),
        environment: "test",
        createdAt: daysAgo(89),
      },
      {
        id: polarAccountId,
        ownerId: userId,
        provider: "polar",
        label: "Polar Sandbox - EU Customers",
        secretKeyEnc: await encryptSecret("polar_oat_demo_pay_screenshots", {
          accountId: polarAccountId,
          provider: "polar",
          purpose: "provider_api_key",
        }),
        webhookSecretEnc: await encryptSecret(
          "polar_whsec_demo_renderpilot",
          {
            accountId: polarAccountId,
            provider: "polar",
            purpose: "webhook_secret",
          },
        ),
        environment: "sandbox",
        createdAt: daysAgo(74),
      },
    ]);

    await tx.insert(schema.projects).values([
      {
        id: clipForgeId,
        ownerId: userId,
        slug: "clipforge",
        name: "ClipForge",
        mode: "credit_codes",
        allowedOrigins: ["https://demo.vantezzen.io", "http://localhost:5173"],
        codePrefix: "CLIP",
        codeExpiresInDays: 365,
        anonymousWalletsPerHour: 60,
        createdAt: daysAgo(88),
      },
      {
        id: renderPilotId,
        ownerId: userId,
        slug: "renderpilot",
        name: "RenderPilot",
        mode: "external_auth",
        allowedOrigins: [
          "https://render.vantezzen.io",
          "https://app.renderpilot.io",
        ],
        codePrefix: "RPLT",
        codeExpiresInDays: null,
        anonymousWalletsPerHour: 20,
        createdAt: daysAgo(72),
      },
      {
        id: launchNotesId,
        ownerId: userId,
        slug: "launchnotes",
        name: "LaunchNotes",
        mode: "external_auth",
        allowedOrigins: ["https://launch.vantezzen.io"],
        codePrefix: "NOTE",
        codeExpiresInDays: null,
        anonymousWalletsPerHour: 20,
        createdAt: daysAgo(35),
      },
    ]);

    await tx.insert(schema.products).values([
      {
        id: clipMinutesId,
        projectId: clipForgeId,
        providerAccountId: stripeAccountId,
        name: "Video minutes",
        description: "Metered render minutes for AI video exports.",
        type: "credits",
        creditUnit: "minutes",
        freeGrant: { credits: 20, period: "monthly" },
        renewalMode: "add",
        providerProductId: "prod_demo_clip_minutes",
        active: true,
        createdAt: daysAgo(86),
      },
      {
        id: clipCreatorId,
        projectId: clipForgeId,
        providerAccountId: stripeAccountId,
        name: "Creator plan",
        description: "Recurring access with included monthly render minutes.",
        type: "subscription",
        creditUnit: "minutes",
        freeGrant: null,
        renewalMode: "refresh",
        providerProductId: "prod_demo_clip_creator",
        active: true,
        createdAt: daysAgo(83),
      },
      {
        id: renderCreditsId,
        projectId: renderPilotId,
        providerAccountId: polarAccountId,
        name: "Render API credits",
        description: "External-auth credits for server-side image rendering.",
        type: "subscription",
        creditUnit: "render credits",
        freeGrant: { credits: 50, period: "monthly" },
        renewalMode: "add",
        providerProductId: "polar_prod_render_api",
        active: true,
        createdAt: daysAgo(70),
      },
      {
        id: renderPriorityId,
        projectId: renderPilotId,
        providerAccountId: stripeAccountId,
        name: "Priority queue unlock",
        description: "Permanent priority processing for occasional customers.",
        type: "one_time",
        creditUnit: "credits",
        freeGrant: null,
        renewalMode: "refresh",
        providerProductId: "prod_demo_priority_unlock",
        active: true,
        createdAt: daysAgo(61),
      },
      {
        id: launchSeatsId,
        projectId: launchNotesId,
        providerAccountId: polarAccountId,
        name: "Team workspace",
        description: "Seat-based access for product teams collecting feedback.",
        type: "subscription",
        creditUnit: "seats",
        freeGrant: null,
        renewalMode: "refresh",
        providerProductId: "polar_prod_launch_workspace",
        active: true,
        createdAt: daysAgo(32),
      },
    ]);

    await tx.insert(schema.prices).values([
      {
        id: starterPackId,
        productId: clipMinutesId,
        label: "Starter pack",
        amountCents: 1900,
        currency: "USD",
        creditsGranted: "180",
        features: ["watermark-free"],
        interval: "one_time",
        providerPriceId: "price_demo_clip_starter",
        active: true,
        createdAt: daysAgo(85),
      },
      {
        id: launchPackId,
        productId: clipMinutesId,
        label: "Launch pack",
        amountCents: 5900,
        currency: "USD",
        creditsGranted: "750",
        features: ["watermark-free", "priority-queue"],
        interval: "one_time",
        providerPriceId: "price_demo_clip_launch",
        active: true,
        createdAt: daysAgo(84),
      },
      {
        id: creatorMonthlyId,
        productId: clipCreatorId,
        label: "Creator",
        amountCents: 2900,
        currency: "USD",
        creditsGranted: "400",
        features: ["priority-queue", "1080p-export"],
        interval: "month",
        providerPriceId: "price_demo_creator_monthly",
        active: true,
        createdAt: daysAgo(82),
      },
      {
        id: studioMonthlyId,
        productId: clipCreatorId,
        label: "Studio",
        amountCents: 7900,
        currency: "USD",
        creditsGranted: "1400",
        features: [
          "priority-queue",
          "4k-export",
          "team-workspace",
          "batch-render",
        ],
        interval: "month",
        providerPriceId: "price_demo_studio_monthly",
        active: true,
        createdAt: daysAgo(81),
      },
      {
        id: developerMonthlyId,
        productId: renderCreditsId,
        label: "Developer",
        amountCents: 1500,
        currency: "USD",
        creditsGranted: "500",
        features: ["commercial-use"],
        interval: "month",
        providerPriceId: "polar_price_developer_monthly",
        active: true,
        createdAt: daysAgo(69),
      },
      {
        id: scaleMonthlyId,
        productId: renderCreditsId,
        label: "Scale",
        amountCents: 9900,
        currency: "USD",
        creditsGranted: "5000",
        features: ["commercial-use", "sla", "team-api-keys"],
        interval: "month",
        providerPriceId: "polar_price_scale_monthly",
        active: true,
        createdAt: daysAgo(68),
      },
      {
        id: priorityUnlockId,
        productId: renderPriorityId,
        label: "Lifetime priority",
        amountCents: 4900,
        currency: "USD",
        creditsGranted: "0",
        features: ["priority-queue"],
        interval: "one_time",
        providerPriceId: "price_demo_priority_lifetime",
        active: true,
        createdAt: daysAgo(60),
      },
      {
        id: startupMonthlyId,
        productId: launchSeatsId,
        label: "Startup",
        amountCents: 3900,
        currency: "USD",
        creditsGranted: "0",
        features: ["feedback-portal", "custom-branding", "team-members"],
        interval: "month",
        providerPriceId: "polar_price_launch_startup",
        active: true,
        createdAt: daysAgo(31),
      },
    ]);

    await tx.insert(schema.wallets).values([
      {
        id: walletAvaId,
        projectId: clipForgeId,
        kind: "code",
        code: "CLIP-8F3K-L9PQ-2MVT",
        externalUserId: null,
        providerCustomerId: "cus_demo_ava",
        createdAt: daysAgo(20),
        lastSeenAt: daysAgo(0, 15),
      },
      {
        id: walletSamId,
        projectId: clipForgeId,
        kind: "code",
        code: "CLIP-4N7Q-V2XT-H8ZD",
        externalUserId: null,
        providerCustomerId: "cus_demo_sam",
        createdAt: daysAgo(15),
        lastSeenAt: daysAgo(1, 11),
      },
      {
        id: walletRefundId,
        projectId: clipForgeId,
        kind: "code",
        code: "CLIP-6WQ9-T3MA-J2PE",
        externalUserId: null,
        providerCustomerId: "cus_demo_refund",
        createdAt: daysAgo(12),
        lastSeenAt: daysAgo(3, 9),
      },
      {
        id: walletRenderUserId,
        projectId: renderPilotId,
        kind: "external",
        code: null,
        externalUserId: "user_9f2a1c",
        providerCustomerId: "polar_cus_render_9f2a1c",
        createdAt: daysAgo(21),
        lastSeenAt: daysAgo(0, 13),
      },
      {
        id: walletAcmeId,
        projectId: renderPilotId,
        kind: "external",
        code: null,
        externalUserId: "team_acme",
        providerCustomerId: "cus_demo_acme",
        createdAt: daysAgo(28),
        lastSeenAt: daysAgo(2, 16),
      },
      {
        id: walletLaunchId,
        projectId: launchNotesId,
        kind: "external",
        code: null,
        externalUserId: "workspace_linear-labs",
        providerCustomerId: "polar_cus_launch_linear",
        createdAt: daysAgo(19),
        lastSeenAt: daysAgo(1, 10),
      },
    ]);

    await tx.insert(schema.orders).values([
      {
        id: orderClipLaunchId,
        projectId: clipForgeId,
        priceId: launchPackId,
        walletId: walletAvaId,
        provider: "stripe",
        providerCheckoutId: "cs_test_demo_clip_launch",
        providerCustomerId: "cus_demo_ava",
        status: "paid",
        amountCents: 5900,
        currency: "USD",
        productIdSnapshot: clipMinutesId,
        creditUnitSnapshot: "minutes",
        creditsGrantedSnapshot: "750",
        featuresSnapshot: ["watermark-free", "priority-queue"],
        intervalSnapshot: "one_time",
        renewalModeSnapshot: "add",
        priceLabelSnapshot: "Launch pack",
        issuedCode: "CLIP-8F3K-L9PQ-2MVT",
        createdAt: daysAgo(18),
        paidAt: daysAgo(18),
      },
      {
        id: orderClipCreatorId,
        projectId: clipForgeId,
        priceId: creatorMonthlyId,
        walletId: walletAvaId,
        provider: "stripe",
        providerCheckoutId: "cs_test_demo_creator_monthly",
        providerCustomerId: "cus_demo_ava",
        status: "paid",
        amountCents: 2900,
        currency: "USD",
        productIdSnapshot: clipCreatorId,
        creditUnitSnapshot: "minutes",
        creditsGrantedSnapshot: "400",
        featuresSnapshot: ["priority-queue", "1080p-export"],
        intervalSnapshot: "month",
        renewalModeSnapshot: "refresh",
        priceLabelSnapshot: "Creator",
        issuedCode: "CLIP-8F3K-L9PQ-2MVT",
        createdAt: daysAgo(9),
        paidAt: daysAgo(9),
      },
      {
        id: orderClipStarterId,
        projectId: clipForgeId,
        priceId: starterPackId,
        walletId: walletSamId,
        provider: "stripe",
        providerCheckoutId: "cs_test_demo_starter_pack",
        providerCustomerId: "cus_demo_sam",
        status: "paid",
        amountCents: 1900,
        currency: "USD",
        productIdSnapshot: clipMinutesId,
        creditUnitSnapshot: "minutes",
        creditsGrantedSnapshot: "180",
        featuresSnapshot: ["watermark-free"],
        intervalSnapshot: "one_time",
        renewalModeSnapshot: "add",
        priceLabelSnapshot: "Starter pack",
        issuedCode: "CLIP-4N7Q-V2XT-H8ZD",
        createdAt: daysAgo(15),
        paidAt: daysAgo(15),
      },
      {
        id: orderClipRefundId,
        projectId: clipForgeId,
        priceId: starterPackId,
        walletId: walletRefundId,
        provider: "stripe",
        providerCheckoutId: "cs_test_demo_refunded_pack",
        providerCustomerId: "cus_demo_refund",
        status: "refunded",
        amountCents: 1900,
        currency: "USD",
        productIdSnapshot: clipMinutesId,
        creditUnitSnapshot: "minutes",
        creditsGrantedSnapshot: "180",
        featuresSnapshot: ["watermark-free"],
        intervalSnapshot: "one_time",
        renewalModeSnapshot: "add",
        priceLabelSnapshot: "Starter pack",
        issuedCode: "CLIP-6WQ9-T3MA-J2PE",
        createdAt: daysAgo(12),
        paidAt: daysAgo(12),
      },
      {
        id: orderClipFailedId,
        projectId: clipForgeId,
        priceId: studioMonthlyId,
        walletId: walletSamId,
        provider: "stripe",
        providerCheckoutId: "cs_test_demo_failed_studio",
        providerCustomerId: "cus_demo_sam",
        status: "failed",
        amountCents: 7900,
        currency: "USD",
        productIdSnapshot: clipCreatorId,
        creditUnitSnapshot: "minutes",
        creditsGrantedSnapshot: "1400",
        featuresSnapshot: [
          "priority-queue",
          "4k-export",
          "team-workspace",
          "batch-render",
        ],
        intervalSnapshot: "month",
        renewalModeSnapshot: "refresh",
        priceLabelSnapshot: "Studio",
        issuedCode: "CLIP-4N7Q-V2XT-H8ZD",
        createdAt: daysAgo(2),
        paidAt: null,
      },
      {
        id: orderRenderScaleFirstId,
        projectId: renderPilotId,
        priceId: scaleMonthlyId,
        walletId: walletRenderUserId,
        provider: "polar",
        providerCheckoutId: "polar_chk_demo_scale_first",
        providerCustomerId: "polar_cus_render_9f2a1c",
        status: "paid",
        amountCents: 9900,
        currency: "USD",
        productIdSnapshot: renderCreditsId,
        creditUnitSnapshot: "render credits",
        creditsGrantedSnapshot: "5000",
        featuresSnapshot: ["commercial-use", "sla", "team-api-keys"],
        intervalSnapshot: "month",
        renewalModeSnapshot: "add",
        priceLabelSnapshot: "Scale",
        issuedCode: null,
        createdAt: daysAgo(21),
        paidAt: daysAgo(21),
      },
      {
        id: orderRenderScaleRenewalId,
        projectId: renderPilotId,
        priceId: scaleMonthlyId,
        walletId: walletRenderUserId,
        provider: "polar",
        providerCheckoutId: "polar_inv_demo_scale_renewal",
        providerCustomerId: "polar_cus_render_9f2a1c",
        status: "paid",
        amountCents: 9900,
        currency: "USD",
        productIdSnapshot: renderCreditsId,
        creditUnitSnapshot: "render credits",
        creditsGrantedSnapshot: "5000",
        featuresSnapshot: ["commercial-use", "sla", "team-api-keys"],
        intervalSnapshot: "month",
        renewalModeSnapshot: "add",
        priceLabelSnapshot: "Scale",
        issuedCode: null,
        createdAt: daysAgo(5),
        paidAt: daysAgo(5),
      },
      {
        id: orderRenderPriorityId,
        projectId: renderPilotId,
        priceId: priorityUnlockId,
        walletId: walletAcmeId,
        provider: "stripe",
        providerCheckoutId: "cs_test_demo_priority_unlock",
        providerCustomerId: "cus_demo_acme",
        status: "paid",
        amountCents: 4900,
        currency: "USD",
        productIdSnapshot: renderPriorityId,
        creditUnitSnapshot: "credits",
        creditsGrantedSnapshot: "0",
        featuresSnapshot: ["priority-queue"],
        intervalSnapshot: "one_time",
        renewalModeSnapshot: "refresh",
        priceLabelSnapshot: "Lifetime priority",
        issuedCode: null,
        createdAt: daysAgo(28),
        paidAt: daysAgo(28),
      },
      {
        id: orderRenderPendingId,
        projectId: renderPilotId,
        priceId: developerMonthlyId,
        walletId: walletAcmeId,
        provider: "polar",
        providerCheckoutId: "polar_chk_demo_pending_dev",
        providerCustomerId: "polar_cus_acme",
        status: "pending",
        amountCents: 1500,
        currency: "USD",
        productIdSnapshot: renderCreditsId,
        creditUnitSnapshot: "render credits",
        creditsGrantedSnapshot: "500",
        featuresSnapshot: ["commercial-use"],
        intervalSnapshot: "month",
        renewalModeSnapshot: "add",
        priceLabelSnapshot: "Developer",
        issuedCode: null,
        createdAt: daysAgo(1),
        paidAt: null,
      },
      {
        id: orderLaunchStartupId,
        projectId: launchNotesId,
        priceId: startupMonthlyId,
        walletId: walletLaunchId,
        provider: "polar",
        providerCheckoutId: "polar_chk_demo_launch_startup",
        providerCustomerId: "polar_cus_launch_linear",
        status: "paid",
        amountCents: 3900,
        currency: "USD",
        productIdSnapshot: launchSeatsId,
        creditUnitSnapshot: "seats",
        creditsGrantedSnapshot: "0",
        featuresSnapshot: [
          "feedback-portal",
          "custom-branding",
          "team-members",
        ],
        intervalSnapshot: "month",
        renewalModeSnapshot: "refresh",
        priceLabelSnapshot: "Startup",
        issuedCode: null,
        createdAt: daysAgo(19),
        paidAt: daysAgo(19),
      },
    ]);

    await tx.insert(schema.subscriptions).values([
      {
        id: createId("sub"),
        walletId: walletAvaId,
        productId: clipCreatorId,
        priceId: creatorMonthlyId,
        orderId: orderClipCreatorId,
        provider: "stripe",
        providerSubscriptionId: "sub_demo_clip_creator",
        status: "active",
        currentPeriodEnd: daysFromNow(21),
        createdAt: daysAgo(9),
        canceledAt: null,
      },
      {
        id: createId("sub"),
        walletId: walletRenderUserId,
        productId: renderCreditsId,
        priceId: scaleMonthlyId,
        orderId: orderRenderScaleFirstId,
        provider: "polar",
        providerSubscriptionId: "polar_sub_demo_render_scale",
        status: "active",
        currentPeriodEnd: daysFromNow(25),
        createdAt: daysAgo(21),
        canceledAt: null,
      },
      {
        id: createId("sub"),
        walletId: walletSamId,
        productId: clipCreatorId,
        priceId: studioMonthlyId,
        orderId: orderClipFailedId,
        provider: "stripe",
        providerSubscriptionId: "sub_demo_clip_canceled",
        status: "canceled",
        currentPeriodEnd: daysAgo(1),
        createdAt: daysAgo(39),
        canceledAt: daysAgo(2),
      },
      {
        id: createId("sub"),
        walletId: walletLaunchId,
        productId: launchSeatsId,
        priceId: startupMonthlyId,
        orderId: orderLaunchStartupId,
        provider: "polar",
        providerSubscriptionId: "polar_sub_demo_launch_startup",
        status: "active",
        currentPeriodEnd: daysFromNow(11),
        createdAt: daysAgo(19),
        canceledAt: null,
      },
    ]);

    await tx.insert(schema.creditBalances).values([
      {
        id: createId("bal"),
        walletId: walletAvaId,
        productId: clipMinutesId,
        balance: "536.500000",
        freeGrantResetAt: daysFromNow(23),
        createdAt: daysAgo(18),
      },
      {
        id: createId("bal"),
        walletId: walletAvaId,
        productId: clipCreatorId,
        balance: "320.000000",
        freeGrantResetAt: null,
        createdAt: daysAgo(9),
      },
      {
        id: createId("bal"),
        walletId: walletSamId,
        productId: clipMinutesId,
        balance: "17.250000",
        freeGrantResetAt: daysFromNow(16),
        createdAt: daysAgo(15),
      },
      {
        id: createId("bal"),
        walletId: walletRefundId,
        productId: clipMinutesId,
        balance: "0.000000",
        freeGrantResetAt: null,
        createdAt: daysAgo(12),
      },
      {
        id: createId("bal"),
        walletId: walletRenderUserId,
        productId: renderCreditsId,
        balance: "7390.000000",
        freeGrantResetAt: daysFromNow(20),
        createdAt: daysAgo(21),
      },
    ]);

    await tx.insert(schema.ledgerEntries).values([
      {
        id: createId("led"),
        walletId: walletAvaId,
        productId: clipMinutesId,
        delta: "750",
        reason: "purchase",
        idempotencyKey: "seed_clip_launch_purchase",
        orderId: orderClipLaunchId,
        metadata: { note: "Launch pack checkout" },
        createdAt: daysAgo(18),
      },
      {
        id: createId("led"),
        walletId: walletAvaId,
        productId: clipMinutesId,
        delta: "20",
        reason: "free_grant",
        idempotencyKey: "seed_clip_free_grant_july",
        orderId: null,
        metadata: { note: "Monthly free grant" },
        createdAt: daysAgo(7),
      },
      {
        id: createId("led"),
        walletId: walletAvaId,
        productId: clipMinutesId,
        delta: "-44",
        reason: "deduction",
        idempotencyKey: "seed_clip_ava_batch_1",
        orderId: null,
        metadata: { note: "11 social clips" },
        createdAt: daysAgo(6),
      },
      {
        id: createId("led"),
        walletId: walletAvaId,
        productId: clipMinutesId,
        delta: "-61.5",
        reason: "deduction",
        idempotencyKey: "seed_clip_ava_podcast",
        orderId: null,
        metadata: { note: "Podcast highlights" },
        createdAt: daysAgo(4),
      },
      {
        id: createId("led"),
        walletId: walletAvaId,
        productId: clipMinutesId,
        delta: "-128",
        reason: "deduction",
        idempotencyKey: "seed_clip_ava_ads",
        orderId: null,
        metadata: { note: "Customer ad variants" },
        createdAt: daysAgo(2),
      },
      {
        id: createId("led"),
        walletId: walletAvaId,
        productId: clipCreatorId,
        delta: "400",
        reason: "purchase",
        idempotencyKey: "seed_clip_creator_purchase",
        orderId: orderClipCreatorId,
        metadata: { note: "Creator subscription started" },
        createdAt: daysAgo(9),
      },
      {
        id: createId("led"),
        walletId: walletAvaId,
        productId: clipCreatorId,
        delta: "-80",
        reason: "deduction",
        idempotencyKey: "seed_clip_creator_deduction",
        orderId: null,
        metadata: { note: "Priority export batch" },
        createdAt: daysAgo(1),
      },
      {
        id: createId("led"),
        walletId: walletSamId,
        productId: clipMinutesId,
        delta: "180",
        reason: "purchase",
        idempotencyKey: "seed_clip_starter_purchase",
        orderId: orderClipStarterId,
        metadata: { note: "Starter pack checkout" },
        createdAt: daysAgo(15),
      },
      {
        id: createId("led"),
        walletId: walletSamId,
        productId: clipMinutesId,
        delta: "-62.75",
        reason: "deduction",
        idempotencyKey: "seed_clip_sam_intro",
        orderId: null,
        metadata: { note: "Product intro exports" },
        createdAt: daysAgo(10),
      },
      {
        id: createId("led"),
        walletId: walletSamId,
        productId: clipMinutesId,
        delta: "-100",
        reason: "deduction",
        idempotencyKey: "seed_clip_sam_campaign",
        orderId: null,
        metadata: { note: "Campaign clips" },
        createdAt: daysAgo(2),
      },
      {
        id: createId("led"),
        walletId: walletRefundId,
        productId: clipMinutesId,
        delta: "180",
        reason: "purchase",
        idempotencyKey: "seed_clip_refund_purchase",
        orderId: orderClipRefundId,
        metadata: { note: "Starter pack checkout" },
        createdAt: daysAgo(12),
      },
      {
        id: createId("led"),
        walletId: walletRefundId,
        productId: clipMinutesId,
        delta: "-180",
        reason: "refund",
        idempotencyKey: "seed_clip_refund_revoke",
        orderId: orderClipRefundId,
        metadata: { note: "Refund requested by customer" },
        createdAt: daysAgo(3),
      },
      {
        id: createId("led"),
        walletId: walletRenderUserId,
        productId: renderCreditsId,
        delta: "5000",
        reason: "purchase",
        idempotencyKey: "seed_render_scale_first",
        orderId: orderRenderScaleFirstId,
        metadata: { note: "Scale subscription started" },
        createdAt: daysAgo(21),
      },
      {
        id: createId("led"),
        walletId: walletRenderUserId,
        productId: renderCreditsId,
        delta: "5000",
        reason: "purchase",
        idempotencyKey: "seed_render_scale_renewal",
        orderId: orderRenderScaleRenewalId,
        metadata: { note: "Subscription renewal" },
        createdAt: daysAgo(5),
      },
      {
        id: createId("led"),
        walletId: walletRenderUserId,
        productId: renderCreditsId,
        delta: "-1220",
        reason: "deduction",
        idempotencyKey: "seed_render_catalog",
        orderId: null,
        metadata: { note: "Catalog render run" },
        createdAt: daysAgo(4),
      },
      {
        id: createId("led"),
        walletId: walletRenderUserId,
        productId: renderCreditsId,
        delta: "-860",
        reason: "deduction",
        idempotencyKey: "seed_render_ab_tests",
        orderId: null,
        metadata: { note: "A/B test thumbnails" },
        createdAt: daysAgo(2),
      },
      {
        id: createId("led"),
        walletId: walletRenderUserId,
        productId: renderCreditsId,
        delta: "-530",
        reason: "deduction",
        idempotencyKey: "seed_render_hero_images",
        orderId: null,
        metadata: { note: "Hero image variants" },
        createdAt: daysAgo(1),
      },
    ]);

    await tx.insert(schema.featureGrants).values([
      {
        id: createId("feat"),
        walletId: walletAvaId,
        feature: "beta-transitions",
        note: "Included for screenshot demo customer",
        createdAt: daysAgo(6),
      },
      {
        id: createId("feat"),
        walletId: walletAcmeId,
        feature: "concierge-onboarding",
        note: "Manual support grant",
        createdAt: daysAgo(20),
      },
    ]);

    await tx
      .insert(schema.apiKeys)
      .values([
        apiKey(clipForgeId, "publishable", "web"),
        apiKey(clipForgeId, "secret", "server"),
        apiKey(renderPilotId, "publishable", "web"),
        apiKey(renderPilotId, "secret", "worker"),
        apiKey(launchNotesId, "publishable", "web"),
      ]);

    await tx.insert(schema.webhookEvents).values([
      {
        id: createId("evt"),
        providerAccountId: stripeAccountId,
        provider: "stripe",
        providerEventId: "evt_demo_clip_creator_paid",
        type: "checkout.session.completed",
        payload: {
          id: "evt_demo_clip_creator_paid",
          data: { object: { id: "cs_test_demo_creator_monthly" } },
        },
        status: "processed",
        error: null,
        createdAt: daysAgo(9),
      },
      {
        id: createId("evt"),
        providerAccountId: stripeAccountId,
        provider: "stripe",
        providerEventId: "evt_demo_clip_starter_paid",
        type: "checkout.session.completed",
        payload: {
          id: "evt_demo_clip_starter_paid",
          data: { object: { id: "cs_test_demo_starter_pack" } },
        },
        status: "processed",
        error: null,
        createdAt: daysAgo(15),
      },
      {
        id: createId("evt"),
        providerAccountId: stripeAccountId,
        provider: "stripe",
        providerEventId: "evt_demo_clip_refund",
        type: "charge.refunded",
        payload: {
          id: "evt_demo_clip_refund",
          data: {
            object: { customer: "cus_demo_refund", amount_refunded: 1900 },
          },
        },
        status: "processed",
        error: null,
        createdAt: daysAgo(3),
      },
      {
        id: createId("evt"),
        providerAccountId: stripeAccountId,
        provider: "stripe",
        providerEventId: "evt_demo_clip_failed",
        type: "checkout.session.async_payment_failed",
        payload: {
          id: "evt_demo_clip_failed",
          data: { object: { id: "cs_test_demo_failed_studio" } },
        },
        status: "skipped",
        error: null,
        createdAt: daysAgo(2),
      },
      {
        id: createId("evt"),
        providerAccountId: polarAccountId,
        provider: "polar",
        providerEventId: "evt_demo_render_scale_paid",
        type: "order.paid",
        payload: {
          id: "evt_demo_render_scale_paid",
          data: { checkout_id: "polar_chk_demo_scale_first" },
        },
        status: "processed",
        error: null,
        createdAt: daysAgo(21),
      },
      {
        id: createId("evt"),
        providerAccountId: polarAccountId,
        provider: "polar",
        providerEventId: "evt_demo_render_scale_renewal",
        type: "subscription.active",
        payload: {
          id: "evt_demo_render_scale_renewal",
          data: { subscription_id: "polar_sub_demo_render_scale" },
        },
        status: "processed",
        error: null,
        createdAt: daysAgo(5),
      },
      {
        id: createId("evt"),
        providerAccountId: stripeAccountId,
        provider: "stripe",
        providerEventId: "evt_demo_render_priority_paid",
        type: "checkout.session.completed",
        payload: {
          id: "evt_demo_render_priority_paid",
          data: { object: { id: "cs_test_demo_priority_unlock" } },
        },
        status: "processed",
        error: null,
        createdAt: daysAgo(28),
      },
      {
        id: createId("evt"),
        providerAccountId: polarAccountId,
        provider: "polar",
        providerEventId: "evt_demo_render_replay_error",
        type: "order.paid",
        payload: {
          id: "evt_demo_render_replay_error",
          data: { checkout_id: "polar_chk_missing_price" },
        },
        status: "error",
        error: "Could not find matching local order",
        createdAt: daysAgo(1),
      },
    ]);

    // -----------------------------------------------------------------------
    // Bulk randomized data - wallets, orders, ledger, balances, and
    // subscriptions spread across the last 30 days with a realistic status
    // mix. Layered on top of the curated demo data above, reusing the same
    // projects/products/prices.
    // -----------------------------------------------------------------------
    type BulkPrice = {
      priceId: string;
      productId: string;
      provider: schema.Provider;
      amountCents: number;
      creditsGranted: string;
      creditUnit: string;
      features: string[];
      interval: schema.PriceInterval;
      renewalMode: schema.RenewalMode;
      label: string;
      hasFreeGrant: boolean;
    };
    const bulkCatalog: {
      projectId: string;
      mode: schema.ProjectMode;
      codePrefix: string;
      prices: BulkPrice[];
    }[] = [
      {
        projectId: clipForgeId,
        mode: "credit_codes",
        codePrefix: "CLIP",
        prices: [
          {
            priceId: starterPackId,
            productId: clipMinutesId,
            provider: "stripe",
            amountCents: 1900,
            creditsGranted: "180",
            creditUnit: "minutes",
            features: ["watermark-free"],
            interval: "one_time",
            renewalMode: "add",
            label: "Starter pack",
            hasFreeGrant: true,
          },
          {
            priceId: launchPackId,
            productId: clipMinutesId,
            provider: "stripe",
            amountCents: 5900,
            creditsGranted: "750",
            creditUnit: "minutes",
            features: ["watermark-free", "priority-queue"],
            interval: "one_time",
            renewalMode: "add",
            label: "Launch pack",
            hasFreeGrant: true,
          },
          {
            priceId: creatorMonthlyId,
            productId: clipCreatorId,
            provider: "stripe",
            amountCents: 2900,
            creditsGranted: "400",
            creditUnit: "minutes",
            features: ["priority-queue", "1080p-export"],
            interval: "month",
            renewalMode: "refresh",
            label: "Creator",
            hasFreeGrant: false,
          },
          {
            priceId: studioMonthlyId,
            productId: clipCreatorId,
            provider: "stripe",
            amountCents: 7900,
            creditsGranted: "1400",
            creditUnit: "minutes",
            features: [
              "priority-queue",
              "4k-export",
              "team-workspace",
              "batch-render",
            ],
            interval: "month",
            renewalMode: "refresh",
            label: "Studio",
            hasFreeGrant: false,
          },
        ],
      },
      {
        projectId: renderPilotId,
        mode: "external_auth",
        codePrefix: "RPLT",
        prices: [
          {
            priceId: developerMonthlyId,
            productId: renderCreditsId,
            provider: "polar",
            amountCents: 1500,
            creditsGranted: "500",
            creditUnit: "render credits",
            features: ["commercial-use"],
            interval: "month",
            renewalMode: "add",
            label: "Developer",
            hasFreeGrant: true,
          },
          {
            priceId: scaleMonthlyId,
            productId: renderCreditsId,
            provider: "polar",
            amountCents: 9900,
            creditsGranted: "5000",
            creditUnit: "render credits",
            features: ["commercial-use", "sla", "team-api-keys"],
            interval: "month",
            renewalMode: "add",
            label: "Scale",
            hasFreeGrant: true,
          },
          {
            priceId: priorityUnlockId,
            productId: renderPriorityId,
            provider: "stripe",
            amountCents: 4900,
            creditsGranted: "0",
            creditUnit: "credits",
            features: ["priority-queue"],
            interval: "one_time",
            renewalMode: "refresh",
            label: "Lifetime priority",
            hasFreeGrant: false,
          },
        ],
      },
      {
        projectId: launchNotesId,
        mode: "external_auth",
        codePrefix: "NOTE",
        prices: [
          {
            priceId: startupMonthlyId,
            productId: launchSeatsId,
            provider: "polar",
            amountCents: 3900,
            creditsGranted: "0",
            creditUnit: "seats",
            features: ["feedback-portal", "custom-branding", "team-members"],
            interval: "month",
            renewalMode: "refresh",
            label: "Startup",
            hasFreeGrant: false,
          },
        ],
      },
    ];

    type BulkWallet = {
      id: string;
      catalogIndex: number;
      kind: schema.WalletKind;
      code: string | null;
      providerCustomerId: string;
      createdAt: Date;
    };

    // Avoid colliding with the curated CLIP codes above.
    const usedCodes = new Set<string>([
      "CLIP-8F3K-L9PQ-2MVT",
      "CLIP-4N7Q-V2XT-H8ZD",
      "CLIP-6WQ9-T3MA-J2PE",
    ]);

    const bulkWallets: BulkWallet[] = [];
    const bulkWalletRows: (typeof schema.wallets.$inferInsert)[] = [];

    for (let i = 0; i < BULK_WALLET_COUNT; i++) {
      const catalogIndex = randInt(0, bulkCatalog.length - 1);
      const entry = bulkCatalog[catalogIndex];
      const isCode = entry.mode === "credit_codes";
      const createdAt = randomRecentDate(BULK_WINDOW_DAYS);
      const providerCustomerId = `cus_seed_${i.toString(36)}${Math.floor(
        rand() * 1e6,
      ).toString(36)}`;

      let code: string | null = null;
      if (isCode) {
        do {
          code = randomCode(entry.codePrefix);
        } while (usedCodes.has(code));
        usedCodes.add(code);
      }

      const wallet: BulkWallet = {
        id: createId("wal"),
        catalogIndex,
        kind: isCode ? "code" : "external",
        code,
        providerCustomerId,
        createdAt,
      };
      bulkWallets.push(wallet);
      bulkWalletRows.push({
        id: wallet.id,
        projectId: entry.projectId,
        kind: wallet.kind,
        code,
        externalUserId: isCode
          ? null
          : `user_${i}_${Math.floor(rand() * 1e6).toString(36)}`,
        providerCustomerId,
        createdAt,
        lastSeenAt: randomDateBetween(createdAt),
      });
    }

    const bulkOrderRows: (typeof schema.orders.$inferInsert)[] = [];
    const bulkLedgerRows: (typeof schema.ledgerEntries.$inferInsert)[] = [];
    const bulkSubscriptionRows: (typeof schema.subscriptions.$inferInsert)[] =
      [];
    const balanceMap = new Map<
      string,
      {
        walletId: string;
        productId: string;
        balance: number;
        createdAt: Date;
        hasFreeGrant: boolean;
      }
    >();

    let ledgerSeq = 0;
    const nextLedgerKey = () => `seed_bulk_${ledgerSeq++}`;
    let subSeq = 0;

    function accrue(
      walletId: string,
      price: BulkPrice,
      delta: number,
      when: Date,
    ) {
      const key = `${walletId}:${price.productId}`;
      const existing = balanceMap.get(key);
      if (existing) {
        existing.balance += delta;
        if (when < existing.createdAt) existing.createdAt = when;
      } else {
        balanceMap.set(key, {
          walletId,
          productId: price.productId,
          balance: delta,
          createdAt: when,
          hasFreeGrant: price.hasFreeGrant,
        });
      }
    }

    for (let i = 0; i < BULK_ORDER_COUNT; i++) {
      const wallet = pick(bulkWallets);
      const entry = bulkCatalog[wallet.catalogIndex];
      const price = pick(entry.prices);
      const status = pickOrderStatus();
      const createdAt = randomDateBetween(wallet.createdAt);
      const settled = status === "paid" || status === "refunded";
      const orderId = createId("ord");
      const checkoutPrefix =
        price.provider === "stripe" ? "cs_test_seed" : "polar_chk_seed";

      bulkOrderRows.push({
        id: orderId,
        projectId: entry.projectId,
        priceId: price.priceId,
        walletId: wallet.id,
        provider: price.provider,
        providerCheckoutId: `${checkoutPrefix}_${i.toString(36)}`,
        providerCustomerId: wallet.providerCustomerId,
        status,
        amountCents: price.amountCents,
        currency: "USD",
        productIdSnapshot: price.productId,
        creditUnitSnapshot: price.creditUnit,
        creditsGrantedSnapshot: price.creditsGranted,
        featuresSnapshot: price.features,
        intervalSnapshot: price.interval,
        renewalModeSnapshot: price.renewalMode,
        priceLabelSnapshot: price.label,
        issuedCode: wallet.kind === "code" && settled ? wallet.code : null,
        createdAt,
        paidAt: settled ? createdAt : null,
      });

      const granted = Number(price.creditsGranted);

      if (settled && granted > 0) {
        bulkLedgerRows.push({
          id: createId("led"),
          walletId: wallet.id,
          productId: price.productId,
          delta: String(granted),
          reason: "purchase",
          idempotencyKey: nextLedgerKey(),
          orderId,
          metadata: { note: `${price.label} checkout` },
          createdAt,
        });
        accrue(wallet.id, price, granted, createdAt);

        if (status === "refunded") {
          bulkLedgerRows.push({
            id: createId("led"),
            walletId: wallet.id,
            productId: price.productId,
            delta: String(-granted),
            reason: "refund",
            idempotencyKey: nextLedgerKey(),
            orderId,
            metadata: { note: "Refund issued" },
            createdAt: randomDateBetween(createdAt),
          });
          accrue(wallet.id, price, -granted, createdAt);
        } else {
          // Some usage after a successful purchase.
          let remaining = granted;
          const deductions = randInt(0, 5);
          for (let d = 0; d < deductions; d++) {
            if (remaining <= 1) break;
            const amount = roundCredits(rand() * remaining * 0.5);
            if (amount <= 0) continue;
            const when = randomDateBetween(createdAt);
            bulkLedgerRows.push({
              id: createId("led"),
              walletId: wallet.id,
              productId: price.productId,
              delta: String(-amount),
              reason: "deduction",
              idempotencyKey: nextLedgerKey(),
              orderId: null,
              metadata: { note: pick(USAGE_NOTES) },
              createdAt: when,
            });
            accrue(wallet.id, price, -amount, when);
            remaining -= amount;
          }
        }
      }

      if (status === "paid" && price.interval !== "one_time") {
        const canceled = rand() < 0.25;
        bulkSubscriptionRows.push({
          id: createId("sub"),
          walletId: wallet.id,
          productId: price.productId,
          priceId: price.priceId,
          orderId,
          provider: price.provider,
          providerSubscriptionId: `sub_seed_${price.provider}_${subSeq++}`,
          status: canceled ? "canceled" : "active",
          currentPeriodEnd: canceled
            ? randomDateBetween(createdAt)
            : daysFromNow(randInt(1, 30)),
          createdAt,
          canceledAt: canceled ? randomDateBetween(createdAt) : null,
        });
      }
    }

    const bulkBalanceRows: (typeof schema.creditBalances.$inferInsert)[] = [
      ...balanceMap.values(),
    ].map((b) => ({
      id: createId("bal"),
      walletId: b.walletId,
      productId: b.productId,
      balance: String(roundCredits(Math.max(b.balance, 0))),
      freeGrantResetAt: b.hasFreeGrant ? daysFromNow(randInt(1, 30)) : null,
      createdAt: b.createdAt,
    }));

    // Chunk inserts to stay well under Postgres' bind-parameter limit.
    const CHUNK = 500;
    const insertChunked = async <T>(
      rows: T[],
      insert: (batch: T[]) => Promise<unknown>,
    ) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await insert(rows.slice(i, i + CHUNK));
      }
    };

    await insertChunked(bulkWalletRows, (batch) =>
      tx.insert(schema.wallets).values(batch),
    );
    await insertChunked(bulkOrderRows, (batch) =>
      tx.insert(schema.orders).values(batch),
    );
    await insertChunked(bulkBalanceRows, (batch) =>
      tx.insert(schema.creditBalances).values(batch),
    );
    await insertChunked(bulkLedgerRows, (batch) =>
      tx.insert(schema.ledgerEntries).values(batch),
    );
    await insertChunked(bulkSubscriptionRows, (batch) =>
      tx.insert(schema.subscriptions).values(batch),
    );

    console.log(
      `Bulk data: ${bulkWalletRows.length} wallets, ${bulkOrderRows.length} orders, ` +
        `${bulkLedgerRows.length} ledger entries, ${bulkSubscriptionRows.length} subscriptions`,
    );
  });

  console.log(`Seeded demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} catch (error) {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}

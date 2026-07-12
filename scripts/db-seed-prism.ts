/**
 * Seeds the Prism Studio demo catalog (the `/example` page) into the local
 * database. The single source of truth for the catalog is
 * `src/app/example/SETUP.md`; this script encodes that table exactly.
 *
 * Idempotent: re-running deletes and recreates the `prism-studio` project.
 * Provider attachment + sync stay manual (they need real sandbox credentials).
 *
 * Usage: bun run db:seed:prism -- --email you@example.com [--origin <url> ...]
 */
import { createHash, randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { createId } from "../src/lib/id";

loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed the database with NODE_ENV=production");
  process.exit(1);
}

// Mirrors scripts/db-seed.ts
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// A publishable key stores its plaintext in `publicValue` (public by design),
// so the printed key works directly as NEXT_PUBLIC_EXAMPLE_PAY_KEY.
function publishableKey(projectId: string, name: string) {
  const visible = `pay_pk_prism_${randomBytes(12).toString("hex")}`;
  return {
    id: createId("key"),
    projectId,
    kind: "publishable" as schema.ApiKeyKind,
    name,
    keyHash: sha256(visible),
    prefix: visible.slice(0, 16),
    publicValue: visible,
  };
}

function parseArgs(argv: string[]): { email: string; origins: string[] } {
  let email = "pay@vantezzen.io";
  const origins: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") {
      email = argv[++i] ?? email;
    } else if (arg === "--origin") {
      const value = argv[++i];
      if (value) origins.push(value);
    }
  }
  if (origins.length === 0) origins.push("http://localhost:3000");
  return { email, origins };
}

const { email, origins } = parseArgs(process.argv.slice(2));

const client = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(client, { schema });

try {
  const owners = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email));
  const owner = owners[0];
  if (!owner) {
    console.error(
      `No user ${email} found. Sign up in the dashboard first, then re-run ` +
        `with --email you@example.com.`,
    );
    await client.end();
    process.exit(1);
  }

  const key = await db.transaction(async (tx) => {
    // Idempotent reset: deleting the project cascades to its products, prices,
    // api keys, and any wallets/orders (all reference it with onDelete cascade).
    const existing = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.ownerId, owner.id),
          eq(schema.projects.slug, "prism-studio"),
        ),
      );
    for (const project of existing) {
      await tx
        .delete(schema.projects)
        .where(eq(schema.projects.id, project.id));
      console.log(
        `Deleted existing prism-studio project (${project.id}) and its catalog.`,
      );
    }

    const projectId = createId("proj");
    const imagesId = createId("prod");
    const proId = createId("prod");
    const licenseId = createId("prod");

    await tx.insert(schema.projects).values({
      id: projectId,
      ownerId: owner.id,
      slug: "prism-studio",
      name: "Prism Studio",
      mode: "credit_codes",
      allowedOrigins: origins,
      codePrefix: "PRSM",
    });

    await tx.insert(schema.products).values([
      {
        id: imagesId,
        projectId,
        name: "Images",
        description: "Credits for generating AI gradient art.",
        type: "credits",
        creditUnit: "images",
        freeGrant: { credits: 10, period: "monthly" },
        renewalMode: "add",
      },
      {
        id: proId,
        projectId,
        name: "Prism Pro",
        description: "Premium styles and watermark-free renders.",
        type: "subscription",
        creditUnit: "credits",
        freeGrant: null,
        renewalMode: "refresh",
      },
      {
        id: licenseId,
        projectId,
        name: "Commercial license",
        description: "One-time unlock for using renders in client work.",
        type: "one_time",
        creditUnit: "credits",
        freeGrant: null,
        renewalMode: "refresh",
      },
    ]);

    await tx.insert(schema.prices).values([
      // Images — three one-time credit packs (USD).
      {
        id: createId("price"),
        productId: imagesId,
        label: "Starter",
        amountCents: 400,
        currency: "USD",
        creditsGranted: "100",
        features: [],
        interval: "one_time",
      },
      {
        id: createId("price"),
        productId: imagesId,
        label: "Studio",
        amountCents: 900,
        currency: "USD",
        creditsGranted: "300",
        features: [],
        interval: "one_time",
      },
      {
        id: createId("price"),
        productId: imagesId,
        label: "Max",
        amountCents: 1900,
        currency: "USD",
        creditsGranted: "1000",
        features: [],
        interval: "one_time",
      },
      // Prism Pro — subscription tiers, "pro" feature on every tier.
      {
        id: createId("price"),
        productId: proId,
        label: "Pro Monthly",
        amountCents: 700,
        currency: "USD",
        creditsGranted: "0",
        features: ["pro"],
        interval: "month",
      },
      {
        id: createId("price"),
        productId: proId,
        label: "Pro Yearly",
        amountCents: 5900,
        currency: "USD",
        creditsGranted: "0",
        features: ["pro"],
        interval: "year",
      },
      // Commercial license — one-time unlock.
      {
        id: createId("price"),
        productId: licenseId,
        label: "Lifetime license",
        amountCents: 1900,
        currency: "USD",
        creditsGranted: "0",
        features: ["commercial-license"],
        interval: "one_time",
      },
    ]);

    const apiKey = publishableKey(projectId, "example-page");
    await tx.insert(schema.apiKeys).values(apiKey);
    return apiKey;
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  console.log(`
Prism Studio catalog created for ${email}.

Add to .env:
  NEXT_PUBLIC_EXAMPLE_PAY_URL=${appUrl}
  NEXT_PUBLIC_EXAMPLE_PAY_KEY=${key.publicValue}

Remaining manual steps (need your sandbox Stripe/Polar account):
  1. Dashboard -> Prism Studio -> attach your sandbox provider to each product
  2. Press "Sync now" on each product
  3. Local webhooks: see the stripe listen command on the Providers page`);

  await client.end();
} catch (error) {
  console.error(error);
  await client.end();
  process.exit(1);
}

import "server-only";
import { db } from "@/db";
import { type SubscriptionStatus, type Wallet } from "@/db/schema";
import { assertCreditDelta } from "@/lib/amounts";

// Credits are numeric(20,6). Postgres holds the source of truth AND does the
// arithmetic (`balance = balance ± delta` in SQL); JS only compares/formats,
// rounding to the column scale so stored strings never carry float noise.
const SCALE = 6;
export function toNum(v: string | number): number {
  return typeof v === "number" ? v : parseFloat(v);
}
export function fmt(n: number): string {
  assertCreditDelta(n);
  return n.toFixed(SCALE);
}

/** True for a Postgres unique-constraint violation (optionally a specific one). */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  for (const c of [e, (e as { cause?: unknown } | null)?.cause]) {
    if (!c || typeof c !== "object") continue;
    if ((c as { code?: unknown }).code !== "23505") continue;
    if (!constraint) return true;
    const name = (c as { constraint_name?: unknown }).constraint_name;
    if (String(name ?? "").includes(constraint)) return true;
    if (c instanceof Error && c.message.includes(constraint)) return true;
  }
  return false;
}

export type BalanceView = {
  productId: string;
  productName: string;
  creditUnit: string;
  balance: number;
  freeGrantResetAt: Date | null;
};

export type SubscriptionView = {
  id: string;
  productId: string;
  priceId: string | null;
  label: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
};

/** A wallet's derived access: feature slugs it holds + its active subscriptions. */
export type WalletAccess = {
  features: string[];
  subscriptions: SubscriptionView[];
};

export type WalletWithBalances = {
  wallet: Wallet;
  balances: BalanceView[];
  features: string[];
  subscriptions: SubscriptionView[];
};

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

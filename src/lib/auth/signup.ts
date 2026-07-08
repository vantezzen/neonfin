import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Whether new developer signups are allowed: the env flag, OR an empty user
 * table (so a fresh self-hosted instance can always create its first account).
 */
export async function signupsOpen(): Promise<boolean> {
  if (env().PAY_ALLOW_SIGNUPS) return true;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user);
  return count === 0;
}

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";

/**
 * Postgres-backed token buckets for public API abuse controls.
 * State is shared across app instances, and each bucket update is row-locked so
 * concurrent requests for the same key spend from the same balance.
 */

export type RateLimitOptions = {
  /** Max burst - tokens available when full. */
  capacity: number;
  /** Sustained rate - tokens added per second. */
  refillPerSec: number;
};

export type RateLimitResult =
  { ok: true } | { ok: false; retryAfterSec: number };

/** Default limit applied to publishable-key requests. */
export const PUBLISHABLE_LIMIT: RateLimitOptions = {
  capacity: 30,
  refillPerSec: 5,
};

/** Brute-force dampening for invalid recovery-code guesses. */
export const INVALID_CODE_LIMIT: RateLimitOptions = {
  capacity: 20,
  refillPerSec: 20 / 3600,
};

function fmt(n: number): string {
  return n.toFixed(6);
}

/**
 * Take one token from `key`'s bucket. Returns `{ ok: false, retryAfterSec }`
 * when the bucket is empty.
 */
export async function consumeToken(
  key: string,
  opts: RateLimitOptions,
  now = new Date(),
): Promise<RateLimitResult> {
  return db.transaction(async (tx) => {
    let [bucket] = await tx
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, key))
      .for("update");

    if (!bucket) {
      const inserted = await tx
        .insert(rateLimitBuckets)
        .values({
          key,
          tokens: fmt(Math.max(0, opts.capacity - 1)),
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ key: rateLimitBuckets.key });
      if (inserted.length > 0) return { ok: true };

      [bucket] = await tx
        .select()
        .from(rateLimitBuckets)
        .where(eq(rateLimitBuckets.key, key))
        .for("update");
      if (!bucket) throw new Error("Could not create rate limit bucket");
    }

    const elapsedSec = Math.max(
      0,
      (now.getTime() - bucket.updatedAt.getTime()) / 1000,
    );
    const tokens = Math.min(
      opts.capacity,
      parseFloat(bucket.tokens) + elapsedSec * opts.refillPerSec,
    );

    if (tokens < 1) {
      await tx
        .update(rateLimitBuckets)
        .set({ tokens: fmt(tokens), updatedAt: now })
        .where(eq(rateLimitBuckets.key, key));
      return {
        ok: false,
        retryAfterSec: Math.max(
          1,
          Math.ceil((1 - tokens) / opts.refillPerSec),
        ),
      };
    }

    await tx
      .update(rateLimitBuckets)
      .set({ tokens: fmt(tokens - 1), updatedAt: now })
      .where(eq(rateLimitBuckets.key, key));
    return { ok: true };
  });
}

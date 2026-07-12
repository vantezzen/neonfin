import "server-only";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries, products } from "@/db/schema";
import { toNum } from "@/lib/credits";
import { type Cursor, encodeCursor } from "@/lib/api/cursor";

/** List a wallet's immutable balance changes with stable cursor pagination. */
export async function listWalletLedger(
  walletId: string,
  cursor: Cursor | null,
  limit: number,
) {
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const rows = await db
    .select({
      id: ledgerEntries.id,
      productId: ledgerEntries.productId,
      productName: products.name,
      creditUnit: products.creditUnit,
      delta: ledgerEntries.delta,
      reason: ledgerEntries.reason,
      orderId: ledgerEntries.orderId,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .innerJoin(products, eq(products.id, ledgerEntries.productId))
    .where(
      cursor && cursorDate
        ? and(
            eq(ledgerEntries.walletId, walletId),
            or(
              lt(ledgerEntries.createdAt, cursorDate),
              and(
                eq(ledgerEntries.createdAt, cursorDate),
                lt(ledgerEntries.id, cursor.id),
              ),
            ),
          )
        : eq(ledgerEntries.walletId, walletId),
    )
    .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit);
  const last = entries.at(-1);

  return {
    entries: entries.map((entry) => ({
      ...entry,
      delta: toNum(entry.delta),
      createdAt: entry.createdAt.toISOString(),
    })),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

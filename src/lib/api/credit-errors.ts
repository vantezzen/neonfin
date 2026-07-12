import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, type Wallet } from "@/db/schema";
import { apiError, invalidCodeAttempt, rateLimitHeaders } from "@/lib/api/http";
import { PROVIDER_ERROR_MESSAGE } from "@/lib/api/provider-errors";
import { INVALID_CODE_LIMIT } from "@/lib/api/rate-limit";
import {
  soleProductId,
  InsufficientCreditsError,
  ProductNotFoundError,
  WalletExpiredError,
} from "@/lib/credits";
import {
  getProviderAccountMeta,
  getProviderPortalUrl,
} from "@/lib/provider-service/client";
import type { Project } from "@/db/schema";

/**
 * Map well-known credits-domain errors to HTTP responses.
 * Returns null when `e` is not a recognized error (caller should rethrow).
 * Does NOT handle WalletNotFoundError - code routes must rate-limit first.
 */
export function creditErrorResponse(
  e: unknown,
  cors: Record<string, string>,
): Response | null {
  if (e instanceof InsufficientCreditsError) {
    return apiError(402, "insufficient_credits", "Insufficient credits", cors, {
      balance: e.balance,
      requested: e.requested,
    });
  }
  if (e instanceof WalletExpiredError) {
    return apiError(410, "wallet_expired", "Wallet expired", cors);
  }
  if (e instanceof ProductNotFoundError) {
    return apiError(400, "unknown_product", "Unknown product", cors);
  }
  return null;
}

/**
 * Default to the sole product when the caller omits `productId`.
 * Returns a string on success, or a ready-to-return Response on failure.
 */
export async function requireProductId(
  project: Project,
  requested: string | undefined,
  cors: Record<string, string>,
): Promise<string | Response> {
  const productId = requested ?? (await soleProductId(project.id));
  if (!productId) {
    return apiError(
      400,
      "product_required",
      "productId is required (project has multiple products)",
      cors,
    );
  }
  return productId;
}

/**
 * Record an invalid-code attempt and return the appropriate rate-limit or
 * not-found response. Used by code-wallet routes when a wallet lookup fails.
 */
export async function walletNotFoundResponse(
  projectId: string,
  req: Request,
  cors: Record<string, string>,
): Promise<Response> {
  const limit = await invalidCodeAttempt(projectId, req);
  if (!limit.ok) {
    return apiError(
      429,
      "rate_limited",
      "Too many invalid recovery codes",
      rateLimitHeaders(cors, INVALID_CODE_LIMIT, limit),
    );
  }
  return apiError(404, "wallet_not_found", "Wallet not found", cors);
}

/**
 * Resolve the provider customer-portal URL for a wallet that already has a
 * `providerCustomerId`. Finds the provider account via the wallet's most recent
 * order, then asks the provider service for a portal link. Returns a
 * ready-to-return error Response on any failure, or `{ url }` on success.
 */
export async function portalUrlForWallet(
  wallet: Wallet,
  returnUrl: string,
  cors: Record<string, string>,
): Promise<Response | { url: string }> {
  // The customer lives on whichever provider account fulfilled a purchase for
  // this wallet - find it via the wallet's most recent order's product.
  const order = await db.query.orders.findFirst({
    where: eq(orders.walletId, wallet.id),
    orderBy: desc(orders.createdAt),
    with: {
      price: { with: { product: { columns: { providerAccountId: true } } } },
    },
  });
  const providerAccountId = order?.price?.product.providerAccountId;
  if (!providerAccountId) {
    return apiError(
      400,
      "no_billing_customer",
      "No provider account for this wallet",
      cors,
    );
  }
  const account = await getProviderAccountMeta(providerAccountId);
  if (!account) {
    return apiError(
      400,
      "provider_account_missing",
      "Provider account missing",
      cors,
    );
  }
  try {
    const url = await getProviderPortalUrl(
      account.id,
      wallet.providerCustomerId!,
      returnUrl,
    );
    return { url };
  } catch {
    return apiError(502, "provider_error", PROVIDER_ERROR_MESSAGE, cors);
  }
}

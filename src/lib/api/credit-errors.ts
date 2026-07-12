import "server-only";
import {
  apiError,
  invalidCodeAttempt,
  rateLimitHeaders,
} from "@/lib/api/http";
import { INVALID_CODE_LIMIT } from "@/lib/api/rate-limit";
import {
  soleProductId,
  InsufficientCreditsError,
  ProductNotFoundError,
  WalletExpiredError,
} from "@/lib/credits";
import type { Project } from "@/db/schema";

/**
 * Map well-known credits-domain errors to HTTP responses.
 * Returns null when `e` is not a recognized error (caller should rethrow).
 * Does NOT handle WalletNotFoundError — code routes must rate-limit first.
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

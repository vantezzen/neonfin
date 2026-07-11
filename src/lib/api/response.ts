import type { RateLimitOptions, RateLimitResult } from "@/lib/api/rate-limit";

/** Build a machine-readable API error with a supportable request identifier. */
export function apiErrorResponse(
  status: number,
  code: string,
  message: string,
  cors?: Record<string, string>,
  extra?: Record<string, unknown>,
): Response {
  const requestId = crypto.randomUUID();
  return Response.json(
    { error: message, code, requestId, ...extra },
    {
      status,
      headers: {
        ...cors,
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    },
  );
}

/** Standard rate-limit headers, including the retry interval for 429 responses. */
export function rateLimitHeaders(
  cors: Record<string, string>,
  limit: RateLimitOptions,
  result: Extract<RateLimitResult, { ok: false }>,
): Record<string, string> {
  return {
    ...cors,
    "Retry-After": String(result.retryAfterSec),
    "RateLimit-Limit": String(limit.capacity),
    "RateLimit-Remaining": "0",
    "RateLimit-Reset": String(result.retryAfterSec),
  };
}

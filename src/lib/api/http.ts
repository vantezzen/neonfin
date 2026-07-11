import "server-only";
import { eq } from "drizzle-orm";
import type { ZodError } from "zod";
import { db } from "@/db";
import { projects, type ApiKeyKind, type Project } from "@/db/schema";
import { resolveApiKey } from "@/lib/api-keys";
import {
  consumeToken,
  INVALID_CODE_LIMIT,
  PUBLISHABLE_LIMIT,
  type RateLimitResult,
  type RateLimitOptions,
} from "@/lib/api/rate-limit";
import { apiErrorResponse, rateLimitHeaders } from "@/lib/api/response";

export { rateLimitHeaders } from "@/lib/api/response";

export type ApiContext = {
  project: Project;
  keyKind: ApiKeyKind;
  origin: string | null;
};

const ALLOW_METHODS = "GET,POST,OPTIONS";
const ALLOW_HEADERS = "Authorization,Content-Type";
const EXPOSE_HEADERS =
  "Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, X-Request-Id";

/**
 * Per-project CORS. If the project has an allowlist, the request Origin must be
 * on it; with no allowlist we reflect the origin (permissive default for early
 * integration). Secret-key (server) calls don't send an Origin and are exempt.
 */
export function corsHeaders(
  project: Project,
  origin: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Expose-Headers": EXPOSE_HEADERS,
    Vary: "Origin",
  };
  if (!origin) return headers;
  const allowed =
    project.allowedOrigins.length === 0 ||
    project.allowedOrigins.includes(origin);
  if (allowed) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

/** CORS headers for errors raised before an API key can identify a project. */
function unauthenticatedCorsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Expose-Headers": EXPOSE_HEADERS,
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    Vary: "Origin",
  };
}

/**
 * Browser callers must be able to read authentication errors, including an
 * origin that the project has not allowlisted. These responses contain no
 * project data, so reflecting the origin here does not grant API access.
 */
function authenticationErrorCorsHeaders(
  project: Project,
  origin: string | null,
): Record<string, string> {
  const headers = corsHeaders(project, origin);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function isOriginAllowed(project: Project, origin: string | null): boolean {
  if (!origin) return true; // non-browser / server call
  return (
    project.allowedOrigins.length === 0 ||
    project.allowedOrigins.includes(origin)
  );
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

/**
 * Best-effort client IP. `x-forwarded-for` is only trustworthy behind a proxy
 * that overwrites it (Vercel, Cloudflare, a well-configured nginx). Directly
 * exposed instances should sit behind one - see the self-hosting docs.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwarded ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Stable machine-readable error codes for the public API. Clients should
 * branch on `code` (or the HTTP status), never on the human-readable message.
 */
export type ApiErrorCode =
  | "invalid_body"
  | "missing_bearer_token"
  | "invalid_api_key"
  | "wrong_key_kind"
  | "origin_not_allowed"
  | "redirect_origin_not_allowed"
  | "rate_limited"
  | "secret_key_from_browser"
  | "mode_mismatch"
  | "wallet_not_found"
  | "wallet_expired"
  | "already_subscribed"
  | "insufficient_credits"
  | "product_required"
  | "unknown_product"
  | "price_not_found"
  | "price_inactive"
  | "price_not_synced"
  | "order_not_found"
  | "no_billing_customer"
  | "provider_account_missing"
  | "provider_error"
  | "checkout_in_progress";

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  cors?: Record<string, string>,
  extra?: Record<string, unknown>,
): Response {
  return apiErrorResponse(status, code, message, cors, extra);
}

/** A consistent, field-level response for request validation failures. */
export function invalidBodyError(
  error: ZodError,
  cors?: Record<string, string>,
): Response {
  return apiError(
    400,
    "invalid_body",
    error.issues[0]?.message ?? "Invalid body",
    cors,
    {
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  );
}

/**
 * Resolve the bearer key → project context, enforcing key-kind and CORS.
 * Returns either an `ApiContext` or a ready-to-return error `Response`.
 */
export async function authenticate(
  req: Request,
  opts: {
    require?: ApiKeyKind;
    /** Override / disable rate limiting for publishable keys. */
    rateLimit?: RateLimitOptions | false;
  } = {},
): Promise<ApiContext | { error: Response }> {
  const origin = req.headers.get("origin");
  const token = bearer(req);
  if (!token) {
    return {
      error: apiError(401, "missing_bearer_token", "Missing bearer token", unauthenticatedCorsHeaders(origin)),
    };
  }
  const resolved = await resolveApiKey(token);
  if (!resolved) {
    return {
      error: apiError(401, "invalid_api_key", "Invalid or revoked API key", unauthenticatedCorsHeaders(origin)),
    };
  }
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, resolved.projectId),
  });
  if (!project) {
    return {
      error: apiError(
        401,
        "invalid_api_key",
        "Project not found",
        unauthenticatedCorsHeaders(origin),
      ),
    };
  }
  const authCors = authenticationErrorCorsHeaders(project, origin);
  if (opts.require && resolved.kind !== opts.require) {
    return {
      error: apiError(
        403,
        "wrong_key_kind",
        `This endpoint requires a ${opts.require} key`,
        authCors,
      ),
    };
  }

  // Secret keys are server credentials. If a request has a browser Origin, treat
  // the key as leaked/misused and reject before any mutation can run.
  if (resolved.kind === "secret" && origin) {
    return {
      error: apiError(
        403,
        "secret_key_from_browser",
        "Secret keys must only be used server-side",
        authCors,
      ),
    };
  }

  // Publishable keys are browser-facing → enforce the CORS allowlist + a
  // rate limit. The bucket is per (key, client IP) so one abusive client
  // can't exhaust the whole project's budget for everyone else.
  // Secret keys are server-side and trusted (unlimited).
  if (resolved.kind === "publishable") {
    if (!isOriginAllowed(project, origin)) {
      return {
        error: apiError(
          403,
          "origin_not_allowed",
          "Origin not allowed",
          authCors,
        ),
      };
    }
    if (opts.rateLimit !== false) {
      const limit = opts.rateLimit ?? PUBLISHABLE_LIMIT;
      const rl = await consumeToken(`pk:${resolved.id}:${clientIp(req)}`, limit);
      if (!rl.ok) {
        const cors = corsHeaders(project, origin);
        return {
          error: apiError(
            429,
            "rate_limited",
            "Rate limit exceeded",
            rateLimitHeaders(cors, limit, rl),
          ),
        };
      }
    }
  }
  return { project, keyKind: resolved.kind, origin };
}

export async function invalidCodeAttempt(
  projectId: string,
  req: Request,
): Promise<RateLimitResult> {
  return consumeToken(`invalid-code:${projectId}:${clientIp(req)}`, INVALID_CODE_LIMIT);
}

/** Standard CORS preflight response for a project-scoped endpoint. */
export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": ALLOW_METHODS,
      "Access-Control-Allow-Headers": ALLOW_HEADERS,
      "Access-Control-Expose-Headers": EXPOSE_HEADERS,
      "Access-Control-Max-Age": "86400",
    },
  });
}

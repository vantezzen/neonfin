import { expect, test } from "bun:test";
import {
  apiErrorResponse,
  rateLimitHeaders,
} from "@/lib/api/response";

test("API errors include a request id clients can report", async () => {
  const response = apiErrorResponse(502, "provider_error", "Provider error");
  const body = (await response.json()) as { requestId: string };

  expect(response.headers.get("X-Request-Id")).toBe(body.requestId);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(/^[\da-f-]{36}$/i.test(body.requestId)).toBe(true);
});

test("rate-limit responses expose retry metadata", () => {
  const headers = rateLimitHeaders(
    { "Access-Control-Allow-Origin": "https://app.example.com" },
    { capacity: 20, refillPerSec: 1 },
    { ok: false, retryAfterSec: 3 },
  );

  expect(headers["Retry-After"]).toBe("3");
  expect(headers["RateLimit-Limit"]).toBe("20");
  expect(headers["RateLimit-Remaining"]).toBe("0");
  expect(headers["RateLimit-Reset"]).toBe("3");
});

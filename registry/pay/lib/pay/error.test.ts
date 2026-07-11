import { expect, test } from "bun:test";
import { PayError } from "./error";

test("PayError retains API request ids for support", () => {
  const error = new PayError(502, "Provider error", {
    code: "provider_error",
    requestId: "req_123",
  });

  expect(error.requestId).toBe("req_123");
});

import { expect, test } from "bun:test";
import { providerErrorMessage } from "./provider-errors";

test("providerErrorMessage returns a stable generic message", () => {
  expect(providerErrorMessage()).toBe("Payment provider request failed");
});

test("providerErrorMessage does not expose upstream error text", () => {
  const upstreamMessage = "Stripe secret failure";
  const message = providerErrorMessage();

  expect(message).not.toContain(upstreamMessage);
  expect(message).not.toContain("Provider error:");
});

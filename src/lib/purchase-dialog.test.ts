import { expect, test } from "bun:test";
import type { Price, Product } from "../../registry/pay/lib/pay";
import { unitPriceHint } from "../../registry/pay/components/pay/purchase-dialog";

const product = { creditUnit: "minutes" } as Product;

function price(amountCents: number, creditsGranted: number): Price {
  return { amountCents, creditsGranted, currency: "USD" } as Price;
}

test("unit price hint chooses a readable denominator", () => {
  expect(unitPriceHint(price(500, 600), product)).toBe(
    "≈ $0.83 per 100 minutes",
  );
  expect(unitPriceHint(price(100, 10), product)).toBe("≈ $0.10 per minute");
});

test("unit price hint omits free and non-credit prices", () => {
  expect(unitPriceHint(price(0, 10), product)).toBe(null);
  expect(unitPriceHint(price(100, 0), product)).toBe(null);
});

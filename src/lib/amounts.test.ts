import { expect, test } from "bun:test";
import {
  MAX_CREDIT_AMOUNT,
  MAX_PRICE_AMOUNT,
  positiveCreditAmountSchema,
  signedCreditAmountSchema,
  priceAmountSchema,
} from "./amounts";

test("positive credit amounts allow whole and six-decimal values", () => {
  expect(positiveCreditAmountSchema.safeParse(1).success).toBe(true);
  expect(positiveCreditAmountSchema.safeParse(0.000001).success).toBe(true);
});

test("positive credit amounts reject invalid domain values", () => {
  expect(positiveCreditAmountSchema.safeParse(0).success).toBe(false);
  expect(positiveCreditAmountSchema.safeParse(Infinity).success).toBe(false);
  expect(positiveCreditAmountSchema.safeParse(MAX_CREDIT_AMOUNT + 1).success).toBe(false);
  expect(positiveCreditAmountSchema.safeParse(1.0000001).success).toBe(false);
});

test("signed credit adjustments allow debits but positive grants do not", () => {
  expect(signedCreditAmountSchema.safeParse(-1).success).toBe(true);
  expect(positiveCreditAmountSchema.safeParse(-1).success).toBe(false);
});

test("price amounts are capped and limited to cents", () => {
  expect(priceAmountSchema.safeParse(MAX_PRICE_AMOUNT).success).toBe(true);
  expect(priceAmountSchema.safeParse(MAX_PRICE_AMOUNT + 0.01).success).toBe(false);
  expect(priceAmountSchema.safeParse(10.001).success).toBe(false);
});

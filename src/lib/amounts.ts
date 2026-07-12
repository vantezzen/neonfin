import { z } from "zod";

export const CREDIT_SCALE = 6;
export const MAX_CREDIT_AMOUNT = 1_000_000_000;
export const MAX_PRICE_AMOUNT_CENTS = 99_999_999;
export const MAX_PRICE_AMOUNT = MAX_PRICE_AMOUNT_CENTS / 100;

function decimalPlaces(n: number): number {
  const text = n.toString().toLowerCase();
  const [mantissa, exponent = "0"] = text.split("e");
  const decimals = mantissa.split(".")[1]?.length ?? 0;
  return Math.max(0, decimals - Number(exponent));
}

function hasScale(n: number, scale: number): boolean {
  return decimalPlaces(n) <= scale;
}

function creditAmount<T extends z.ZodType<number>>(
  schema: T,
  opts: { mode: "positive" | "nonNegative" | "signed" | "full" },
) {
  return schema
    .refine(Number.isFinite, "Amount must be finite")
    .refine(
      (n) => {
        if (opts.mode === "full") return true;
        if (opts.mode === "signed") return n !== 0;
        if (opts.mode === "positive") return n > 0;
        return n >= 0;
      },
      opts.mode === "signed"
        ? "Amount can't be zero"
        : opts.mode === "positive"
          ? "Amount must be positive"
          : "Amount must be non-negative",
    )
    .refine(
      (n) => Math.abs(n) <= MAX_CREDIT_AMOUNT,
      `Amount must be at most ${MAX_CREDIT_AMOUNT}`,
    )
    .refine(
      (n) => hasScale(n, CREDIT_SCALE),
      `Amount can have at most ${CREDIT_SCALE} decimal places`,
    );
}

function priceAmount<T extends z.ZodType<number>>(schema: T) {
  return schema
    .refine(Number.isFinite, "Amount must be finite")
    .refine((n) => n >= 0, "Amount must be non-negative")
    .refine(
      (n) => n <= MAX_PRICE_AMOUNT,
      `Amount must be at most ${MAX_PRICE_AMOUNT}`,
    )
    .refine((n) => hasScale(n, 2), "Amount can have at most 2 decimal places");
}

export const positiveCreditAmountSchema = creditAmount(z.number(), {
  mode: "positive",
});
export const signedCreditAmountSchema = creditAmount(z.number(), {
  mode: "signed",
});
export const fullCreditAmountSchema = creditAmount(z.number(), {
  mode: "full",
});

export const coercePositiveCreditAmountSchema = creditAmount(
  z.coerce.number(),
  {
    mode: "positive",
  },
);
export const coerceNonNegativeCreditAmountSchema = creditAmount(
  z.coerce.number(),
  { mode: "nonNegative" },
);
export const coerceSignedCreditAmountSchema = creditAmount(z.coerce.number(), {
  mode: "signed",
});
export const priceAmountSchema = priceAmount(z.coerce.number());

export function assertCreditDelta(n: number): void {
  fullCreditAmountSchema.parse(n);
}

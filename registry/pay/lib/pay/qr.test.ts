import { expect, test } from "bun:test";
import { createWalletTransferUrl, readWalletCode } from "@/lib/pay/qr";

test("wallet transfer URLs keep recovery codes out of query strings", () => {
  const url = createWalletTransferUrl(
    "https://app.example.com/work?view=recent",
    "SKIP-8F3K-L9PQ-2MVT",
  );

  expect(url).toBe(
    "https://app.example.com/work?view=recent#__pay_wallet=SKIP-8F3K-L9PQ-2MVT",
  );
  expect(readWalletCode(url)).toBe("SKIP-8F3K-L9PQ-2MVT");
});

test("wallet transfer reader accepts legacy query links", () => {
  expect(
    readWalletCode(
      "https://app.example.com/work?__pay_wallet=SKIP-8F3K-L9PQ-2MVT",
    ),
  ).toBe("SKIP-8F3K-L9PQ-2MVT");
});

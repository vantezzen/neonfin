import { expect, test } from "bun:test";
import { formatLargeNumber } from "./format";

test("formatLargeNumber appends a unit only when provided", () => {
  expect(formatLargeNumber(1234)).toBe("1,234");
  expect(formatLargeNumber(1234, "credits")).toBe("1,234 credits");
  expect(formatLargeNumber("12.3456", "images")).toBe("12.35 images");
  expect(formatLargeNumber(-5, "minutes")).toBe("-5 minutes");
});

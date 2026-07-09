import { expect, test } from "bun:test";
import { BILLING_PLANS, exceedsLimit, isUnlimited } from "./plans";

test("self-host/all-access limits are unlimited", () => {
  const limits = Object.values(BILLING_PLANS.all_access.limits);

  expect(limits.every(isUnlimited)).toBe(true);
});

test("hosted free tier stays usable for a real side project", () => {
  expect(BILLING_PLANS.free.limits.projects).toBe(10);
  expect(BILLING_PLANS.free.limits.providerAccounts).toBe(null);
  expect((BILLING_PLANS.free.limits.paidOrdersPerMonth ?? 0) > 50).toBe(true);
  expect(BILLING_PLANS.free.limits.apiRequestsPerMonth).toBe(null);
});

test("paid tiers never cap projects or provider accounts", () => {
  expect(BILLING_PLANS.indie.limits.projects).toBe(null);
  expect(BILLING_PLANS.indie.limits.providerAccounts).toBe(null);
  expect(BILLING_PLANS.studio.limits.projects).toBe(null);
  expect(BILLING_PLANS.studio.limits.providerAccounts).toBe(null);
});

test("limit checks are inclusive at the cap", () => {
  expect(exceedsLimit(99, 100)).toBe(false);
  expect(exceedsLimit(100, 100)).toBe(true);
  expect(exceedsLimit(10_000, null)).toBe(false);
});

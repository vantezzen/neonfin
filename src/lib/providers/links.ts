/**
 * Deep links back to the underlying provider's own dashboard.
 *
 * Pure and client-safe (no secrets, no `server-only`): neonFin is the middle
 * man, so anywhere we show a provider-owned object we also offer a jump to the
 * real source of truth. Returns `null` when a reliable link can't be built, so
 * callers simply omit the link rather than sending the user somewhere useless.
 */

type Provider = "stripe" | "polar";

function stripeBase(environment: string): string {
  // Stripe test mode lives under a `/test` path segment.
  return environment === "sandbox"
    ? "https://dashboard.stripe.com/test"
    : "https://dashboard.stripe.com";
}

function polarBase(environment: string): string {
  return environment === "sandbox"
    ? "https://sandbox.polar.sh/dashboard"
    : "https://polar.sh/dashboard";
}

/** The provider's dashboard home for an account (always available). */
export function providerDashboardUrl(
  provider: Provider,
  environment: string,
): string {
  return provider === "stripe"
    ? stripeBase(environment)
    : polarBase(environment);
}

/**
 * A product's page at the provider. Stripe prices don't have their own page -
 * they're shown under the product - so a price also links here.
 *
 * Polar object-level deep links need the organization slug, which we don't
 * store yet, so Polar returns `null` for now.
 */
export function providerProductUrl(
  provider: Provider,
  environment: string,
  providerProductId: string | null | undefined,
): string | null {
  if (!providerProductId) return null;
  if (provider === "stripe") {
    return `${stripeBase(environment)}/products/${providerProductId}`;
  }
  return null;
}

/** An order/checkout's page at the provider. */
export function providerOrderUrl(
  provider: Provider,
  environment: string,
  providerCheckoutId: string | null | undefined,
): string | null {
  if (provider === "stripe" && providerCheckoutId) {
    return `${stripeBase(environment)}/checkout/sessions/${providerCheckoutId}`;
  }
  return null;
}

/** A customer's page at the provider. */
export function providerCustomerUrl(
  provider: Provider,
  environment: string,
  providerCustomerId: string | null | undefined,
): string | null {
  if (provider === "stripe" && providerCustomerId) {
    return `${stripeBase(environment)}/customers/${providerCustomerId}`;
  }
  return null;
}

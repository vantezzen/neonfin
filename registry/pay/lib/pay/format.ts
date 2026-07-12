/**
 * Display-formatting helpers for credits and money.
 * Zero-dependency, browser-safe.
 */

/** Format a credit amount for display (trims float noise, locale-aware grouping). */
export function formatCredits(n: number): string {
  const value = Number.isInteger(n) ? n : Number(n.toFixed(6));
  return new Intl.NumberFormat().format(value);
}

/** Format integer minor units as localized currency, with a plain fallback. */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

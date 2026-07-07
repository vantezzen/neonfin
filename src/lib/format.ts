export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

const INTERVAL_LABEL: Record<string, string> = {
  one_time: "one-time",
  month: "/mo",
  year: "/yr",
};

export function formatInterval(interval: string): string {
  return INTERVAL_LABEL[interval] ?? interval;
}

/** Compact, locale-stable timestamp for tables: "Jul 6, 2026, 14:32". */
export function formatDateTime(value: Date | string | number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

/** Date-only variant: "Jul 6, 2026". */
export function formatDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatLargeNumber(
  value: string | number,
  unit: string = "credits",
): string {
  const n = typeof value === "number" ? value : parseFloat(value);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + ` ${unit}`;
}

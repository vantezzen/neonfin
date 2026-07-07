// Feature keys are developer-chosen slugs (e.g. "analytics", "export") that a
// price unlocks. Pure helpers - safe to import anywhere (no server deps).

/** A valid feature key: lowercase, starts alphanumeric, then letters/digits/-/_. */
export const FEATURE_KEY_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** Lowercase + trim a single key (does not validate). */
export function normalizeFeatureKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Parse a comma/space-separated list of feature keys into normalized, deduped,
 * valid slugs. Invalid fragments are dropped.
 */
export function parseFeatureKeys(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    const key = normalizeFeatureKey(part);
    if (key && FEATURE_KEY_RE.test(key)) out.add(key);
  }
  return [...out];
}

/** Humanize a key for display: "full_access" -> "Full access". */
export function humanizeFeatureKey(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

import { randomBytes } from "node:crypto";

// Unambiguous Crockford-ish base32 alphabet (no I, L, O, U, 0, 1).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Cryptographically-random string over the unambiguous alphabet. */
export function randomToken(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Prefixed entity id, e.g. `proj_7F3K...`. */
export function createId(prefix: string): string {
  return `${prefix}_${randomToken(24)}`;
}

function cleanCodePart(input: string): string {
  return input
    .toUpperCase()
    .split("")
    .filter((c) => ALPHABET.includes(c))
    .join("");
}

function grouped(chars: string): string {
  return chars.match(/.{1,4}/g)?.join("-") ?? "";
}

/**
 * Human-friendly credit code: `PREFIX-XXXX-XXXX-XXXX`.
 * Prefix is uppercased and stripped to the safe alphabet.
 */
export function createCreditCode(prefix: string): string {
  const clean = cleanCodePart(prefix).slice(0, 8) || "NF";
  return `${clean}-${randomToken(4)}-${randomToken(4)}-${randomToken(4)}`;
}

/**
 * Accept pasted or manually typed recovery codes with or without separators.
 * When the project prefix is known, unseparated input can be split back into
 * the stored `PREFIX-XXXX-...` shape.
 */
export function normalizeCreditCode(input: string, prefix?: string): string {
  const trimmed = input.trim();
  const parts = trimmed
    .split(/[^a-zA-Z0-9]+/)
    .map(cleanCodePart)
    .filter(Boolean);

  if (parts.length > 1) {
    const [head, ...rest] = parts;
    return [head, grouped(rest.join(""))].filter(Boolean).join("-");
  }

  const clean = cleanCodePart(trimmed);
  const cleanPrefix = prefix ? cleanCodePart(prefix).slice(0, 8) || "NF" : "";
  if (cleanPrefix && clean.startsWith(cleanPrefix)) {
    return [cleanPrefix, grouped(clean.slice(cleanPrefix.length))]
      .filter(Boolean)
      .join("-");
  }
  return clean;
}

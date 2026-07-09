import { randomBytes } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomToken(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomToken(24)}`;
}

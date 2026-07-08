import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const raw = Buffer.from(env().PAY_ENCRYPTION_KEY, "base64");
  if (raw.length !== 32) {
    throw new Error(
      "PAY_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of `openssl rand -base64 32`)",
    );
  }
  return raw;
}

/**
 * Encrypt a secret for storage at rest. Output format: `iv.tag.ciphertext`,
 * each segment base64url. Safe to store in a text column.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, ctB64] = encoded.split(".");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(
    ALGO,
    key(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** SHA-256 hex digest - used for API-key lookup (keys are shown once). */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

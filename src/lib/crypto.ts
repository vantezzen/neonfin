import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

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

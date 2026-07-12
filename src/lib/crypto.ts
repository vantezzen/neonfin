import "server-only";
import { createHash } from "node:crypto";

/** SHA-256 hex digest - used for API-key lookup (keys are shown once). */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

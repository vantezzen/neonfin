export type { SecretContext, SecretPurpose } from "../../../../shared/secret-encryption";
export {
  encryptSecret,
  decryptSecret,
} from "../../../../shared/secret-encryption";

import {
  configuredProvider,
  envKey,
  vaultConfig,
} from "../../../../shared/secret-encryption";

/**
 * Validates that the secrets configuration is complete and valid.
 * Call this at boot time so misconfigured deploys exit non-zero immediately
 * rather than surfacing the error on the first secret operation.
 * Does NOT make any network calls.
 */
export function validateSecretsConfig(): void {
  const provider = configuredProvider(); // throws on invalid PAY_SECRETS_PROVIDER
  if (provider === "env") {
    envKey(); // throws if PAY_ENCRYPTION_KEY is missing or wrong length
  } else {
    vaultConfig(); // throws if VAULT_ADDR / VAULT_TOKEN / VAULT_TRANSIT_KEY are missing
  }
}

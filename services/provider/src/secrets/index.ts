import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { ProviderName } from "../contract";

const ENV_PREFIX = "env:v1:";
const ALGO = "aes-256-gcm";

export type SecretPurpose = "provider_api_key" | "webhook_secret";

export interface SecretContext {
  accountId: string;
  provider: ProviderName;
  purpose: SecretPurpose;
}

interface SecretsProvider {
  encrypt(plaintext: string, context: SecretContext): Promise<string>;
  decrypt(encoded: string, context: SecretContext): Promise<string>;
}

function contextBytes(context: SecretContext): Buffer {
  return Buffer.from(
    `${context.provider}:${context.accountId}:${context.purpose}`,
    "utf8",
  );
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function envKey(): Buffer {
  const raw = Buffer.from(requiredEnv("PAY_ENCRYPTION_KEY"), "base64");
  if (raw.length !== 32) {
    throw new Error("PAY_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return raw;
}

class EnvSecretsProvider implements SecretsProvider {
  async encrypt(plaintext: string, context: SecretContext): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, envKey(), iv);
    cipher.setAAD(contextBytes(context));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const body = [iv, tag, ciphertext]
      .map((b) => b.toString("base64url"))
      .join(".");
    return `${ENV_PREFIX}${body}`;
  }

  async decrypt(encoded: string, context: SecretContext): Promise<string> {
    const isCurrent = encoded.startsWith(ENV_PREFIX);
    const body = isCurrent ? encoded.slice(ENV_PREFIX.length) : encoded;
    const [ivB64, tagB64, ctB64] = body.split(".");
    if (!ivB64 || !tagB64 || !ctB64) {
      throw new Error("Malformed encrypted secret");
    }

    const decipher = createDecipheriv(
      ALGO,
      envKey(),
      Buffer.from(ivB64, "base64url"),
    );
    if (isCurrent) decipher.setAAD(contextBytes(context));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}

interface VaultResponse {
  data?: {
    ciphertext?: string;
    plaintext?: string;
  };
  errors?: string[];
}

function vaultConfig() {
  const address = requiredEnv("VAULT_ADDR").replace(/\/+$/, "");
  const mount = (process.env.VAULT_TRANSIT_MOUNT ?? "transit").replace(
    /^\/+|\/+$/g,
    "",
  );
  return {
    address,
    mount,
    token: requiredEnv("VAULT_TOKEN"),
    key: requiredEnv("VAULT_TRANSIT_KEY"),
  };
}

class VaultTransitSecretsProvider implements SecretsProvider {
  async encrypt(plaintext: string, context: SecretContext): Promise<string> {
    const data = await vaultRequest("encrypt", {
      plaintext: Buffer.from(plaintext, "utf8").toString("base64"),
      context: contextBytes(context).toString("base64"),
    });
    if (!data.data?.ciphertext) {
      throw new Error("Vault Transit did not return ciphertext");
    }
    return data.data.ciphertext;
  }

  async decrypt(encoded: string, context: SecretContext): Promise<string> {
    const data = await vaultRequest("decrypt", {
      ciphertext: encoded,
      context: contextBytes(context).toString("base64"),
    });
    if (!data.data?.plaintext) {
      throw new Error("Vault Transit did not return plaintext");
    }
    return Buffer.from(data.data.plaintext, "base64").toString("utf8");
  }
}

async function vaultRequest(
  action: "encrypt" | "decrypt",
  body: Record<string, string>,
): Promise<VaultResponse> {
  const config = vaultConfig();
  const res = await fetch(
    `${config.address}/v1/${config.mount}/${action}/${config.key}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vault-token": config.token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const data = (await res.json().catch(() => ({}))) as VaultResponse;
  if (!res.ok) {
    const message = data.errors?.join("; ") || `${res.status} ${res.statusText}`;
    throw new Error(`Vault Transit request failed: ${message}`);
  }
  return data;
}

function configuredProvider(): "env" | "vault" {
  const provider = process.env.PAY_SECRETS_PROVIDER ?? "env";
  if (provider !== "env" && provider !== "vault") {
    throw new Error('PAY_SECRETS_PROVIDER must be "env" or "vault"');
  }
  return provider;
}

const envProvider = new EnvSecretsProvider();
const vaultProvider = new VaultTransitSecretsProvider();

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

export async function encryptSecret(
  plaintext: string,
  context: SecretContext,
): Promise<string> {
  return configuredProvider() === "vault"
    ? vaultProvider.encrypt(plaintext, context)
    : envProvider.encrypt(plaintext, context);
}

export async function decryptSecret(
  encoded: string,
  context: SecretContext,
): Promise<string> {
  if (encoded.startsWith("vault:")) {
    return vaultProvider.decrypt(encoded, context);
  }
  return envProvider.decrypt(encoded, context);
}

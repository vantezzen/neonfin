import { Buffer } from "node:buffer";
import { expect, test } from "bun:test";
import { decryptSecret, encryptSecret, type SecretContext } from ".";

const ctx: SecretContext = {
  accountId: "prov_test",
  provider: "stripe",
  purpose: "provider_api_key",
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("env secrets roundtrip and bind ciphertext to context", async () => {
  const previousProvider = process.env.PAY_SECRETS_PROVIDER;
  const previousKey = process.env.PAY_ENCRYPTION_KEY;
  process.env.PAY_SECRETS_PROVIDER = "env";
  process.env.PAY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

  try {
    const encrypted = await encryptSecret("sk_test_secret", ctx);
    expect(encrypted.startsWith("env:v1:")).toBe(true);
    expect(await decryptSecret(encrypted, ctx)).toBe("sk_test_secret");

    let failed = false;
    try {
      await decryptSecret(encrypted, { ...ctx, accountId: "prov_other" });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  } finally {
    restoreEnv("PAY_SECRETS_PROVIDER", previousProvider);
    restoreEnv("PAY_ENCRYPTION_KEY", previousKey);
  }
});

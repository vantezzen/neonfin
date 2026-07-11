import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

const rootEnv = ".env";
const providerEnv = "services/provider/.env";

if (existsSync(rootEnv) || existsSync(providerEnv)) {
  throw new Error(
    "Refusing to overwrite .env files. Configure existing files manually or remove them first.",
  );
}

function secret(): string {
  return randomBytes(32).toString("base64");
}

function configure(
  template: string,
  values: Record<string, string>,
): string {
  return Object.entries(values).reduce(
    (contents, [key, value]) =>
      contents.replace(`${key}=""`, `${key}="${value}"`),
    template,
  );
}

const providerServiceSecret = secret();
const authSecret = secret();
const encryptionKey = secret();

await writeFile(
  rootEnv,
  configure(await readFile(".env.example", "utf8"), {
    PAY_PROVIDER_SERVICE_SECRET: providerServiceSecret,
    BETTER_AUTH_SECRET: authSecret,
  }),
);
await writeFile(
  providerEnv,
  configure(await readFile("services/provider/.env.example", "utf8"), {
    PAY_PROVIDER_SERVICE_SECRET: providerServiceSecret,
    PAY_ENCRYPTION_KEY: encryptionKey,
  }),
);

console.log("Created .env and services/provider/.env with fresh local secrets.");
console.log("Next: review URLs and email settings, then run:");
console.log("  docker compose up -d postgres");
console.log("  bun run db:migrate");
console.log("  bun run dev");

import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// drizzle-kit's CLI doesn't load .env on its own - mirror Next.js's loader so
// `db:migrate`/`db:push` pick up DATABASE_URL from .env / .env.local.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://neonfin:neonfin@localhost:5432/neonfin",
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
});

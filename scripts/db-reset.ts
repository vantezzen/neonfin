import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import postgres from "postgres";

// Nuke the database: drop the app + drizzle-migration schemas so the following
// `db:migrate` re-applies everything from a clean slate. Driver-agnostic - hits
// whatever DATABASE_URL points at (local docker / Neon / Supabase).
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to reset the database with NODE_ENV=production");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await sql.unsafe(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    CREATE SCHEMA public;
  `);
  console.log("✓ Database wiped. Run migrations next.");
} catch (e) {
  console.error("Reset failed:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await sql.end();
}

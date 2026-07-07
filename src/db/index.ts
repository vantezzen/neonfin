import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Driver-agnostic at the connection-string level: postgres.js speaks the wire
// protocol, so the same code targets local docker-compose, Neon, or Supabase -
// only DATABASE_URL changes. Reuse the client across hot reloads in dev.
const globalForDb = globalThis as unknown as {
  __neonfinSql?: ReturnType<typeof postgres>;
};

function client() {
  if (!globalForDb.__neonfinSql) {
    globalForDb.__neonfinSql = postgres(env().DATABASE_URL, {
      // Serverless-friendly: keep the pool small; managed Postgres poolers
      // (Neon/Supabase) handle fan-out.
      max: 10,
      prepare: false,
    });
  }
  return globalForDb.__neonfinSql;
}

export const db = drizzle(client(), { schema });
export { schema };
export type Database = typeof db;

import { sql } from "drizzle-orm";
import { db } from "@/db";

// Unauthenticated readiness probe for load balancers / orchestration.
// Returns 200 when the database answers; 503 otherwise. No sensitive data.
// The provider service is intentionally not probed here: callers should
// health-check provider-service independently, and a slow provider should
// not cause this endpoint to report the web app as down.
export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}

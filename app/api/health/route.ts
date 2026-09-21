import { getDatabase } from "@/server/db";
import type { HealthResponse } from "@/types/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness checks the real database and returns 503 when it cannot be reached. */
export async function GET() {
  try {
    await getDatabase().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "up" } satisfies HealthResponse,
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable", database: "down" } satisfies HealthResponse,
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

// Liveness health probe for Docker / orchestrators.
//
// Intentionally cheap: no DB, no Redis, no auth. Returns 200 {"status":"ok"}.
// For a deeper readiness check that verifies Postgres/Redis connectivity,
// add a follow-up /api/health/ready route.
//
// This route must NOT leak config or secrets; keep the body minimal.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ status: "ok" }, { status: 200 });
}

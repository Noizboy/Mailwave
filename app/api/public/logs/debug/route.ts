// @vitest-environment node
// TEMPORARY — remove after confirming env var is loaded
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const envKey = process.env.PUBLIC_LOGS_API_KEY;
  return NextResponse.json({
    set: !!envKey,
    length: envKey?.length ?? 0,
    preview: envKey ? `${envKey.slice(0, 4)}...${envKey.slice(-4)}` : null,
  });
}

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { testAiConnection } from "@/lib/settings/ai-test";

export const runtime = "nodejs";

// SEC-003: cap real AI provider calls at 5/min/user so a frontend bug or
// attacker cannot drain the user's provider credits through this endpoint.
const AI_TEST_MAX = 5;
const AI_TEST_WINDOW_MS = 60 * 1000;

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`ai-test:${user.id}`, AI_TEST_MAX, AI_TEST_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many AI test requests. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { RetryAfter: String(rl.retryAfterSeconds) } }
    );
  }

  const result = await testAiConnection(user.id);

  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.error }, { status: result.status });
}

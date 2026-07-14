import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { assertSafeHost } from "@/lib/ssrf";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.aiConfig.findUnique({ where: { userId: user.id } });
  if (!config) return NextResponse.json(null);

  return NextResponse.json({
    ...config,
    encryptedApiKey: config.encryptedApiKey ? "••••••••" : null,
  });
}

const aiSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google_gemini", "openrouter", "custom"]),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal("")),
});

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = aiSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { apiKey, baseUrl, ...rest } = parsed.data;

  // SSRF check on a user-supplied base URL before persisting (CN-005).
  if (baseUrl) {
    const hostCheck = await assertSafeHost(baseUrl);
    if (!hostCheck.ok) {
      return NextResponse.json({ error: hostCheck.reason ?? "Invalid AI base URL." }, { status: 400 });
    }
  }

  const existing = await prisma.aiConfig.findUnique({ where: { userId: user.id } });
  const encryptedApiKey = apiKey ? encrypt(apiKey) : existing?.encryptedApiKey ?? null;

  const configChanged = apiKey || rest.provider !== existing?.provider || rest.model !== existing?.model;
  const updateStatus = configChanged ? "disconnected" : (existing?.status ?? "disconnected");

  await prisma.aiConfig.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...rest,
      encryptedApiKey,
      baseUrl: baseUrl || null,
      status: "disconnected",
    },
    update: {
      ...rest,
      encryptedApiKey,
      baseUrl: baseUrl || null,
      status: updateStatus,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.aiConfig.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}

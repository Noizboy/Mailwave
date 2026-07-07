import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.aiConfig.findUnique({ where: { userId: session.user.id } });
  if (!config) return NextResponse.json(null);

  return NextResponse.json({
    ...config,
    encryptedApiKey: config.encryptedApiKey ? "••••••••" : null,
    oauthAccessToken: undefined,
    oauthRefreshToken: undefined,
    oauthConnected: config.oauthConnected,
    oauthExpiresAt: config.oauthExpiresAt?.toISOString() ?? null,
  });
}

const aiSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google_gemini", "openrouter", "custom", "codex"]),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal("")),
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = aiSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { apiKey, baseUrl, ...rest } = parsed.data;

  const existing = await prisma.aiConfig.findUnique({ where: { userId: session.user.id } });
  const encryptedApiKey = apiKey ? encrypt(apiKey) : existing?.encryptedApiKey ?? null;

  const configChanged = apiKey || rest.provider !== existing?.provider;
  const updateStatus = configChanged ? "disconnected" : (existing?.status ?? "disconnected");

  await prisma.aiConfig.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
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

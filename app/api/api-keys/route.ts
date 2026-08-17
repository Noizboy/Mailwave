// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-key";

export const runtime = "nodejs";

const createSchema = z.object({ name: z.string().min(1).max(100) });

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id, revokedAt: null },
    select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: keys });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { raw, hash } = generateApiKey();

  const record = await prisma.apiKey.create({
    data: { userId: session.user.id, name: parsed.data.name, keyHash: hash },
    select: { id: true, name: true, createdAt: true },
  });

  // raw is returned only once — it is never stored in plain text
  return NextResponse.json({ data: { ...record, key: raw } }, { status: 201 });
}

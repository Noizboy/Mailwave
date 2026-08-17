// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/api-key";

export const runtime = "nodejs";

const querySchema = z.object({
  level: z.enum(["info", "warn", "error"]).optional(),
  category: z.string().optional(),
  userId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) return NextResponse.json({ error: "Missing X-Api-Key header" }, { status: 401 });

  const ownerId = await validateApiKey(apiKey);
  if (!ownerId) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, { status: 400 });
  }

  const { level, category, userId, from, to, page, pageSize } = parsed.data;

  const where = {
    ...(level && { level }),
    ...(category && { category }),
    ...(userId && { userId }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
  };

  const [total, data] = await Promise.all([
    prisma.systemLog.count({ where }),
    prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, level: true, category: true, message: true, metadata: true, userId: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    data,
    pagination: { total, page, pageSize, hasMore: page * pageSize < total },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const importRecord = await prisma.import.findFirst({
    where: { id, userId: user.id },
    include: {
      rows: { orderBy: { rowIndex: "asc" } },
    },
  });

  if (!importRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(importRecord);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const importRecord = await prisma.import.findFirst({
    where: { id, userId: user.id },
  });
  if (!importRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const patchSchema = z.object({
    columnMapping: z.record(z.string(), z.string()).optional(),
    status: z.enum(["review", "saved", "cancelled"]).optional(),
  });
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const updated = await prisma.import.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}

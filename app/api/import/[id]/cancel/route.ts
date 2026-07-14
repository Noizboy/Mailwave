import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.import.updateMany({
    where: { id, userId: user.id },
    data: { status: "cancelled" },
  });

  await prisma.importRow.deleteMany({ where: { importId: id } });

  return NextResponse.json({ ok: true });
}

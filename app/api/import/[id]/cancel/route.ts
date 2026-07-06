import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.import.updateMany({
    where: { id, userId: session.user.id },
    data: { status: "cancelled" },
  });

  await prisma.importRow.deleteMany({ where: { importId: id } });

  return NextResponse.json({ ok: true });
}

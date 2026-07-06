import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const updated = await prisma.campaign.updateMany({
    where: { id, userId: session.user.id, status: "sending" },
    data: { status: "paused" },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Campaign not found or not currently sending" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

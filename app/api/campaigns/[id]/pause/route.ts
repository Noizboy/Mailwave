import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const updated = await prisma.campaign.updateMany({
    where: { id, userId: user.id, status: "sending" },
    data: { status: "paused", activeSendRunId: null },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Campaign not found or not currently sending" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

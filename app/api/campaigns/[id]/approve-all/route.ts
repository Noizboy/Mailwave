import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await prisma.campaignEmail.updateMany({
    where: {
      campaignId: id,
      status: "generated",
      approvalStatus: "pending",
    },
    data: { approvalStatus: "approved" },
  });

  const approvedCount = await prisma.campaignEmail.count({
    where: { campaignId: id, approvalStatus: "approved" },
  });

  if (approvedCount > 0) {
    await prisma.campaign.update({
      where: { id },
      data: { status: "ready_to_send" },
    });
  }

  return NextResponse.json({ approved: result.count });
}

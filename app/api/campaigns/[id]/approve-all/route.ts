import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api/session";
import { findOwnedCampaign } from "@/lib/api/ownership";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await findOwnedCampaign(id, user.id);
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

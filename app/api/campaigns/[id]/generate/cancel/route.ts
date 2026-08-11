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

  if (campaign.status !== "generating") {
    return NextResponse.json({ error: "Campaign is not currently generating" }, { status: 409 });
  }

  // If some emails were already generated, keep them reviewable
  const [generatedCount, memberCount] = await Promise.all([
    prisma.campaignEmail.count({ where: { campaignId: id, status: "generated" } }),
    prisma.listMember.count({
      where: { listId: campaign.listId, contact: { userId: user.id, status: "subscribed" } },
    }),
  ]);

  const targetStatus = generatedCount > 0 ? "pending_review" : "pending";

  // Use updateMany with status condition so a concurrent worker finishing
  // at the same instant doesn't race — if the worker already moved it to
  // pending_review, this is a no-op and we return the worker's result.
  // totalEmails is set to the real list member count so the UI can detect
  // that some contacts still have no email row (canContinue).
  await prisma.campaign.updateMany({
    where: { id, status: "generating" },
    data: { status: targetStatus, totalEmails: memberCount },
  });

  return NextResponse.json({ ok: true, status: targetStatus });
}

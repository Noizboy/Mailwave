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

  if (campaign.status !== "generating") {
    return NextResponse.json({ error: "Campaign is not currently generating" }, { status: 409 });
  }

  // If some emails were already generated, keep them reviewable
  const generatedCount = await prisma.campaignEmail.count({
    where: { campaignId: id, status: "generated" },
  });

  const targetStatus = generatedCount > 0 ? "pending_review" : "pending";

  // Use updateMany with status condition so a concurrent worker finishing
  // at the same instant doesn't race — if the worker already moved it to
  // pending_review, this is a no-op and we return the worker's result.
  await prisma.campaign.updateMany({
    where: { id, status: "generating" },
    data: { status: targetStatus },
  });

  return NextResponse.json({ ok: true, status: targetStatus });
}

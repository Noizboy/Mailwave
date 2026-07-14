import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSendQueue } from "@/lib/jobs/queue";
import { getAuthenticatedUser } from "@/lib/api/session";
import { findOwnedCampaign } from "@/lib/api/ownership";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await findOwnedCampaign(id, user.id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!["sending", "paused", "completed"].includes(campaign.status)) {
    return NextResponse.json({ error: "Campaign cannot be cancelled from its current state" }, { status: 409 });
  }

  const queue = getSendQueue();
  const delayedJob = await queue.getJob(`scheduled-send-${id}`);
  if (delayedJob) await delayedJob.remove();

  // Pause first so any running send job stops on its next iteration
  await prisma.campaign.update({
    where: { id },
    data: { status: "paused", nextSendAt: null, activeSendRunId: null },
  });

  // Reset failed emails back to approved so they can be retried on next send
  await prisma.campaignEmail.updateMany({
    where: { campaignId: id, status: "failed" },
    data: { status: "approved", errorReason: null, retryCount: 0 },
  });

  // Move campaign back to ready_to_send so the user can trigger a fresh send
  await prisma.campaign.update({
    where: { id },
    data: { status: "ready_to_send", activeSendRunId: null, nextSendAt: null, completedAt: null },
  });

  return NextResponse.json({ ok: true });
}

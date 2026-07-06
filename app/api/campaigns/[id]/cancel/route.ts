import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSendQueue } from "@/lib/jobs/queue";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });
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
    data: { status: "paused" },
  });

  // Reset failed emails back to approved so they can be retried on next send
  await prisma.campaignEmail.updateMany({
    where: { campaignId: id, status: "failed" },
    data: { status: "approved", errorReason: null, retryCount: 0 },
  });

  // Move campaign back to ready_to_send so the user can trigger a fresh send
  await prisma.campaign.update({
    where: { id },
    data: { status: "ready_to_send" },
  });

  return NextResponse.json({ ok: true });
}

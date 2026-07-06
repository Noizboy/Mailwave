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
    return NextResponse.json({ error: "No failed emails to retry" }, { status: 409 });
  }

  const { count } = await prisma.campaignEmail.updateMany({
    where: { campaignId: id, status: "failed" },
    data: { status: "approved", errorReason: null, retryCount: 0 },
  });

  if (count === 0) {
    return NextResponse.json({ error: "No failed emails found" }, { status: 422 });
  }

  // If the send job is not already running, re-queue it
  if (campaign.status !== "sending") {
    await prisma.campaign.update({
      where: { id },
      data: { status: "paused" },
    });

    const smtpConfig = await prisma.smtpConfig.findUnique({ where: { userId: session.user.id } });
    if (!smtpConfig || smtpConfig.status !== "connected") {
      return NextResponse.json({ error: "SMTP not connected. Please configure SMTP in Settings." }, { status: 422 });
    }

    const queue = getSendQueue();
    await queue.add(
      "send",
      { campaignId: id, userId: session.user.id },
      {
        attempts: 1,
        jobId: `send-${id}-${Date.now()}`,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      }
    );
  }

  return NextResponse.json({ retried: count });
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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

  if (!["ready_to_send", "paused"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Cannot send from status: ${campaign.status}` },
      { status: 409 }
    );
  }

  const smtpConfig = await prisma.smtpConfig.findUnique({ where: { userId: user.id } });
  if (!smtpConfig || smtpConfig.status !== "connected") {
    return NextResponse.json(
      { error: "SMTP not connected. Please configure SMTP in Settings." },
      { status: 422 }
    );
  }

  const approvedCount = await prisma.campaignEmail.count({
    where: {
      campaignId: id,
      approvalStatus: "approved",
      status: "approved",
    },
  });
  if (approvedCount === 0) {
    return NextResponse.json(
      { error: "No approved emails to send. Approve emails in the review step first." },
      { status: 422 }
    );
  }

  const sendRunId = randomUUID();
  const queue = getSendQueue();

  // For a fresh campaign start, compute the first interval so the first email
  // is also spaced by the configured interval instead of going out immediately.
  // For a resumed (paused) campaign we keep the existing nextSendAt.
  let firstDelayMs = 0;
  let firstNextSendAt: Date;
  if (campaign.status === "paused") {
    firstNextSendAt = campaign.nextSendAt ?? new Date();
    firstDelayMs = Math.max(0, firstNextSendAt.getTime() - Date.now());
  } else {
    const intervalMinutes =
      campaign.intervalType === "random"
        ? Math.floor(
            Math.random() * (campaign.maxInterval - campaign.minInterval + 1) +
              campaign.minInterval
          )
        : campaign.minInterval;
    firstDelayMs = intervalMinutes * 60_000;
    firstNextSendAt = new Date(Date.now() + firstDelayMs);
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: "sending",
      activeSendRunId: sendRunId,
      startedAt: campaign.status === "paused" ? campaign.startedAt ?? new Date() : new Date(),
      nextSendAt: firstNextSendAt,
      completedAt: null,
    },
  });

  try {
    const job = await queue.add(
      "send",
      { campaignId: campaign.id, userId: user.id, sendRunId },
      {
        delay: firstDelayMs > 500 ? firstDelayMs : 0,
        attempts: 1,
        jobId: `send-${campaign.id}-${sendRunId}`,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      }
    );

    return NextResponse.json({ jobId: job.id, status: "queued" });
  } catch (error) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: campaign.status,
        activeSendRunId: campaign.activeSendRunId ?? null,
        startedAt: campaign.startedAt,
        nextSendAt: campaign.nextSendAt,
        completedAt: campaign.completedAt,
      },
    });

    console.error("Failed to enqueue send job", error);
    return NextResponse.json({ error: "Could not queue send job" }, { status: 500 });
  }
}

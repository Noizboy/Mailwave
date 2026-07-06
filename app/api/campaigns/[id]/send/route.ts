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

  if (!["ready_to_send", "paused"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Cannot send from status: ${campaign.status}` },
      { status: 409 }
    );
  }

  const smtpConfig = await prisma.smtpConfig.findUnique({ where: { userId: session.user.id } });
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
      status: { in: ["generated", "approved"] },
    },
  });
  if (approvedCount === 0) {
    return NextResponse.json(
      { error: "No approved emails to send. Approve emails in the review step first." },
      { status: 422 }
    );
  }

  const queue = getSendQueue();
  const job = await queue.add(
    "send",
    { campaignId: campaign.id, userId: session.user.id },
    {
      attempts: 1,
      jobId: `send-${campaign.id}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    }
  );

  return NextResponse.json({ jobId: job.id, status: "queued" });
}

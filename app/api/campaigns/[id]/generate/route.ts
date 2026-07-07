import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGenerateQueue } from "@/lib/jobs/queue";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (["generating", "sending", "paused"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Cannot generate from status: ${campaign.status}` },
      { status: 409 }
    );
  }

  const aiConfig = await prisma.aiConfig.findFirst({
    where: {
      userId: session.user.id,
      status: "connected",
      ...(campaign.aiProvider ? { provider: campaign.aiProvider } : {}),
    },
  });
  if (!aiConfig) {
    return NextResponse.json(
      { error: "No connected AI configuration found. Please set up AI in Settings." },
      { status: 422 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const retryFailed = body?.mode === "retry_failed";

  if (retryFailed) {
    // Only reset failed emails — successfully generated ones are kept
    await prisma.campaignEmail.updateMany({
      where: { campaignId: campaign.id, status: "failed" },
      data: { status: "pending", errorReason: null },
    });
  } else {
    // Reset all emails for a full (re-)generation
    await prisma.campaignEmail.updateMany({
      where: { campaignId: campaign.id },
      data: { status: "pending", errorReason: null },
    });
    // Reset send counters so the progress bar starts fresh
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { sentCount: 0, failedCount: 0, skippedCount: 0 },
    });
  }

  // Set generating before queuing so the UI sees it immediately on the next poll
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "generating" },
  });

  const queue = getGenerateQueue();
  const job = await queue.add(
    "generate",
    { campaignId: campaign.id, userId: session.user.id },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      jobId: `generate-${campaign.id}-${Date.now()}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    }
  );

  return NextResponse.json({ jobId: job.id, status: "queued" });
}

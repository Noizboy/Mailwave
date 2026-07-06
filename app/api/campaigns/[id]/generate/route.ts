import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGenerateQueue } from "@/lib/jobs/queue";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!["draft", "pending", "failed", "pending_review"].includes(campaign.status)) {
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

  const queue = getGenerateQueue();
  const job = await queue.add(
    "generate",
    { campaignId: campaign.id, userId: session.user.id },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      jobId: `generate-${campaign.id}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    }
  );

  return NextResponse.json({ jobId: job.id, status: "queued" });
}

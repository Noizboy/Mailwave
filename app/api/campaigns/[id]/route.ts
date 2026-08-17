import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { deriveCampaignMetrics } from "@/lib/campaign-metrics";
import { getAuthenticatedUser } from "@/lib/api/session";
import { findOwnedCampaign } from "@/lib/api/ownership";
import { getSendQueue } from "@/lib/jobs/queue";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await findOwnedCampaign(id, user.id, {
    include: {
      list: { select: { id: true, name: true } },
      emails: {
        select: {
          id: true,
          contactId: true,
          subject: true,
          approvalStatus: true,
          status: true,
          sentAt: true,
          contact: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const metrics = deriveCampaignMetrics(campaign.emails);
  return NextResponse.json({
    ...campaign,
    sentCount: metrics.sentCount,
    failedCount: metrics.failedCount,
    skippedCount: metrics.skippedCount,
    pendingCount: metrics.pendingCount,
    approvalPendingCount: metrics.approvalPendingCount,
    approvedCount: metrics.approvedCount,
    rejectedCount: metrics.rejectedCount,
  });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  listId: z.string().min(1).optional(),
  // Only allow statuses a user can set manually; sending/completed/failed/generating
  // are owned by the worker and must never be set directly via the API.
  status: z.enum(["pending", "pending_review", "ready_to_send", "paused"]).optional(),
  goal: z.string().optional(),
  product: z.string().optional(),
  cta: z.string().optional(),
  tone: z.string().optional(),
  language: z.string().optional(),
  emailLength: z.string().optional(),
  systemPrompt: z.string().optional(),
  intervalType: z.enum(["fixed", "random"]).optional(),
  minInterval: z.number().int().min(1).optional(),
  maxInterval: z.number().int().min(1).optional(),
  sendWindowStart: z.number().int().min(0).max(23).nullable().optional(),
  sendWindowEnd: z.number().int().min(0).max(23).nullable().optional(),
  aiProvider: z.enum(["openai", "anthropic", "google_gemini", "openrouter", "custom"]).nullable().optional(),
  aiModel: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  if (parsed.data.name) {
    const duplicate = await prisma.campaign.findFirst({
      where: { userId: user.id, name: parsed.data.name, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "A campaign with that name already exists" }, { status: 409 });
    }
  }

  // If interval fields are being saved, fetch the current campaign first so we
  // can detect whether a re-schedule is needed (campaign is actively sending).
  const hasIntervalChange =
    parsed.data.intervalType !== undefined ||
    parsed.data.minInterval !== undefined ||
    parsed.data.maxInterval !== undefined;

  const currentCampaign = hasIntervalChange
    ? await prisma.campaign.findFirst({
        where: { id, userId: user.id },
        select: { status: true, minInterval: true },
      })
    : null;

  const updated = await prisma.campaign.updateMany({
    where: { id, userId: user.id },
    data: parsed.data,
  });

  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // When interval config changes while the campaign is actively sending, reschedule
  // the next send job so both the UI countdown and the actual delivery time
  // reflect the new interval immediately. The old BullMQ job will no-op because
  // `activeSendRunId` won't match the new run ID.
  if (hasIntervalChange && currentCampaign?.status === "sending") {
    const newMinInterval = parsed.data.minInterval ?? currentCampaign.minInterval;
    const newDelayMs = newMinInterval * 60_000;
    const newNextSendAt = new Date(Date.now() + newDelayMs);
    const newSendRunId = randomUUID();

    await prisma.campaign.updateMany({
      where: { id, userId: user.id },
      data: { nextSendAt: newNextSendAt, activeSendRunId: newSendRunId },
    });

    await getSendQueue().add(
      "send",
      { campaignId: id, userId: user.id, sendRunId: newSendRunId },
      {
        delay: newDelayMs,
        jobId: `send-${id}-${newSendRunId}`,
        attempts: 1,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.campaign.deleteMany({
    where: { id, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}

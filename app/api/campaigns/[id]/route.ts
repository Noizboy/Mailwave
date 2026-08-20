import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { deriveCampaignMetrics } from "@/lib/campaign-metrics";
import { getAuthenticatedUser } from "@/lib/api/session";
import { findOwnedCampaign } from "@/lib/api/ownership";
import { getSendQueue } from "@/lib/jobs/queue";
import { getHourInTimezone, nextWindowOpenDate } from "@/lib/jobs/send-campaign-stages";
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
    approvedUnsentCount: metrics.approvedUnsentCount,
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

  // If a sending window field is being saved, we need to check whether the
  // currently-scheduled nextSendAt falls outside the new window — if so the
  // job must be rescheduled. Interval-only changes do NOT force a reschedule:
  // the already-committed nextSendAt is honoured and the new interval applies
  // from the email after the currently-scheduled one (the worker reads interval
  // config fresh on every iteration via loadMutableSendingConfig).
  const hasWindowChange =
    parsed.data.sendWindowStart !== undefined ||
    parsed.data.sendWindowEnd !== undefined;

  const currentCampaign = hasWindowChange
    ? await prisma.campaign.findFirst({
        where: { id, userId: user.id },
        select: {
          status: true,
          minInterval: true,
          nextSendAt: true,
          sendWindowStart: true,
          sendWindowEnd: true,
          emails: {
            where: { status: "sent" },
            select: { sentAt: true },
            orderBy: { sentAt: "desc" },
            take: 1,
          },
        },
      })
    : null;

  const updated = await prisma.campaign.updateMany({
    where: { id, userId: user.id },
    data: parsed.data,
  });

  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reschedule only when a window change makes the current nextSendAt invalid.
  // Semantics:
  //   - If nextSendAt is already within the new window → keep it (no disruption).
  //   - If nextSendAt is outside the new window (or there is no nextSendAt) →
  //     reschedule to when the new window opens (or immediately if we are inside it).
  // The old BullMQ job no-ops when it fires because activeSendRunId won't match.
  if (hasWindowChange && currentCampaign?.status === "sending") {
    const newWindowStart =
      "sendWindowStart" in parsed.data
        ? parsed.data.sendWindowStart
        : currentCampaign.sendWindowStart;
    const newWindowEnd =
      "sendWindowEnd" in parsed.data
        ? parsed.data.sendWindowEnd
        : currentCampaign.sendWindowEnd;

    // Window disabled — nothing to reschedule; the existing nextSendAt stands.
    if (newWindowStart !== null && newWindowStart !== undefined &&
        newWindowEnd !== null && newWindowEnd !== undefined) {
      const userRow = await prisma.user.findUnique({
        where: { id: user.id },
        select: { timezone: true },
      });
      const tz = userRow?.timezone ?? "UTC";

      // Compute the earliest valid send time under the new window.
      // If we are currently inside the new window the next opportunity is
      // now + (remaining interval based on last-sent time). If outside, it
      // is when the window next opens.
      const now = new Date();
      const nowHour = getHourInTimezone(tz, now);
      const currentlyInWindow =
        newWindowStart < newWindowEnd
          ? nowHour >= newWindowStart && nowHour < newWindowEnd
          : nowHour >= newWindowStart || nowHour < newWindowEnd;

      let earliestDelayMs: number;
      if (currentlyInWindow) {
        // Preserve elapsed time so the interval counter isn't restarted.
        const lastSentAt = currentCampaign.emails[0]?.sentAt;
        const elapsedMs = lastSentAt ? now.getTime() - new Date(lastSentAt).getTime() : 0;
        const intervalMs = (currentCampaign.minInterval ?? 3) * 60_000;
        earliestDelayMs = Math.max(0, intervalMs - elapsedMs);
      } else {
        const windowOpens = nextWindowOpenDate(tz, newWindowStart);
        earliestDelayMs = windowOpens.getTime() - now.getTime();
      }

      const earliestMs = now.getTime() + earliestDelayMs;
      const currentScheduledMs = currentCampaign.nextSendAt
        ? new Date(currentCampaign.nextSendAt).getTime()
        : Infinity;

      // Check if the currently-scheduled time is valid under the new window.
      const scheduledHour = currentCampaign.nextSendAt
        ? getHourInTimezone(tz, new Date(currentCampaign.nextSendAt))
        : -1;
      const scheduledInNewWindow =
        scheduledHour >= 0 &&
        (newWindowStart < newWindowEnd
          ? scheduledHour >= newWindowStart && scheduledHour < newWindowEnd
          : scheduledHour >= newWindowStart || scheduledHour < newWindowEnd);

      // Reschedule when:
      //   1. The new window opens sooner than the currently-scheduled time, OR
      //   2. The currently-scheduled time falls outside the new window entirely.
      const needsReschedule =
        earliestMs < currentScheduledMs || !scheduledInNewWindow;

      if (needsReschedule) {
        const newNextSendAt = new Date(earliestMs);
        const newSendRunId = randomUUID();

        await prisma.campaign.updateMany({
          where: { id, userId: user.id },
          data: { nextSendAt: newNextSendAt, activeSendRunId: newSendRunId },
        });

        await getSendQueue().add(
          "send",
          { campaignId: id, userId: user.id, sendRunId: newSendRunId },
          {
            delay: Math.max(0, earliestDelayMs),
            jobId: `send-${id}-${newSendRunId}`,
            attempts: 1,
            removeOnComplete: { age: 3600 },
            removeOnFail: { age: 86400 },
          }
        );
      }
    }
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

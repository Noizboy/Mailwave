import { Worker, Job } from "bullmq";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import nodemailer from "nodemailer";
import { QUEUE_NAMES, getSendQueue } from "./queue";
import { getNotifPrefs } from "./notification-prefs";
import { deriveCampaignMetrics } from "@/lib/campaign-metrics";
import { signEmailId } from "@/lib/track-sign";

export interface SendCampaignJobData {
  campaignId: string;
  userId: string;
  sendRunId?: string;
}

export async function processSend(job: Job<SendCampaignJobData>) {
  const { campaignId, userId } = job.data;
  const sendRunId = job.data.sendRunId ?? randomUUID();

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!["ready_to_send", "paused", "sending"].includes(campaign.status)) {
    return { skipped: true, reason: `Campaign status is '${campaign.status}', not ready` };
  }

  const claim = await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      userId,
      status: { in: ["ready_to_send", "paused", "sending"] },
      OR: [
        { activeSendRunId: sendRunId },
        { activeSendRunId: null },
      ],
    },
    data: {
      status: "sending",
      activeSendRunId: sendRunId,
      startedAt: campaign.startedAt ?? new Date(),
      nextSendAt: campaign.nextSendAt ?? new Date(),
    },
  });
  if (claim.count === 0) {
    return { skipped: true, reason: "A newer send run already owns this campaign" };
  }

  // Fetch notification prefs once — used across the entire job
  const prefs = await getNotifPrefs(userId, ["campaign_complete", "campaign_error", "email_bounced"]);

  // Get SMTP config
  const smtpConfig = await prisma.smtpConfig.findUnique({ where: { userId } });
  if (!smtpConfig || !smtpConfig.encryptedPassword || smtpConfig.status !== "connected") {
    await prisma.campaign.updateMany({
      where: { id: campaignId, activeSendRunId: sendRunId },
      data: { status: "failed", activeSendRunId: null, nextSendAt: null },
    });

    if (prefs.campaign_error) {
      await prisma.notification.create({
        data: {
          userId,
          type: "campaign.sending_failed",
          title: "Campaign failed",
          body: `Campaign "${campaign.name}" could not be sent — SMTP is not configured or connected.`,
          entityType: "campaign",
          entityId: campaignId,
        },
      });
    }

    throw new Error("SMTP not configured or not connected");
  }

  const smtpPassword = decrypt(smtpConfig.encryptedPassword);
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host!,
    port: smtpConfig.port ?? 587,
    secure: smtpConfig.encryption === "ssl",
    auth: { user: smtpConfig.username!, pass: smtpPassword },
    // Never disable certificate validation — see CN-007. The "none" mode
    // means no TLS is used; for "tls"/"ssl" the default validation applies.
    connectionTimeout: 10_000,
    socketTimeout: 30_000,
  });

  // Get sending limits for this user
  const sendingAccount = await prisma.sendingAccount.findUnique({ where: { userId } });
  const suppressAfterEmails = sendingAccount?.suppressAfterEmails ?? 3;

  // Get approved emails not yet sent, excluding already-suppressed contacts
  const pendingEmails = await prisma.campaignEmail.findMany({
    where: {
      campaignId,
      approvalStatus: "approved",
      status: { in: ["generated", "approved"] },
      contact: { status: { not: "suppressed" } },
    },
    include: {
      contact: {
        select: { id: true, email: true, firstName: true, lastName: true, emailsSentCount: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  let sentCount = 0;
  let failCount = 0;
  let rateLimitResumeAt: Date | null = null;

  for (let index = 0; index < pendingEmails.length; index++) {
    const email = pendingEmails[index];
    // Re-check campaign status in case it was paused
    let freshCampaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!freshCampaign || freshCampaign.status === "paused" || freshCampaign.activeSendRunId !== sendRunId) break;

    const nextSendTargetMs = freshCampaign.nextSendAt ? new Date(freshCampaign.nextSendAt).getTime() : Date.now();
    const waitMs = nextSendTargetMs - Date.now();
    if (waitMs > 500) {
      // Re-enqueue with delay instead of blocking the worker thread
      const newSendRunId = randomUUID();
      await getSendQueue().add(
        "send",
        { campaignId, userId, sendRunId: newSendRunId },
        {
          delay: waitMs,
          jobId: `send-${campaignId}-${newSendRunId}`,
          attempts: 1,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
      break;
    }

    // Check daily/hourly limits
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3600000);
    const dayAgo = new Date(now.getTime() - 86400000);

    const sentLastHour = await prisma.deliveryEvent.count({
      where: {
        campaignEmail: { campaign: { userId } },
        eventType: "sent",
        occurredAt: { gte: hourAgo },
      },
    });
    const sentLastDay = await prisma.deliveryEvent.count({
      where: {
        campaignEmail: { campaign: { userId } },
        eventType: "sent",
        occurredAt: { gte: dayAgo },
      },
    });

    if (sentLastHour >= smtpConfig.hourlyLimit || sentLastDay >= smtpConfig.dailyLimit) {
      // Compute when each exceeded limit clears (oldest event in window + window size)
      const resumeTimes: number[] = [];

      if (sentLastHour >= smtpConfig.hourlyLimit) {
        const oldest = await prisma.deliveryEvent.findFirst({
          where: {
            campaignEmail: { campaign: { userId } },
            eventType: "sent",
            occurredAt: { gte: hourAgo },
          },
          orderBy: { occurredAt: "asc" },
        });
        if (oldest) resumeTimes.push(oldest.occurredAt.getTime() + 3600000 + 1000);
      }

      if (sentLastDay >= smtpConfig.dailyLimit) {
        const oldest = await prisma.deliveryEvent.findFirst({
          where: {
            campaignEmail: { campaign: { userId } },
            eventType: "sent",
            occurredAt: { gte: dayAgo },
          },
          orderBy: { occurredAt: "asc" },
        });
        if (oldest) resumeTimes.push(oldest.occurredAt.getTime() + 86400000 + 1000);
      }

      rateLimitResumeAt = new Date(
        resumeTimes.length > 0 ? Math.max(...resumeTimes) : Date.now() + 3600000
      );

      const newSendRunId = randomUUID();
      const delay = Math.max(0, rateLimitResumeAt.getTime() - Date.now());
      await getSendQueue().add(
        "send",
        { campaignId, userId, sendRunId: newSendRunId },
        {
          delay,
          jobId: `send-${campaignId}-${newSendRunId}`,
          attempts: 1,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );

      break;
    }

    // Check per-contact send cap — skip if at or over limit
    if (email.contact.emailsSentCount >= suppressAfterEmails) {
      await prisma.campaignEmail.update({
        where: { id: email.id },
        data: { status: "skipped", errorReason: "Contact suppressed: send limit reached" },
      });
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { skippedCount: { increment: 1 } },
      });
      continue;
    }

    try {
      const appUrl = process.env.AUTH_URL ?? "";
      const htmlBody = (email.body ?? "").replace(/\n/g, "<br>");
      const pixelUrl = `${appUrl}/api/track/${email.id}?s=${signEmailId(email.id)}`;

      await transporter.sendMail({
        from: `"${smtpConfig.fromName ?? ""}" <${smtpConfig.fromEmail}>`,
        replyTo: smtpConfig.replyTo ?? undefined,
        to: email.contact.email,
        subject: email.subject ?? "(No subject)",
        text: email.body ?? "",
        html:
          `<img src="${pixelUrl}" width="1" height="1" alt="" border="0" style="height:1px!important;width:1px!important;border-width:0!important;margin:0!important;padding:0!important" />` +
          `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${htmlBody}</div>`,
      });

      await prisma.campaignEmail.update({
        where: { id: email.id },
        data: { status: "sent", sentAt: new Date() },
      });

      await prisma.deliveryEvent.create({
        data: {
          campaignEmailId: email.id,
          eventType: "sent",
          occurredAt: new Date(),
        },
      });

      // Increment contact sent count atomically and auto-suppress when the
      // limit is reached. Uses DB-side increment to stay correct under
      // concurrent workers (avoids read-modify-write races that could
      // otherwise bypass the suppression threshold).
      const projectedNewCount = email.contact.emailsSentCount + 1;
      await prisma.contact.update({
        where: { id: email.contact.id },
        data: {
          emailsSentCount: { increment: 1 },
          ...(projectedNewCount >= suppressAfterEmails ? { status: "suppressed" } : {}),
        },
      });

      sentCount++;

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } },
      });
    } catch (err) {
      await prisma.campaignEmail.update({
        where: { id: email.id },
        data: {
          status: "failed",
          errorReason: err instanceof Error ? err.message : "Unknown error",
          retryCount: { increment: 1 },
        },
      });
      failCount++;

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { failedCount: { increment: 1 } },
      });

      // NOTIF-006: one bounce notification per campaign per hour
      if (prefs.email_bounced) {
        const oneHourAgo = new Date(Date.now() - 3600000);
        const recentBounce = await prisma.notification.findFirst({
          where: {
            userId,
            type: "delivery.email_bounced",
            entityType: "campaign",
            entityId: campaignId,
            createdAt: { gte: oneHourAgo },
          },
        });
        if (!recentBounce) {
          await prisma.notification.create({
            data: {
              userId,
              type: "delivery.email_bounced",
              title: "Email bounce detected",
              body: `A delivery failed for campaign "${campaign.name}".`,
              entityType: "campaign",
              entityId: campaignId,
            },
          });
        }
      }
    }

    // Apply interval between sends
    const interval = campaign.intervalType === "random"
      ? Math.floor(Math.random() * (campaign.maxInterval - campaign.minInterval + 1) + campaign.minInterval)
      : campaign.minInterval;

    const hasMorePendingEmails = index < pendingEmails.length - 1;
    const intervalMs = interval * 60 * 1000;

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        nextSendAt: hasMorePendingEmails ? new Date(Date.now() + intervalMs) : null,
      },
    });

    await job.updateProgress(Math.round(((sentCount + failCount) / pendingEmails.length) * 100));

    if (hasMorePendingEmails && intervalMs > 500) {
      // Re-enqueue with delay instead of blocking the worker thread
      const newSendRunId = randomUUID();
      await getSendQueue().add(
        "send",
        { campaignId, userId, sendRunId: newSendRunId },
        {
          delay: intervalMs,
          jobId: `send-${campaignId}-${newSendRunId}`,
          attempts: 1,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
      break;
    }
  }

  // Check if all done
  const remaining = await prisma.campaignEmail.count({
    where: {
      campaignId,
      approvalStatus: "approved",
      status: { in: ["generated", "approved"] },
    },
  });
  const emailMetrics = deriveCampaignMetrics(
    await prisma.campaignEmail.findMany({
      where: { campaignId },
      select: { approvalStatus: true, status: true },
    })
  );

  const latestCampaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { activeSendRunId: true },
  });
  if (latestCampaign?.activeSendRunId !== sendRunId) {
    return { sentCount, failCount, finalStatus: "stale" };
  }

  const finalStatus = remaining === 0 ? "completed" : "paused";

  await prisma.campaign.updateMany({
    where: { id: campaignId, activeSendRunId: sendRunId },
    data: {
      status: finalStatus,
      activeSendRunId: null,
      sentCount: emailMetrics.sentCount,
      failedCount: emailMetrics.failedCount,
      skippedCount: emailMetrics.skippedCount,
      pendingCount: emailMetrics.pendingCount,
      nextSendAt: rateLimitResumeAt ?? null,
      ...(finalStatus === "completed" ? { completedAt: new Date() } : {}),
    },
  });

  // NOTIF-003: respect campaign_complete preference
  if (finalStatus === "completed" && prefs.campaign_complete) {
    await prisma.notification.create({
      data: {
        userId,
        type: "campaign.sending_complete",
        title: "Campaign sent",
        body: `${sentCount} email${sentCount !== 1 ? "s" : ""} sent for "${campaign.name}".${failCount > 0 ? ` ${failCount} failed.` : ""}`,
        entityType: "campaign",
        entityId: campaignId,
      },
    });
  }

  return { sentCount, failCount, finalStatus };
}

export function startSendWorker() {
  const worker = new Worker(QUEUE_NAMES.send, processSend, {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
    concurrency: 1, // Serial — one send job at a time per account
    // After SEND-001/002 each job sends at most one email; 60s is generous
    lockDuration: 60_000,
    lockRenewTime: 20_000,
  });

  worker.on("failed", (job, err) => {
    console.error(`Send job ${job?.id} failed:`, err.message);
  });

  return worker;
}

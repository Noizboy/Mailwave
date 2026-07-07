import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import nodemailer from "nodemailer";
import { QUEUE_NAMES } from "./queue";
import { getNotifPrefs } from "./notification-prefs";

export interface SendCampaignJobData {
  campaignId: string;
  userId: string;
}

export async function processSend(job: Job<SendCampaignJobData>) {
  const { campaignId, userId } = job.data;

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!["ready_to_send", "paused"].includes(campaign.status)) {
    return { skipped: true, reason: `Campaign status is '${campaign.status}', not ready` };
  }

  // Mark as sending
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "sending", startedAt: campaign.startedAt ?? new Date() },
  });

  // Fetch notification prefs once — used across the entire job
  const prefs = await getNotifPrefs(userId, ["campaign_complete", "campaign_error", "email_bounced"]);

  // Get SMTP config
  const smtpConfig = await prisma.smtpConfig.findUnique({ where: { userId } });
  if (!smtpConfig || !smtpConfig.encryptedPassword || smtpConfig.status !== "connected") {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "failed" } });

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
    ...(smtpConfig.encryption === "none" ? { tls: { rejectUnauthorized: false } } : {}),
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

  for (const email of pendingEmails) {
    // Re-check campaign status in case it was paused
    const freshCampaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!freshCampaign || freshCampaign.status === "paused") break;

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
      break;
    }

    // Check per-contact send cap — skip if at or over limit
    if (email.contact.emailsSentCount >= suppressAfterEmails) {
      await prisma.campaignEmail.update({
        where: { id: email.id },
        data: { status: "skipped", errorReason: "Contact suppressed: send limit reached" },
      });
      continue;
    }

    try {
      const appUrl = process.env.APP_URL ?? "";
      const htmlBody = (email.body ?? "").replace(/\n/g, "<br>");
      const pixelUrl = `${appUrl}/api/track/${email.id}`;

      await transporter.sendMail({
        from: `"${smtpConfig.fromName ?? ""}" <${smtpConfig.fromEmail}>`,
        replyTo: smtpConfig.replyTo ?? undefined,
        to: email.contact.email,
        subject: email.subject ?? "(No subject)",
        text: email.body ?? "",
        html:
          `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${htmlBody}</div>` +
          `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" />`,
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

      // Increment contact sent count and auto-suppress when limit is reached
      const newCount = email.contact.emailsSentCount + 1;
      await prisma.contact.update({
        where: { id: email.contact.id },
        data: {
          emailsSentCount: newCount,
          ...(newCount >= suppressAfterEmails ? { status: "suppressed" } : {}),
        },
      });

      sentCount++;
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

    await new Promise((resolve) => setTimeout(resolve, interval * 60 * 1000));

    await job.updateProgress(Math.round(((sentCount + failCount) / pendingEmails.length) * 100));
  }

  // Check if all done
  const remaining = await prisma.campaignEmail.count({
    where: {
      campaignId,
      approvalStatus: "approved",
      status: { in: ["generated", "approved"] },
    },
  });

  const finalStatus = remaining === 0 ? "completed" : "paused";

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: finalStatus,
      sentCount: { increment: sentCount },
      failedCount: { increment: failCount },
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
  });

  worker.on("failed", (job, err) => {
    console.error(`Send job ${job?.id} failed:`, err.message);
  });

  return worker;
}

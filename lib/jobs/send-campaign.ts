import { Worker, Job } from "bullmq";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { QUEUE_NAMES } from "./queue";
import { getNotifPrefs } from "./notification-prefs";
import {
  claimSendRun,
  loadSmtpTransport,
  loadSuppressAfterEmails,
  loadPendingEmails,
  loadRateLimitCounts,
  decideContinuation,
  sendOneEmail,
  persistSendSuccess,
  persistSendFailure,
  persistSkippedEmail,
  recordBounceNotificationIfAllowed,
  reenqueueSend,
  applyInterval,
  finalizeSendRun,
} from "./send-campaign-stages";

export interface SendCampaignJobData {
  campaignId: string;
  userId: string;
  sendRunId?: string;
}

/**
 * Result handed back to BullMQ. The union is flattened to a single object with
 * optional fields so callers can read counters and status without narrowing —
 * matching the original inferred shape — while the runtime value carries only
 * the fields the path actually produced.
 */
export type SendRunResult = {
  skipped?: boolean;
  reason?: string;
  sentCount?: number;
  failCount?: number;
  finalStatus?: string;
};

/**
 * Worker entry point. The flow is expressed as a short sequence of atomic
 * stages:
 *   1. Claim the send run (atomic ownership transfer).
 *   2. For each pending email, decide whether to continue (pacing, rate-limit,
 *      suppression, pause/stale checks).
 *   3. Send one email via SMTP (never throws — returns an outcome).
 *   4. Persist the outcome inside a transaction so counters, email state, and
 *      delivery events cannot diverge on an intermediate write failure.
 * The orchestrator owns the loop, progress reporting, re-enqueue side effects,
 * and final run reconciliation.
 */
export async function processSend(job: Job<SendCampaignJobData>): Promise<SendRunResult> {
  const { campaignId, userId } = job.data;
  const sendRunId = job.data.sendRunId ?? randomUUID();

  // --- Stage 1: Claim the send run ---
  const claim = await claimSendRun(campaignId, userId, sendRunId);
  if (!claim.claimed) {
    return { skipped: true, reason: claim.reason };
  }
  const campaign = claim.campaign;

  // Fetch notification prefs once — used across the entire job.
  const prefs = await getNotifPrefs(userId, ["campaign_complete", "campaign_error", "email_bounced"]);

  // --- Setup: validate SMTP, build transporter, load sending context ---
  const smtp = await loadSmtpTransport(userId, campaignId, sendRunId, campaign.name, prefs);
  if (!smtp.ok) {
    throw smtp.error;
  }
  const { smtpSettings, transporter } = smtp;

  const suppressAfterEmails = await loadSuppressAfterEmails(userId);
  const pendingEmails = await loadPendingEmails(campaignId);
  const rateLimitCounts = await loadRateLimitCounts(userId);
  // Capture the window starts once so the rate-limit decision uses the same
  // boundaries that produced the snapshot counts above.
  const rateLimitWindowStart = {
    hourAgo: new Date(Date.now() - 3600_000),
    dayAgo: new Date(Date.now() - 86_400_000),
  };

  let sentCount = 0;
  let failCount = 0;
  let rateLimitResumeAt: Date | null = null;
  // True when we re-enqueued a continuation job (interval or rate-limit); in
  // that case the campaign stays "sending" — not "paused" — so the UI doesn't
  // show a spurious "Resume Sending" button between sends.
  let reEnqueuedContinuation = false;

  for (let index = 0; index < pendingEmails.length; index++) {
    const email = pendingEmails[index];

    // --- Stage 2: continuation decision ---
    const decision = await decideContinuation({
      campaignId,
      sendRunId,
      email,
      suppressAfterEmails,
      smtpSettings,
      rateLimitCounts,
      rateLimitWindowStart,
    });

    if (decision.action === "stop") {
      break;
    }

    if (decision.action === "skip") {
      // --- Stage 4 (skip path): persist the skip transactionally ---
      await persistSkippedEmail(campaignId, email);
      continue;
    }

    if (decision.action === "reenqueue") {
      await reenqueueSend(campaignId, userId, decision.newSendRunId, decision.delay);
      rateLimitResumeAt = decision.rateLimitResumeAt;
      reEnqueuedContinuation = true;
      break;
    }

    // --- Stage 3: send one email ---
    const outcome = await sendOneEmail(email, transporter, smtpSettings);

    // --- Stage 4: persist the outcome transactionally ---
    if (outcome.status === "sent") {
      await persistSendSuccess(campaignId, email, suppressAfterEmails);
      sentCount++;
      rateLimitCounts.sentLastHour++;
      rateLimitCounts.sentLastDay++;
    } else {
      await persistSendFailure(campaignId, email, outcome.error);
      failCount++;
      // Bounce notification is debounced and lives outside the delivery
      // transaction so a notification issue cannot roll back delivery state.
      await recordBounceNotificationIfAllowed(userId, campaignId, campaign.name, prefs);
    }

    // Apply the inter-send interval: update `nextSendAt` and re-enqueue a
    // continuation job when the interval is long enough to avoid blocking.
    const interval = applyInterval(campaign, index, pendingEmails.length);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: interval.nextSendAtUpdate,
    });

    await job.updateProgress(
      Math.round(((sentCount + failCount) / pendingEmails.length) * 100)
    );

    if (interval.reenqueue) {
      await reenqueueSend(campaignId, userId, interval.newSendRunId!, interval.delayMs!);
      reEnqueuedContinuation = true;
      break;
    }
  }

  // --- Finalize: reconcile metrics, detect stale runs, set terminal status ---
  return await finalizeSendRun({
    campaignId,
    sendRunId,
    userId,
    campaignName: campaign.name,
    sentCount,
    failCount,
    rateLimitResumeAt,
    reEnqueuedContinuation,
    prefs,
  });
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

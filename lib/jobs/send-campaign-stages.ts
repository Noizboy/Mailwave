import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { assertSafeHost } from "@/lib/ssrf";
import { getSendQueue } from "./queue";
import { signEmailId } from "@/lib/track-sign";
import { deriveCampaignMetrics } from "@/lib/campaign-metrics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal campaign shape consumed by the send orchestrator and stages. */
export type SendCampaignRef = {
  id: string;
  name: string;
  status: string;
  startedAt: Date | null;
  nextSendAt: Date | null;
  intervalType: string;
  minInterval: number;
  maxInterval: number;
};

/** Approved, unsent campaign email with the contact fields needed to send. */
export type PendingEmail = {
  id: string;
  subject: string | null;
  body: string | null;
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    emailsSentCount: number;
  };
};

/** Resolved SMTP settings required to build a transporter and enforce limits. */
export type SmtpSettings = {
  host: string;
  port: number;
  username: string;
  fromName: string | null;
  fromEmail: string;
  replyTo: string | null;
  encryption: string;
  hourlyLimit: number;
  dailyLimit: number;
};

export type NotifPrefs = Record<string, boolean>;

export type RateLimitCounts = { sentLastHour: number; sentLastDay: number };

/**
 * Outcome of attempting to send one email. The send stage never throws — it
 * returns a failure outcome so persistence can record the error deterministically.
 */
export type SendOutcome =
  | { status: "sent" }
  | { status: "failed"; error: Error };

/**
 * Stage 2 result: what the orchestrator should do for the current email before
 * it touches SMTP. `reenqueue` covers both pacing waits and rate-limit waits;
 * `rateLimitResumeAt` is forwarded to finalize so the campaign's `nextSendAt`
 * reflects when the run will resume.
 */
export type ContinuationDecision =
  | { action: "send" }
  | { action: "skip"; reason: string }
  | { action: "stop" }
  | {
      action: "reenqueue";
      delay: number;
      newSendRunId: string;
      rateLimitResumeAt: Date | null;
    };

const HOUR_MS = 3600_000;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Stage 1: Claim the send run
// ---------------------------------------------------------------------------

/**
 * Atomically claim ownership of the campaign for this send run via an
 * `updateMany` conditional on the current status and a free (or matching)
 * `activeSendRunId`. Returns the campaign reference plus whether the claim
 * succeeded; the orchestrator decides how to surface a skip.
 */
export async function claimSendRun(
  campaignId: string,
  userId: string,
  sendRunId: string
): Promise<{ campaign: SendCampaignRef; claimed: boolean; reason?: string }> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const ref = campaign as unknown as SendCampaignRef;

  if (!["ready_to_send", "paused", "sending"].includes(campaign.status)) {
    return { campaign: ref, claimed: false, reason: `Campaign status is '${campaign.status}', not ready` };
  }

  const claim = await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      userId,
      status: { in: ["ready_to_send", "paused", "sending"] },
      OR: [{ activeSendRunId: sendRunId }, { activeSendRunId: null }],
    },
    data: {
      status: "sending",
      activeSendRunId: sendRunId,
      startedAt: campaign.startedAt ?? new Date(),
      nextSendAt: campaign.nextSendAt ?? new Date(),
    },
  });
  if (claim.count === 0) {
    return { campaign: ref, claimed: false, reason: "A newer send run already owns this campaign" };
  }
  return { campaign: ref, claimed: true };
}

// ---------------------------------------------------------------------------
// Setup: SMTP validation + transporter, sending limits, pending emails
// ---------------------------------------------------------------------------

/**
 * Resolve and validate the user's SMTP configuration, then build a nodemailer
 * transporter. If SMTP is unusable or the host is unsafe, the campaign is
 * marked `failed` and a `campaign_error` notification is emitted (when the
 * preference allows) before returning a failure result the orchestrator throws.
 */
export async function loadSmtpTransport(
  userId: string,
  campaignId: string,
  sendRunId: string,
  campaignName: string,
  prefs: NotifPrefs
): Promise<
  | { ok: true; smtpSettings: SmtpSettings; transporter: nodemailer.Transporter }
  | { ok: false; error: Error }
> {
  const smtpConfig = await prisma.smtpConfig.findUnique({ where: { userId } });
  if (!smtpConfig || !smtpConfig.encryptedPassword || smtpConfig.status !== "connected") {
    await failRunAndNotify(
      campaignId, sendRunId, userId, campaignName,
      `Campaign "${campaignName}" could not be sent — SMTP is not configured or connected.`,
      prefs
    );
    return { ok: false, error: new Error("SMTP not configured or not connected") };
  }

  // Re-validate the SMTP host at send time (not just at save time) to close the
  // DNS-rebinding / TOCTOU window: a host that resolved to a public IP when
  // saved could later point at an internal/metadata address (CN-005, CWE-918).
  const hostCheck = await assertSafeHost(smtpConfig.host ?? "");
  if (!hostCheck.ok) {
    await failRunAndNotify(
      campaignId, sendRunId, userId, campaignName,
      `Campaign "${campaignName}" could not be sent — the SMTP host is not allowed.`,
      prefs
    );
    return { ok: false, error: new Error(`SMTP host rejected: ${hostCheck.reason ?? "unsafe host"}`) };
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

  const smtpSettings: SmtpSettings = {
    host: smtpConfig.host!,
    port: smtpConfig.port ?? 587,
    username: smtpConfig.username!,
    fromName: smtpConfig.fromName,
    fromEmail: smtpConfig.fromEmail!,
    replyTo: smtpConfig.replyTo,
    encryption: smtpConfig.encryption,
    hourlyLimit: smtpConfig.hourlyLimit,
    dailyLimit: smtpConfig.dailyLimit,
  };

  return { ok: true, smtpSettings, transporter };
}

/**
 * Mark the campaign `failed`, clear run ownership, and emit a
 * `campaign.sending_failed` notification when the user's preference allows it.
 */
async function failRunAndNotify(
  campaignId: string,
  sendRunId: string,
  userId: string,
  campaignName: string,
  body: string,
  prefs: NotifPrefs
): Promise<void> {
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
        body,
        entityType: "campaign",
        entityId: campaignId,
      },
    });
  }
}

/** Load the per-contact suppression threshold for the user. */
export async function loadSuppressAfterEmails(userId: string): Promise<number> {
  const sendingAccount = await prisma.sendingAccount.findUnique({ where: { userId } });
  return sendingAccount?.suppressAfterEmails ?? 3;
}

/** Load approved, unsent emails for subscribed contacts, oldest first. */
export async function loadPendingEmails(campaignId: string): Promise<PendingEmail[]> {
  return prisma.campaignEmail.findMany({
    where: {
      campaignId,
      approvalStatus: "approved",
      status: { in: ["generated", "approved"] },
      contact: { status: "subscribed" },
    },
    include: {
      contact: {
        select: { id: true, email: true, firstName: true, lastName: true, emailsSentCount: true },
      },
    },
    orderBy: { createdAt: "asc" },
  }) as Promise<PendingEmail[]>;
}

/** Snapshot the user's sent-event counts within the hourly and daily windows. */
export async function loadRateLimitCounts(userId: string): Promise<RateLimitCounts> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const [sentLastHour, sentLastDay] = await Promise.all([
    prisma.deliveryEvent.count({
      where: { campaignEmail: { campaign: { userId } }, eventType: "sent", occurredAt: { gte: hourAgo } },
    }),
    prisma.deliveryEvent.count({
      where: { campaignEmail: { campaign: { userId } }, eventType: "sent", occurredAt: { gte: dayAgo } },
    }),
  ]);
  return { sentLastHour, sentLastDay };
}

// ---------------------------------------------------------------------------
// Stage 2: Continuation decision
// ---------------------------------------------------------------------------

/**
 * Decide what to do for the current email before sending. This stage performs
 * only reads: re-checking campaign ownership/pause, pacing, rate-limit windows,
 * and per-contact suppression. Side effects (re-enqueue, persistence) belong to
 * the orchestrator so the decision stays inspectable and side-effect free.
 */
export async function decideContinuation(args: {
  campaignId: string;
  sendRunId: string;
  email: PendingEmail;
  suppressAfterEmails: number;
  smtpSettings: SmtpSettings;
  rateLimitCounts: RateLimitCounts;
  rateLimitWindowStart: { hourAgo: Date; dayAgo: Date };
}): Promise<ContinuationDecision> {
  const { campaignId, sendRunId, email, suppressAfterEmails, smtpSettings, rateLimitCounts, rateLimitWindowStart } = args;

  // Re-check campaign status in case it was paused or a newer run took over.
  const freshCampaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!freshCampaign || freshCampaign.status === "paused" || freshCampaign.activeSendRunId !== sendRunId) {
    return { action: "stop" };
  }

  // Pacing: if the next send is scheduled in the future, re-enqueue with a
  // delay instead of blocking the worker thread.
  const nextSendTargetMs = freshCampaign.nextSendAt ? new Date(freshCampaign.nextSendAt).getTime() : Date.now();
  const waitMs = nextSendTargetMs - Date.now();
  if (waitMs > 500) {
    return {
      action: "reenqueue",
      delay: waitMs,
      newSendRunId: randomUUID(),
      rateLimitResumeAt: null,
    };
  }

  // Rate limit: re-enqueue with a delay computed from when the exceeded
  // window's oldest event expires.
  if (rateLimitCounts.sentLastHour >= smtpSettings.hourlyLimit || rateLimitCounts.sentLastDay >= smtpSettings.dailyLimit) {
    const resumeTimes: number[] = [];
    if (rateLimitCounts.sentLastHour >= smtpSettings.hourlyLimit) {
      const oldest = await prisma.deliveryEvent.findFirst({
        where: {
          campaignEmail: { campaign: { userId: freshCampaign.userId } },
          eventType: "sent",
          occurredAt: { gte: rateLimitWindowStart.hourAgo },
        },
        orderBy: { occurredAt: "asc" },
      });
      if (oldest) resumeTimes.push(oldest.occurredAt.getTime() + HOUR_MS + 1000);
    }
    if (rateLimitCounts.sentLastDay >= smtpSettings.dailyLimit) {
      const oldest = await prisma.deliveryEvent.findFirst({
        where: {
          campaignEmail: { campaign: { userId: freshCampaign.userId } },
          eventType: "sent",
          occurredAt: { gte: rateLimitWindowStart.dayAgo },
        },
        orderBy: { occurredAt: "asc" },
      });
      if (oldest) resumeTimes.push(oldest.occurredAt.getTime() + DAY_MS + 1000);
    }
    const rateLimitResumeAt = new Date(
      resumeTimes.length > 0 ? Math.max(...resumeTimes) : Date.now() + HOUR_MS
    );
    return {
      action: "reenqueue",
      delay: Math.max(0, rateLimitResumeAt.getTime() - Date.now()),
      newSendRunId: randomUUID(),
      rateLimitResumeAt,
    };
  }

  // Per-contact send cap — skip this email without sending.
  if (email.contact.emailsSentCount >= suppressAfterEmails) {
    return { action: "skip", reason: "Contact suppressed: send limit reached" };
  }

  return { action: "send" };
}

// ---------------------------------------------------------------------------
// Stage 3: Send one email
// ---------------------------------------------------------------------------

/**
 * Build the tracked HTML body and dispatch a single message via SMTP. Never
 * throws — a delivery failure is returned as a `failed` outcome so persistence
 * can record the error reason deterministically.
 */
export async function sendOneEmail(
  email: PendingEmail,
  transporter: nodemailer.Transporter,
  smtpSettings: SmtpSettings
): Promise<SendOutcome> {
  try {
    const appUrl = process.env.AUTH_URL ?? "";
    const htmlBody = (email.body ?? "").replace(/\n/g, "<br>");
    const pixelUrl = `${appUrl}/api/track/${email.id}?s=${signEmailId(email.id)}`;

    // nodemailer's `encoding: "base64"` on an alternatives entry means
    // "this content string is already base64-encoded" — it calls
    // Buffer.from(content, "base64") internally. Passing a plain HTML string
    // with encoding:"base64" would produce garbage bytes (CN-QP-001).
    // Pre-encoding the HTML as base64 makes the contract explicit: nodemailer
    // decodes it to the original bytes and then sends the part with
    // Content-Transfer-Encoding: base64, which avoids QP encoding '=' as '=3D'
    // in the tracking pixel URL.
    const htmlContent =
      `<img src="${pixelUrl}" width="1" height="1" alt="" border="0" style="height:1px!important;width:1px!important;border-width:0!important;margin:0!important;padding:0!important" />` +
      `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${htmlBody}</div>`;
    const htmlBase64 = Buffer.from(htmlContent, "utf-8").toString("base64");

    await transporter.sendMail({
      from: `"${smtpSettings.fromName ?? ""}" <${smtpSettings.fromEmail}>`,
      replyTo: smtpSettings.replyTo ?? undefined,
      to: email.contact.email,
      subject: email.subject ?? "(No subject)",
      text: email.body ?? "",
      alternatives: [{ contentType: "text/html; charset=utf-8", encoding: "base64", content: htmlBase64 }],
    });

    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err : new Error("Unknown error") };
  }
}

// ---------------------------------------------------------------------------
// Stage 4: Persist outcome (transaction-backed)
// ---------------------------------------------------------------------------

/**
 * Persist a successful send inside a single transaction: mark the email sent,
 * record the delivery event, increment the contact's send count (and suppress
 * it when the projected count reaches the threshold), and bump the campaign's
 * sent counter. Atomicity prevents counters, email state, and delivery events
 * from diverging when an intermediate write fails.
 */
export async function persistSendSuccess(
  campaignId: string,
  email: PendingEmail,
  suppressAfterEmails: number
): Promise<void> {
  const now = new Date();
  const projectedNewCount = email.contact.emailsSentCount + 1;
  await prisma.$transaction(async (tx) => {
    await tx.campaignEmail.update({
      where: { id: email.id },
      data: { status: "sent", sentAt: now },
    });
    await tx.deliveryEvent.create({
      data: { campaignEmailId: email.id, eventType: "sent", occurredAt: now },
    });
    // Increment contact sent count atomically and auto-suppress when the limit
    // is reached. DB-side increment stays correct under concurrent workers
    // (avoids read-modify-write races that could bypass the suppression threshold).
    await tx.contact.update({
      where: { id: email.contact.id },
      data: {
        emailsSentCount: { increment: 1 },
        ...(projectedNewCount >= suppressAfterEmails ? { status: "suppressed" } : {}),
      },
    });
    await tx.campaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: 1 } },
    });
  });
}

/**
 * Persist a failed send inside a single transaction: mark the email failed
 * with the error reason and retry bump, and increment the campaign's failed
 * counter. The bounce notification is emitted separately (debounced) so a
 * notification failure cannot roll back the delivery state.
 */
export async function persistSendFailure(
  campaignId: string,
  email: PendingEmail,
  error: Error
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.campaignEmail.update({
      where: { id: email.id },
      data: {
        status: "failed",
        errorReason: error.message,
        retryCount: { increment: 1 },
      },
    });
    await tx.campaign.update({
      where: { id: campaignId },
      data: { failedCount: { increment: 1 } },
    });
  });
}

/**
 * Persist a skipped email (contact suppressed) inside a single transaction:
 * mark the email skipped and bump the campaign's skipped counter atomically.
 */
export async function persistSkippedEmail(campaignId: string, email: PendingEmail): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.campaignEmail.update({
      where: { id: email.id },
      data: { status: "skipped", errorReason: "Contact suppressed: send limit reached" },
    });
    await tx.campaign.update({
      where: { id: campaignId },
      data: { skippedCount: { increment: 1 } },
    });
  });
}

/**
 * NOTIF-006: emit at most one bounce notification per campaign per hour. The
 * debounce read + create happen outside the delivery transaction so a
 * notification-side issue never rolls back delivery state.
 */
export async function recordBounceNotificationIfAllowed(
  userId: string,
  campaignId: string,
  campaignName: string,
  prefs: NotifPrefs
): Promise<void> {
  if (!prefs.email_bounced) return;
  const oneHourAgo = new Date(Date.now() - HOUR_MS);
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
        body: `A delivery failed for campaign "${campaignName}".`,
        entityType: "campaign",
        entityId: campaignId,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers: interval scheduling and run finalization
// ---------------------------------------------------------------------------

/**
 * Add a continuation job to the send queue with the given delay. Each
 * continuation runs under a fresh `sendRunId` that the next iteration must
 * claim, so a stale run never clobbers a newer owner.
 */
export async function reenqueueSend(
  campaignId: string,
  userId: string,
  sendRunId: string,
  delay: number
): Promise<void> {
  await getSendQueue().add(
    "send",
    { campaignId, userId, sendRunId },
    {
      delay,
      jobId: `send-${campaignId}-${sendRunId}`,
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    }
  );
}

export type IntervalResult = {
  nextSendAtUpdate: { nextSendAt: Date | null };
  reenqueue: boolean;
  newSendRunId?: string;
  delayMs?: number;
};

/**
 * Compute the inter-send interval for the current email and decide whether the
 * orchestrator should re-enqueue a continuation job instead of looping inline.
 * Returns the campaign `nextSendAt` update to apply regardless (so the UI
 * reflects the scheduled next send even in burst mode).
 */
export function applyInterval(
  campaign: SendCampaignRef,
  index: number,
  totalEmails: number
): IntervalResult {
  const interval = campaign.intervalType === "random"
    ? Math.floor(Math.random() * (campaign.maxInterval - campaign.minInterval + 1) + campaign.minInterval)
    : campaign.minInterval;
  const hasMorePendingEmails = index < totalEmails - 1;
  const intervalMs = interval * 60 * 1000;
  const nextSendAtUpdate = {
    nextSendAt: hasMorePendingEmails ? new Date(Date.now() + intervalMs) : null,
  };
  if (hasMorePendingEmails && intervalMs > 500) {
    return {
      nextSendAtUpdate,
      reenqueue: true,
      newSendRunId: randomUUID(),
      delayMs: intervalMs,
    };
  }
  return { nextSendAtUpdate, reenqueue: false };
}

/**
 * Finalize the run: reconcile derived metrics, detect a stale run (a newer send
 * run took over), flip the campaign to its terminal/interim status, and emit
 * the completion notification when the user's preference allows it. Returns the
 * summary the worker hands back to BullMQ.
 */
export async function finalizeSendRun(args: {
  campaignId: string;
  sendRunId: string;
  userId: string;
  campaignName: string;
  sentCount: number;
  failCount: number;
  rateLimitResumeAt: Date | null;
  reEnqueuedContinuation: boolean;
  prefs: NotifPrefs;
}): Promise<{ sentCount: number; failCount: number; finalStatus: string }> {
  const { campaignId, sendRunId, userId, campaignName, sentCount, failCount, rateLimitResumeAt, reEnqueuedContinuation, prefs } = args;

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

  // Stay "sending" when a continuation job was enqueued (interval or rate-limit
  // wait); only flip to "paused" when the campaign truly needs manual action.
  const finalStatus = remaining === 0 ? "completed" : reEnqueuedContinuation ? "sending" : "paused";

  await prisma.campaign.updateMany({
    where: { id: campaignId, activeSendRunId: sendRunId },
    data: {
      status: finalStatus,
      activeSendRunId: null,
      sentCount: emailMetrics.sentCount,
      failedCount: emailMetrics.failedCount,
      skippedCount: emailMetrics.skippedCount,
      pendingCount: emailMetrics.pendingCount,
      // For rate-limit: use the computed resume time.
      // For completion or pause: clear it.
      // For interval re-enqueue: leave it as-is (already set in the loop above).
      ...(rateLimitResumeAt !== null
        ? { nextSendAt: rateLimitResumeAt }
        : finalStatus === "sending"
        ? {}
        : { nextSendAt: null }),
      ...(finalStatus === "completed" ? { completedAt: new Date() } : {}),
    },
  });

  // NOTIF-003: respect campaign_complete preference
  if (finalStatus === "completed" && prefs.campaign_complete) {
    await prisma.notification.create({
      data: {
        userId,
        type: "campaign.sending_complete",
        title: `"${campaignName}" finished sending`,
        body: `${emailMetrics.sentCount} email${emailMetrics.sentCount !== 1 ? "s" : ""} delivered successfully.${emailMetrics.failedCount > 0 ? ` ${emailMetrics.failedCount} failed.` : ""}`,
        entityType: "campaign",
        entityId: campaignId,
      },
    });
  }

  return { sentCount, failCount, finalStatus };
}

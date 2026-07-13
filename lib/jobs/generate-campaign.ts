import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { generateEmail, buildSystemPrompt, buildUserPrompt, PROVIDER_BASE_URLS, DEFAULT_MODELS, type AiProviderName } from "@/lib/ai";
import { QUEUE_NAMES } from "./queue";
import { getNotifPrefs } from "./notification-prefs";
import { assertSafeHost } from "@/lib/ssrf";

export interface GenerateCampaignJobData {
  campaignId: string;
  userId: string;
}


export async function processGenerate(job: Job<GenerateCampaignJobData>) {
  const { campaignId, userId } = job.data;

  try {
    return await _processGenerate(job, campaignId, userId);
  } catch (err) {
    // Ensure campaign never stays stuck in "generating" if an unexpected error occurs
    await prisma.campaign.updateMany({
      where: { id: campaignId, status: "generating" },
      data: { status: "failed" },
    }).catch(() => {}); // best-effort — don't mask the original error
    throw err;
  }
}

async function _processGenerate(job: Job<GenerateCampaignJobData>, campaignId: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  // Mark as generating
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "generating" },
  });

  // Fetch notification prefs once for the whole job
  const prefs = await getNotifPrefs(userId, ["ai_email_ready", "ai_email_error"]);

  // Get eligible contacts from list
  const members = await prisma.listMember.findMany({
    where: {
      listId: campaign.listId,
      contact: { userId, status: "subscribed" },
    },
    include: {
      contact: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          company: true,
          jobTitle: true,
          aiHint: true,
          customFields: true,
        },
      },
    },
  });

  // Resolve AI config
  const requestedProviderName = (campaign.aiProvider ?? null) as string | null;
  const aiConfig = await prisma.aiConfig.findFirst({
    where: {
      userId,
      ...(requestedProviderName ? { provider: requestedProviderName as AiProviderName } : {}),
      status: "connected",
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!aiConfig) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "failed" },
    });
    throw new Error("No connected AI config found");
  }

  const providerName = aiConfig.provider as string;

  if (!aiConfig.encryptedApiKey) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "failed" } });
    throw new Error("AI config has no API key stored");
  }
  const provider = providerName as AiProviderName;
  const apiKey = decrypt(aiConfig.encryptedApiKey);
  const model = campaign.aiModel ?? aiConfig.model ?? DEFAULT_MODELS[provider] ?? "gpt-4o-mini";
  const baseUrl = aiConfig.baseUrl ?? PROVIDER_BASE_URLS[provider] ?? undefined;

  // Re-validate a user-supplied AI base URL at generation time (not just at
  // save time) to close the DNS-rebinding / TOCTOU window (CN-005, CWE-918).
  // Built-in provider URLs (PROVIDER_BASE_URLS) are trusted and skip the check.
  if (aiConfig.baseUrl) {
    const hostCheck = await assertSafeHost(aiConfig.baseUrl);
    if (!hostCheck.ok) {
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "failed" } });
      throw new Error(`AI base URL rejected: ${hostCheck.reason ?? "unsafe host"}`);
    }
  }

  const systemPrompt = buildSystemPrompt({
    goal: campaign.goal,
    product: campaign.product,
    cta: campaign.cta,
    tone: campaign.tone,
    language: campaign.language,
    emailLength: campaign.emailLength,
    basePrompt: campaign.systemPrompt,
  });

  // Pre-fetch all existing emails for this campaign to avoid N+1 lookups in the loop.
  const existingEmails = await prisma.campaignEmail.findMany({
    where: { campaignId },
    select: { contactId: true, status: true, approvalStatus: true },
  });
  const existingByContact = new Map(existingEmails.map((e) => [e.contactId, e]));

  let successCount = 0;
  let failCount = 0;

  for (const member of members) {
    const { contact } = member;

    // Stop processing if generation was cancelled externally via the UI
    const fresh = await prisma.campaign.findFirst({ where: { id: campaignId }, select: { status: true } });
    if (fresh?.status !== "generating") return { successCount, failCount };

    // Skip if already generated or deliberately skipped by the user
    const existing = existingByContact.get(contact.id);
    if (existing && (existing.status !== "pending" || existing.approvalStatus === "skipped")) continue;

    try {
      const userPrompt = buildUserPrompt({
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
        jobTitle: contact.jobTitle,
        aiHint: contact.aiHint,
        customFields: contact.customFields as Record<string, string> | null,
      });

      const result = await generateEmail({
        provider,
        model,
        apiKey,
        baseUrl,
        systemPrompt,
        userPrompt,
      });

      await prisma.campaignEmail.upsert({
        where: { campaignId_contactId: { campaignId, contactId: contact.id } },
        create: {
          campaignId,
          contactId: contact.id,
          subject: result.subject,
          body: result.body,
          personalizationNotes: result.personalizationNotes,
          promptUsed: userPrompt,
          modelUsed: model,
          generatedAt: new Date(),
          status: "generated",
          approvalStatus: "pending",
        },
        update: {
          subject: result.subject,
          body: result.body,
          personalizationNotes: result.personalizationNotes,
          promptUsed: userPrompt,
          modelUsed: model,
          generatedAt: new Date(),
          status: "generated",
          approvalStatus: "pending",
        },
      });

      successCount++;
    } catch (err) {
      // If the AI service itself is unreachable/timed out, abort early — no point retrying all contacts
      if (isServiceError(err)) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: "failed" },
        });
        if (prefs.ai_email_error) {
          await prisma.notification.create({
            data: {
              userId,
              type: "campaign.generation_failed",
              title: "AI service unreachable",
              body: `Generation stopped for "${campaign.name}": the AI service is unavailable or timed out. Check your AI configuration and try again.`,
              entityType: "campaign",
              entityId: campaignId,
            },
          });
        }
        return { successCount, failCount };
      }

      await prisma.campaignEmail.upsert({
        where: { campaignId_contactId: { campaignId, contactId: contact.id } },
        create: {
          campaignId,
          contactId: contact.id,
          status: "failed",
          approvalStatus: "pending",
          errorReason: err instanceof Error ? err.message : "Unknown error",
        },
        update: {
          status: "failed",
          errorReason: err instanceof Error ? err.message : "Unknown error",
        },
      });
      failCount++;
    }

    // Report progress
    await job.updateProgress(Math.round(((successCount + failCount) / members.length) * 100));
  }

  if (members.length === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "failed" },
    });
    if (prefs.ai_email_error) {
      await prisma.notification.create({
        data: {
          userId,
          type: "campaign.generation_failed",
          title: "Generation failed",
          body: `No eligible contacts found in the list for campaign "${campaign.name}".`,
          entityType: "campaign",
          entityId: campaignId,
        },
      });
    }
    return { successCount: 0, failCount: 0 };
  }

  // Transition campaign to pending_review — only if we still own the run
  // (a concurrent cancel may have already changed the status, in which case
  // updateMany is a safe no-op rather than overwriting the cancel).
  await prisma.campaign.updateMany({
    where: { id: campaignId, status: "generating" },
    data: {
      status: "pending_review",
      totalEmails: members.length,
      pendingCount: successCount,
      failedCount: failCount,
    },
  });

  if (prefs.ai_email_ready) {
    await prisma.notification.create({
      data: {
        userId,
        type: "campaign.generation_complete",
        title: `"${campaign.name}" is ready for review`,
        body: `${successCount} email${successCount !== 1 ? "s" : ""} generated successfully. Go review and approve them before sending.`,
        entityType: "campaign",
        entityId: campaignId,
      },
    });
  }

  return { successCount, failCount };
}

function isServiceError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const name = err.name.toLowerCase();

  // OpenAI / Anthropic SDKs expose a .status property on API errors.
  // 429 (rate limit), 401/403 (auth) and 5xx all mean the whole batch
  // is unrecoverable — abort early rather than failing every contact.
  const status = (err as { status?: number }).status;
  if (typeof status === "number" && (status >= 500 || status === 429 || status === 401 || status === 403)) return true;

  return (
    name === "aborterror" || // AbortSignal.timeout fired
    name === "timeouterror" ||
    name === "apiconnectionerror" ||
    name === "apiconnectiontimeouterror" ||
    name === "apiuseraborderror" ||
    name === "internalservererror" ||
    name === "autherror" ||
    name === "authenticationerror" ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("service unavailable") ||
    msg.includes("bad gateway") ||
    msg.includes("gateway timeout") ||
    msg.includes("401") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid api key") ||
    msg.includes("authentication")
  );
}

export function startGenerateWorker() {
  const worker = new Worker(QUEUE_NAMES.generate, processGenerate, {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
    concurrency: 2,
    // Generous lock window for large contact lists; BullMQ auto-renews while active
    lockDuration: 300_000, // 5 min
    lockRenewTime: 120_000, // renew every 2 min
  });

  worker.on("failed", (job, err) => {
    console.error(`Generate job ${job?.id} failed:`, err.message);
  });

  return worker;
}

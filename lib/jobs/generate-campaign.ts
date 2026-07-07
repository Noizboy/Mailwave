import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { generateEmail, buildSystemPrompt, buildUserPrompt, PROVIDER_BASE_URLS, DEFAULT_MODELS, type AiProviderName } from "@/lib/ai";
import { QUEUE_NAMES } from "./queue";
import { getNotifPrefs } from "./notification-prefs";

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
  const providerName = (campaign.aiProvider ?? null) as string | null;
  const aiConfig = await prisma.aiConfig.findFirst({
    where: {
      userId,
      ...(providerName ? { provider: providerName as AiProviderName } : {}),
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

  const provider = aiConfig.provider as AiProviderName;
  const isCodex = provider === "codex";

  if (!isCodex && !aiConfig.encryptedApiKey) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "failed" } });
    throw new Error("AI config has no API key stored");
  }
  const apiKey = !isCodex ? decrypt(aiConfig.encryptedApiKey!) : "";
  const model = campaign.aiModel ?? aiConfig.model ?? DEFAULT_MODELS[provider] ?? "gpt-4o-mini";
  const baseUrl = aiConfig.baseUrl ?? PROVIDER_BASE_URLS[provider] ?? undefined;

  const systemPrompt = buildSystemPrompt({
    goal: campaign.goal,
    product: campaign.product,
    cta: campaign.cta,
    tone: campaign.tone,
    language: campaign.language,
    emailLength: campaign.emailLength,
    basePrompt: campaign.systemPrompt,
  });

  let successCount = 0;
  let failCount = 0;

  for (const member of members) {
    const { contact } = member;

    // Skip if already generated
    const existing = await prisma.campaignEmail.findUnique({
      where: { campaignId_contactId: { campaignId, contactId: contact.id } },
    });
    if (existing && existing.status !== "pending") continue;

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
        userId: isCodex ? userId : undefined,
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

  // Transition campaign to pending_review
  await prisma.campaign.update({
    where: { id: campaignId },
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
        title: "Generation complete",
        body: `${successCount} email${successCount !== 1 ? "s" : ""} generated for "${campaign.name}". Ready for review.`,
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

  // OpenAI / Anthropic SDKs expose a .status property on API errors
  const status = (err as { status?: number }).status;
  if (typeof status === "number" && status >= 500) return true;

  return (
    name === "aborterror" || // AbortSignal.timeout fired
    name === "timeouterror" ||
    name === "apiconnectionerror" ||
    name === "apiconnectiontimeouterror" ||
    name === "internalservererror" ||
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
  });

  worker.on("failed", (job, err) => {
    console.error(`Generate job ${job?.id} failed:`, err.message);
  });

  return worker;
}

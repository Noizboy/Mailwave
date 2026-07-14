import type { PrismaClient } from "../../app/generated/prisma/client";
import type { CampaignSeed, CampaignEmailSeed } from "./types";
import type { SeededContact } from "./contacts";
import { DAY, HOUR, fillTemplate } from "./shared";
import { ACTIVE_EMAIL_BODIES, ACTIVE_EMAIL_SUBJECTS } from "./fixtures";

// Campaign and campaign-email persistence. Campaign ids are stable; campaign
// emails are keyed by (campaignId, contactId) so re-runs reconcile rows rather
// than duplicate them.

export type SeededCampaigns = Record<string, Awaited<ReturnType<PrismaClient["campaign"]["upsert"]>>>;

export async function seedCampaigns(prisma: PrismaClient, userId: string, campaignSeeds: CampaignSeed[]) {
  const campaigns: SeededCampaigns = {};

  for (const campaignSeed of campaignSeeds) {
    const campaignData = {
      name: campaignSeed.name,
      listId: campaignSeed.listId,
      goal: campaignSeed.goal,
      product: campaignSeed.product,
      cta: campaignSeed.cta,
      tone: campaignSeed.tone,
      language: campaignSeed.language,
      emailLength: campaignSeed.emailLength,
      systemPrompt: campaignSeed.systemPrompt,
      status: campaignSeed.status,
      minInterval: campaignSeed.minInterval,
      maxInterval: campaignSeed.maxInterval,
      dailyLimit: campaignSeed.dailyLimit,
      hourlyLimit: campaignSeed.hourlyLimit,
      totalEmails: campaignSeed.totalEmails,
      sentCount: campaignSeed.sentCount,
      failedCount: campaignSeed.failedCount,
      pendingCount: campaignSeed.pendingCount,
      startedAt: campaignSeed.startedAt,
      completedAt: campaignSeed.completedAt,
    };

    campaigns[campaignSeed.id] = await prisma.campaign.upsert({
      where: { id: campaignSeed.id },
      update: campaignData,
      create: {
        id: campaignSeed.id,
        userId,
        ...campaignData,
      },
    });
  }

  return campaigns;
}

export async function upsertCampaignEmail(
  prisma: PrismaClient,
  campaignId: string,
  contactId: string,
  emailSeed: CampaignEmailSeed,
) {
  await prisma.campaignEmail.upsert({
    where: { campaignId_contactId: { campaignId, contactId } },
    update: emailSeed,
    create: {
      campaignId,
      contactId,
      ...emailSeed,
    },
  });
}

export async function seedActiveCampaignEmails(
  prisma: PrismaClient,
  campaignId: string,
  contacts: SeededContact["contact"][],
  sentCount: number,
  now: number,
) {
  for (const [index, contact] of contacts.entries()) {
    const isSent = index < sentCount;
    const emailSeed: CampaignEmailSeed = {
      subject: fillTemplate(ACTIVE_EMAIL_SUBJECTS[index % ACTIVE_EMAIL_SUBJECTS.length], contact),
      body: fillTemplate(ACTIVE_EMAIL_BODIES[index % ACTIVE_EMAIL_BODIES.length], contact),
      status: isSent ? "sent" : "pending",
      approvalStatus: isSent ? "approved" : "pending",
      generatedAt: isSent ? new Date(now - 2 * DAY) : null,
      sentAt: isSent ? new Date(now - (index + 1) * HOUR) : null,
      personalizationNotes: `Email for ${contact.jobTitle || "their role"}`,
    };

    await upsertCampaignEmail(prisma, campaignId, contact.id, emailSeed);
  }
}

export async function seedCompletedCampaignEmails(
  prisma: PrismaClient,
  campaignId: string,
  contacts: SeededContact["contact"][],
  now: number,
) {
  for (const contact of contacts) {
    await upsertCampaignEmail(prisma, campaignId, contact.id, {
      subject: `Happy Holidays ${contact.firstName || ""}!`,
      body: `Hi ${contact.firstName || "there"}, wishing you a wonderful holiday season! Check out what we have planned for 2025.`,
      status: "sent",
      approvalStatus: "approved",
      generatedAt: new Date(now - 30 * DAY),
      sentAt: new Date(now - 25 * DAY),
    });
  }
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findFirst: vi.fn(), update: vi.fn() },
    listMember: { findMany: vi.fn() },
    aiConfig: { findFirst: vi.fn() },
    campaignEmail: { findUnique: vi.fn(), upsert: vi.fn() },
    notification: { create: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn(() => "decrypted-api-key"),
}));

vi.mock("@/lib/ai", () => ({
  generateEmail: vi.fn(),
  buildSystemPrompt: vi.fn(() => "system prompt"),
  buildUserPrompt: vi.fn(() => "user prompt"),
}));

import { prisma } from "@/lib/prisma";
import { generateEmail } from "@/lib/ai";
import { processGenerate, type GenerateCampaignJobData } from "./generate-campaign";

const mocked = vi.mocked;

function fakeJob(): Job<GenerateCampaignJobData> {
  return {
    data: { campaignId: "camp-1", userId: "user-1" },
    updateProgress: vi.fn(),
  } as unknown as Job<GenerateCampaignJobData>;
}

const baseCampaign = {
  id: "camp-1",
  userId: "user-1",
  name: "Q3 Outreach",
  listId: "list-1",
  goal: "Book demos",
  product: null,
  cta: null,
  tone: null,
  language: "English",
  emailLength: "medium",
  extraInstructions: null,
  aiProvider: null,
  aiModel: null,
  status: "draft",
};

const aiConfig = {
  id: "ai-1",
  userId: "user-1",
  provider: "openai",
  encryptedApiKey: "encrypted",
  baseUrl: null,
  status: "connected",
};

function member(contactId: string, email: string) {
  return {
    contact: {
      id: contactId,
      email,
      firstName: "Test",
      lastName: null,
      company: null,
      jobTitle: null,
      aiHint: null,
      customFields: null,
    },
  };
}

const generation = {
  subject: "Hello",
  body: "Body",
  personalizationNotes: "Notes",
};

describe("processGenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked(prisma.campaign.findFirst).mockResolvedValue(baseCampaign as never);
    mocked(prisma.campaign.update).mockResolvedValue({} as never);
    mocked(prisma.aiConfig.findFirst).mockResolvedValue(aiConfig as never);
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue(null as never);
    mocked(prisma.campaignEmail.upsert).mockResolvedValue({} as never);
    mocked(prisma.notification.create).mockResolvedValue({} as never);
    // Default: empty rows → use defaults (ai_email_ready: false, ai_email_error: true)
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([] as never);
  });

  it("throws when the campaign does not exist", async () => {
    mocked(prisma.campaign.findFirst).mockResolvedValue(null as never);
    await expect(processGenerate(fakeJob())).rejects.toThrow("Campaign camp-1 not found");
  });

  it("marks the campaign failed when no connected AI config exists", async () => {
    mocked(prisma.listMember.findMany).mockResolvedValue([member("c1", "a@b.com")] as never);
    mocked(prisma.aiConfig.findFirst).mockResolvedValue(null as never);

    await expect(processGenerate(fakeJob())).rejects.toThrow("No connected AI config found");
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: "camp-1" },
      data: { status: "failed" },
    });
  });

  it("generates one email per eligible contact and transitions to pending_review", async () => {
    mocked(prisma.listMember.findMany).mockResolvedValue([
      member("c1", "a@b.com"),
      member("c2", "c@d.com"),
    ] as never);
    mocked(generateEmail).mockResolvedValue(generation);

    const result = await processGenerate(fakeJob());

    expect(result).toEqual({ successCount: 2, failCount: 0 });
    expect(prisma.campaignEmail.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.campaign.update).toHaveBeenLastCalledWith({
      where: { id: "camp-1" },
      data: {
        status: "pending_review",
        totalEmails: 2,
        pendingCount: 2,
        failedCount: 0,
      },
    });
    // ai_email_ready defaults to false — notification skipped by default
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("records a per-contact failure without failing the batch", async () => {
    mocked(prisma.listMember.findMany).mockResolvedValue([
      member("c1", "a@b.com"),
      member("c2", "c@d.com"),
    ] as never);
    mocked(generateEmail)
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce(generation);

    const result = await processGenerate(fakeJob());

    expect(result).toEqual({ successCount: 1, failCount: 1 });
    expect(prisma.campaignEmail.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "failed", errorReason: "rate limited" }),
      })
    );
    // Batch still completes into review with the failure counted
    expect(prisma.campaign.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending_review", failedCount: 1 }),
      })
    );
  });

  it("skips contacts whose email was already generated", async () => {
    mocked(prisma.listMember.findMany).mockResolvedValue([member("c1", "a@b.com")] as never);
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({ status: "generated" } as never);

    const result = await processGenerate(fakeJob());

    expect(generateEmail).not.toHaveBeenCalled();
    expect(prisma.campaignEmail.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ successCount: 0, failCount: 0 });
  });

  it("fails the campaign and notifies when the list has no eligible contacts", async () => {
    mocked(prisma.listMember.findMany).mockResolvedValue([] as never);

    const result = await processGenerate(fakeJob());

    expect(result).toEqual({ successCount: 0, failCount: 0 });
    expect(prisma.campaign.update).toHaveBeenLastCalledWith({
      where: { id: "camp-1" },
      data: { status: "failed" },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "campaign.generation_failed" }),
      })
    );
  });

  it("reports progress after each contact", async () => {
    mocked(prisma.listMember.findMany).mockResolvedValue([
      member("c1", "a@b.com"),
      member("c2", "c@d.com"),
    ] as never);
    mocked(generateEmail).mockResolvedValue(generation);

    const job = fakeJob();
    await processGenerate(job);

    expect(job.updateProgress).toHaveBeenCalledWith(50);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  // NOTIF-004: ai_email_ready / ai_email_error preferences
  it("creates the generation_complete notification when ai_email_ready pref is on", async () => {
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { eventType: "ai_email_ready", inApp: true },
    ] as never);
    mocked(prisma.listMember.findMany).mockResolvedValue([member("c1", "a@b.com")] as never);
    mocked(generateEmail).mockResolvedValue(generation);

    await processGenerate(fakeJob());

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "campaign.generation_complete" }) })
    );
  });

  it("skips the generation_failed notification when ai_email_error pref is off", async () => {
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { eventType: "ai_email_error", inApp: false },
    ] as never);
    mocked(prisma.listMember.findMany).mockResolvedValue([] as never);

    await processGenerate(fakeJob());

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("creates the generation_failed notification when ai_email_error pref is on (default)", async () => {
    mocked(prisma.listMember.findMany).mockResolvedValue([] as never);

    await processGenerate(fakeJob());

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "campaign.generation_failed" }) })
    );
  });
});

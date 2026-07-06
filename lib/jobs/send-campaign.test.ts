import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

const sendMail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    smtpConfig: { findUnique: vi.fn() },
    sendingAccount: { findUnique: vi.fn() },
    campaignEmail: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    deliveryEvent: { count: vi.fn(), create: vi.fn() },
    contact: { update: vi.fn() },
    notification: { create: vi.fn(), findFirst: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn(() => "smtp-password"),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

import { prisma } from "@/lib/prisma";
import { processSend, type SendCampaignJobData } from "./send-campaign";

const mocked = vi.mocked;

function fakeJob(): Job<SendCampaignJobData> {
  return {
    data: { campaignId: "camp-1", userId: "user-1" },
    updateProgress: vi.fn(),
  } as unknown as Job<SendCampaignJobData>;
}

const baseCampaign = {
  id: "camp-1",
  userId: "user-1",
  name: "Q3 Outreach",
  status: "ready_to_send",
  startedAt: null,
  intervalType: "fixed",
  minInterval: 0, // keeps the inter-send setTimeout at 0ms in tests
  maxInterval: 0,
};

const smtpConfig = {
  userId: "user-1",
  host: "smtp.test",
  port: 587,
  username: "sender",
  encryptedPassword: "encrypted",
  encryption: "tls",
  fromName: "Sender",
  fromEmail: "sender@test.com",
  replyTo: null,
  hourlyLimit: 100,
  dailyLimit: 1000,
  status: "connected",
};

function approvedEmail(id: string, contactId: string, emailsSentCount = 0) {
  return {
    id,
    subject: "Hello",
    body: "Body",
    contact: {
      id: contactId,
      email: `${contactId}@test.com`,
      firstName: "T",
      lastName: null,
      emailsSentCount,
    },
  };
}

describe("processSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({});
    mocked(prisma.campaign.findFirst).mockResolvedValue(baseCampaign as never);
    mocked(prisma.campaign.findUnique).mockResolvedValue({ ...baseCampaign, status: "sending" } as never);
    mocked(prisma.campaign.update).mockResolvedValue({} as never);
    mocked(prisma.smtpConfig.findUnique).mockResolvedValue(smtpConfig as never);
    mocked(prisma.sendingAccount.findUnique).mockResolvedValue(null as never);
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([] as never);
    mocked(prisma.campaignEmail.update).mockResolvedValue({} as never);
    mocked(prisma.campaignEmail.count).mockResolvedValue(0 as never);
    mocked(prisma.deliveryEvent.count).mockResolvedValue(0 as never);
    mocked(prisma.deliveryEvent.create).mockResolvedValue({} as never);
    mocked(prisma.contact.update).mockResolvedValue({} as never);
    mocked(prisma.notification.create).mockResolvedValue({} as never);
    mocked(prisma.notification.findFirst).mockResolvedValue(null as never);
    // Default: all prefs at their documented defaults (campaign_complete: true, campaign_error: true, email_bounced: true)
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([] as never);
  });

  it("proceeds normally when campaign status is paused (resume flow)", async () => {
    mocked(prisma.campaign.findFirst).mockResolvedValue({ ...baseCampaign, status: "paused" } as never);

    const result = await processSend(fakeJob());

    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "sending" }) })
    );
    expect(result).toMatchObject({ finalStatus: expect.any(String) });
  });

  it("skips without changing status when campaign is not ready (e.g. pending)", async () => {
    mocked(prisma.campaign.findFirst).mockResolvedValue({ ...baseCampaign, status: "pending" } as never);

    const result = await processSend(fakeJob());

    expect(result).toMatchObject({ skipped: true });
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it("fails the campaign when SMTP is not connected", async () => {
    mocked(prisma.smtpConfig.findUnique).mockResolvedValue({ ...smtpConfig, status: "failed" } as never);

    await expect(processSend(fakeJob())).rejects.toThrow("SMTP not configured or not connected");
    expect(prisma.campaign.update).toHaveBeenLastCalledWith({
      where: { id: "camp-1" },
      data: { status: "failed" },
    });
  });

  it("queries only approved, unsent emails excluding suppressed contacts", async () => {
    await processSend(fakeJob());

    expect(prisma.campaignEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approvalStatus: "approved",
          status: { in: ["generated", "approved"] },
          contact: { status: { not: "suppressed" } },
        }),
      })
    );
  });

  it("sends approved emails, records delivery events, and completes the campaign", async () => {
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([
      approvedEmail("e1", "c1"),
      approvedEmail("e2", "c2"),
    ] as never);

    const result = await processSend(fakeJob());

    expect(result).toEqual({ sentCount: 2, failCount: 0, finalStatus: "completed" });
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "c1@test.com", subject: "Hello" })
    );
    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { emailsSentCount: 1 },
    });
    expect(prisma.campaign.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "completed",
          sentCount: { increment: 2 },
          completedAt: expect.any(Date),
        }),
      })
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "campaign.sending_complete" }),
      })
    );
  });

  it("stops sending when the hourly limit is reached and leaves the campaign paused", async () => {
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([approvedEmail("e1", "c1")] as never);
    mocked(prisma.deliveryEvent.count).mockResolvedValue(100 as never); // == hourlyLimit
    mocked(prisma.campaignEmail.count).mockResolvedValue(1 as never); // still remaining

    const result = await processSend(fakeJob());

    expect(sendMail).not.toHaveBeenCalled();
    expect(result).toEqual({ sentCount: 0, failCount: 0, finalStatus: "paused" });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("skips contacts that hit the per-contact send cap", async () => {
    mocked(prisma.sendingAccount.findUnique).mockResolvedValue({ suppressAfterEmails: 3 } as never);
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([
      approvedEmail("e1", "c1", 3), // at cap → skipped
      approvedEmail("e2", "c2", 0),
    ] as never);

    const result = await processSend(fakeJob());

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(prisma.campaignEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: expect.objectContaining({ status: "skipped" }),
      })
    );
    expect(result.sentCount).toBe(1);
  });

  it("auto-suppresses contact when send count reaches the limit", async () => {
    mocked(prisma.sendingAccount.findUnique).mockResolvedValue({ suppressAfterEmails: 3 } as never);
    // emailsSentCount is 2, sending this one brings it to 3 → suppress
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([
      approvedEmail("e1", "c1", 2),
    ] as never);

    await processSend(fakeJob());

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { emailsSentCount: 3, status: "suppressed" },
    });
  });

  it("does not suppress contact when send count is below the limit", async () => {
    mocked(prisma.sendingAccount.findUnique).mockResolvedValue({ suppressAfterEmails: 3 } as never);
    // emailsSentCount is 1, sending brings it to 2 → still subscribed
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([
      approvedEmail("e1", "c1", 1),
    ] as never);

    await processSend(fakeJob());

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { emailsSentCount: 2 },
    });
  });

  it("records a failed send and keeps processing", async () => {
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([
      approvedEmail("e1", "c1"),
      approvedEmail("e2", "c2"),
    ] as never);
    sendMail.mockRejectedValueOnce(new Error("connection refused")).mockResolvedValueOnce({});

    const result = await processSend(fakeJob());

    expect(result.sentCount).toBe(1);
    expect(result.failCount).toBe(1);
    expect(prisma.campaignEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: expect.objectContaining({
          status: "failed",
          errorReason: "connection refused",
          retryCount: { increment: 1 },
        }),
      })
    );
  });

  it("stops mid-run when the campaign is paused between sends", async () => {
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([
      approvedEmail("e1", "c1"),
      approvedEmail("e2", "c2"),
    ] as never);
    mocked(prisma.campaign.findUnique)
      .mockResolvedValueOnce({ ...baseCampaign, status: "sending" } as never)
      .mockResolvedValueOnce({ ...baseCampaign, status: "paused" } as never);
    mocked(prisma.campaignEmail.count).mockResolvedValue(1 as never);

    const result = await processSend(fakeJob());

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(result.finalStatus).toBe("paused");
  });

  // NOTIF-003: campaign_complete preference
  it("skips the sending_complete notification when campaign_complete pref is off", async () => {
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { eventType: "campaign_complete", inApp: false },
    ] as never);
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([approvedEmail("e1", "c1")] as never);

    const result = await processSend(fakeJob());

    expect(result.finalStatus).toBe("completed");
    expect(prisma.notification.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "campaign.sending_complete" }) })
    );
  });

  it("creates the sending_complete notification when campaign_complete pref is on (default)", async () => {
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([approvedEmail("e1", "c1")] as never);

    await processSend(fakeJob());

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "campaign.sending_complete" }) })
    );
  });

  // NOTIF-005: campaign_error notification on SMTP failure
  it("creates a sending_failed notification on SMTP failure when campaign_error pref is on (default)", async () => {
    mocked(prisma.smtpConfig.findUnique).mockResolvedValue({ ...smtpConfig, status: "failed" } as never);

    await expect(processSend(fakeJob())).rejects.toThrow();

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "campaign.sending_failed" }) })
    );
  });

  it("skips the sending_failed notification on SMTP failure when campaign_error pref is off", async () => {
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { eventType: "campaign_error", inApp: false },
    ] as never);
    mocked(prisma.smtpConfig.findUnique).mockResolvedValue({ ...smtpConfig, status: "failed" } as never);

    await expect(processSend(fakeJob())).rejects.toThrow();

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  // NOTIF-006: email_bounced notification with debounce
  it("creates an email_bounced notification on first bounce when pref is on (default)", async () => {
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([
      approvedEmail("e1", "c1"),
    ] as never);
    sendMail.mockRejectedValueOnce(new Error("connection refused"));
    mocked(prisma.notification.findFirst).mockResolvedValue(null as never);

    await processSend(fakeJob());

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "delivery.email_bounced" }) })
    );
  });

  it("suppresses a bounce notification within the debounce window", async () => {
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([
      approvedEmail("e1", "c1"),
      approvedEmail("e2", "c2"),
    ] as never);
    sendMail
      .mockRejectedValueOnce(new Error("bounce"))
      .mockRejectedValueOnce(new Error("bounce"));
    // First check returns null (creates notification), second returns existing
    mocked(prisma.notification.findFirst)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: "existing-notif" } as never);

    await processSend(fakeJob());

    const bounceCalls = mocked(prisma.notification.create).mock.calls.filter(
      (c) => (c[0] as { data: { type: string } }).data.type === "delivery.email_bounced"
    );
    expect(bounceCalls).toHaveLength(1);
  });

  it("skips the bounce notification entirely when email_bounced pref is off", async () => {
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { eventType: "email_bounced", inApp: false },
    ] as never);
    mocked(prisma.campaignEmail.findMany).mockResolvedValue([
      approvedEmail("e1", "c1"),
    ] as never);
    sendMail.mockRejectedValueOnce(new Error("bounce"));

    await processSend(fakeJob());

    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "delivery.email_bounced" }) })
    );
  });
});

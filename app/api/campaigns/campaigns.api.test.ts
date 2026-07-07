// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const queueAdd = vi.fn();
const queueGetJob = vi.fn();

vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");
vi.mock("@/lib/jobs/queue", () => ({
  getGenerateQueue: () => ({ add: queueAdd }),
  getSendQueue: () => ({ add: queueAdd, getJob: queueGetJob }),
}));

import { prisma } from "@/lib/prisma";
import { mockSession, jsonRequest, routeParams } from "@/test/api-helpers";
import { GET as getCampaigns, POST as createCampaign } from "./route";
import { POST as generateCampaign } from "./[id]/generate/route";
import { POST as sendCampaign } from "./[id]/send/route";
import { POST as pauseCampaign } from "./[id]/pause/route";
import { POST as approveAll } from "./[id]/approve-all/route";
import { POST as cancelCampaign } from "./[id]/cancel/route";

const mocked = vi.mocked;

const campaign = {
  id: "camp-1",
  userId: "user-1",
  name: "Q3",
  listId: "list-1",
  status: "pending",
  aiProvider: null,
};

describe("api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession("user-1");
    queueAdd.mockResolvedValue({ id: "job-1" });
  });

  describe("GET /api/campaigns", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await getCampaigns();
      expect(res.status).toBe(401);
    });

    it("lists campaigns scoped to the session user", async () => {
      mocked(prisma.campaign.findMany).mockResolvedValue([
        { ...campaign, emails: [] },
      ] as never);
      const res = await getCampaigns();
      expect(res.status).toBe(200);
      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } })
      );
    });
  });

  describe("POST /api/campaigns", () => {
    it("returns 400 on missing required fields", async () => {
      const res = await createCampaign(
        jsonRequest("/api/campaigns", { method: "POST", body: { name: "" } })
      );
      expect(res.status).toBe(400);
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    });

    it("returns 404 when the list is not owned by the user", async () => {
      mocked(prisma.list.findFirst).mockResolvedValue(null as never);
      const res = await createCampaign(
        jsonRequest("/api/campaigns", {
          method: "POST",
          body: { name: "Q3", listId: "list-x", systemPrompt: "Write personalized emails" },
        })
      );
      expect(res.status).toBe(404);
    });

    it("creates a campaign with totalEmails from the list size", async () => {
      mocked(prisma.list.findFirst).mockResolvedValue({
        id: "list-1",
        _count: { members: 42 },
      } as never);
      mocked(prisma.campaign.create).mockResolvedValue(campaign as never);

      const res = await createCampaign(
        jsonRequest("/api/campaigns", {
          method: "POST",
          body: { name: "Q3", listId: "list-1", systemPrompt: "Write personalized emails" },
        })
      );

      expect(res.status).toBe(201);
      expect(prisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: "user-1", totalEmails: 42 }),
        })
      );
    });

    it("returns 409 when a campaign with the same name already exists", async () => {
      mocked(prisma.list.findFirst).mockResolvedValue({
        id: "list-1",
        _count: { members: 5 },
      } as never);
      mocked(prisma.campaign.findFirst).mockResolvedValueOnce({ id: "camp-existing" } as never);

      const res = await createCampaign(
        jsonRequest("/api/campaigns", {
          method: "POST",
          body: { name: "Q3", listId: "list-1", systemPrompt: "Write personalized emails" },
        })
      );

      expect(res.status).toBe(409);
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    });

    it("returns 400 when scheduledAt is in the past", async () => {
      const res = await createCampaign(
        jsonRequest("/api/campaigns", {
          method: "POST",
          body: { name: "Q3", listId: "list-1", scheduledAt: "2000-01-01T00:00" },
        })
      );
      expect(res.status).toBe(400);
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    });

    it("enqueues a delayed send job when scheduledAt is in the future", async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16); // datetime-local format
      mocked(prisma.list.findFirst).mockResolvedValue({
        id: "list-1",
        _count: { members: 5 },
      } as never);
      mocked(prisma.campaign.create).mockResolvedValue({ ...campaign, id: "camp-sched" } as never);

      const res = await createCampaign(
        jsonRequest("/api/campaigns", {
          method: "POST",
          body: { name: "Scheduled", listId: "list-1", systemPrompt: "Write personalized emails", scheduledAt: futureDate },
        })
      );

      expect(res.status).toBe(201);
      expect(queueAdd).toHaveBeenCalledWith(
        "send",
        { campaignId: "camp-sched", userId: "user-1" },
        expect.objectContaining({ jobId: "scheduled-send-camp-sched" })
      );
    });
  });

  describe("POST /api/campaigns/[id]/generate", () => {
    it("returns 409 when the campaign is in a non-generatable status", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        status: "sending",
      } as never);
      const res = await generateCampaign(
        jsonRequest("/api/campaigns/camp-1/generate", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(409);
      expect(queueAdd).not.toHaveBeenCalled();
    });

    it("returns 422 when no connected AI config exists", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      mocked(prisma.aiConfig.findFirst).mockResolvedValue(null as never);
      const res = await generateCampaign(
        jsonRequest("/api/campaigns/camp-1/generate", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(422);
    });

    it("queues a generate job with an idempotent jobId", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      mocked(prisma.aiConfig.findFirst).mockResolvedValue({ id: "ai-1" } as never);

      const res = await generateCampaign(
        jsonRequest("/api/campaigns/camp-1/generate", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );
      const body = await res.json();

      expect(body).toEqual({ jobId: "job-1", status: "queued" });
      expect(queueAdd).toHaveBeenCalledWith(
        "generate",
        { campaignId: "camp-1", userId: "user-1" },
        expect.objectContaining({ jobId: expect.stringMatching(/^generate-camp-1-\d+$/) })
      );
    });
  });

  describe("POST /api/campaigns/[id]/send", () => {
    it("returns 409 from a non-sendable status", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never); // draft
      const res = await sendCampaign(
        jsonRequest("/api/campaigns/camp-1/send", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(409);
    });

    it("returns 422 when SMTP is not connected", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        status: "ready_to_send",
      } as never);
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({ status: "failed" } as never);
      const res = await sendCampaign(
        jsonRequest("/api/campaigns/camp-1/send", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(422);
    });

    it("returns 422 when there are no approved emails", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        status: "ready_to_send",
      } as never);
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({ status: "connected" } as never);
      mocked(prisma.campaignEmail.count).mockResolvedValue(0 as never);
      const res = await sendCampaign(
        jsonRequest("/api/campaigns/camp-1/send", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(422);
      expect(queueAdd).not.toHaveBeenCalled();
    });

    it("queues a send job when ready with approved emails", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        status: "ready_to_send",
      } as never);
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({ status: "connected" } as never);
      mocked(prisma.campaignEmail.count).mockResolvedValue(5 as never);
      mocked(prisma.campaign.update).mockResolvedValue({ id: "camp-1", status: "sending" } as never);

      const res = await sendCampaign(
        jsonRequest("/api/campaigns/camp-1/send", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );

      expect((await res.json()).status).toBe("queued");
      expect(queueAdd).toHaveBeenCalledWith(
        "send",
        expect.objectContaining({ campaignId: "camp-1", userId: "user-1", sendRunId: expect.any(String) }),
        expect.objectContaining({ jobId: expect.stringMatching(/^send-camp-1-/) })
      );
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: "camp-1" },
        data: expect.objectContaining({
          status: "sending",
          activeSendRunId: expect.any(String),
          startedAt: expect.any(Date),
          completedAt: null,
        }),
      });
    });

    it("preserves the pending nextSendAt when resuming a paused campaign", async () => {
      const nextSendAt = new Date(Date.now() + 2 * 60 * 1000);
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        status: "paused",
        startedAt: new Date(Date.now() - 60_000),
        nextSendAt,
      } as never);
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({ status: "connected" } as never);
      mocked(prisma.campaignEmail.count).mockResolvedValue(5 as never);
      mocked(prisma.campaign.update).mockResolvedValue({ id: "camp-1", status: "sending" } as never);

      const res = await sendCampaign(
        jsonRequest("/api/campaigns/camp-1/send", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );

      expect(res.status).toBe(200);
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: "camp-1" },
        data: expect.objectContaining({
          nextSendAt,
        }),
      });
    });
  });

  describe("POST /api/campaigns/[id]/pause", () => {
    it("returns 409 when the campaign is not currently sending", async () => {
      mocked(prisma.campaign.updateMany).mockResolvedValue({ count: 0 } as never);
      const res = await pauseCampaign(
        jsonRequest("/api/campaigns/camp-1/pause", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(409);
    });

    it("pauses only a sending campaign owned by the user", async () => {
      mocked(prisma.campaign.updateMany).mockResolvedValue({ count: 1 } as never);
      const res = await pauseCampaign(
        jsonRequest("/api/campaigns/camp-1/pause", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(200);
      expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
        where: { id: "camp-1", userId: "user-1", status: "sending" },
        data: { status: "paused", activeSendRunId: null },
      });
    });
  });

  describe("POST /api/campaigns/[id]/cancel", () => {
    it("removes the delayed scheduled-send job when cancelling", async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      queueGetJob.mockResolvedValue({ remove: mockRemove });
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        status: "sending",
      } as never);
      mocked(prisma.campaignEmail.updateMany).mockResolvedValue({ count: 0 } as never);
      mocked(prisma.campaign.update).mockResolvedValue({} as never);

      const res = await cancelCampaign(
        jsonRequest("/api/campaigns/camp-1/cancel", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );

      expect(res.status).toBe(200);
      expect(queueGetJob).toHaveBeenCalledWith("scheduled-send-camp-1");
      expect(mockRemove).toHaveBeenCalled();
    });

    it("proceeds normally when no delayed job exists for the campaign", async () => {
      queueGetJob.mockResolvedValue(undefined);
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        status: "paused",
      } as never);
      mocked(prisma.campaignEmail.updateMany).mockResolvedValue({ count: 0 } as never);
      mocked(prisma.campaign.update).mockResolvedValue({} as never);

      const res = await cancelCampaign(
        jsonRequest("/api/campaigns/camp-1/cancel", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );

      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/campaigns/[id]/approve-all", () => {
    it("approves pending generated emails and moves the campaign to ready_to_send", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        status: "pending_review",
      } as never);
      mocked(prisma.campaignEmail.updateMany).mockResolvedValue({ count: 3 } as never);
      mocked(prisma.campaignEmail.count).mockResolvedValue(3 as never);
      mocked(prisma.campaign.update).mockResolvedValue({} as never);

      const res = await approveAll(
        jsonRequest("/api/campaigns/camp-1/approve-all", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );

      expect((await res.json()).approved).toBe(3);
      expect(prisma.campaignEmail.updateMany).toHaveBeenCalledWith({
        where: { campaignId: "camp-1", status: "generated", approvalStatus: "pending" },
        data: { approvalStatus: "approved" },
      });
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: "camp-1" },
        data: { status: "ready_to_send" },
      });
    });

    it("does not transition the campaign when nothing is approved", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      mocked(prisma.campaignEmail.updateMany).mockResolvedValue({ count: 0 } as never);
      mocked(prisma.campaignEmail.count).mockResolvedValue(0 as never);

      await approveAll(
        jsonRequest("/api/campaigns/camp-1/approve-all", { method: "POST" }),
        routeParams({ id: "camp-1" })
      );

      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });
  });
});

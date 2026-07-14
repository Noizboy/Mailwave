// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");
vi.mock("@/lib/crypto", () => ({ decrypt: vi.fn(() => "api-key") }));
vi.mock("@/lib/ai", () => ({
  generateEmail: vi.fn(),
  buildSystemPrompt: vi.fn(() => "sys"),
  buildUserPrompt: vi.fn(() => "usr"),
  PROVIDER_BASE_URLS: {},
  resolveAiConfig: vi.fn().mockResolvedValue({
    ok: true,
    config: {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "api-key",
      baseUrl: undefined,
    },
  }),
}));

import { prisma } from "@/lib/prisma";
import { generateEmail } from "@/lib/ai";
import { mockSession, jsonRequest, routeParams } from "@/test/api-helpers";
import { GET as listEmails } from "./[id]/emails/route";
import { PATCH as patchEmail } from "./[id]/emails/[emailId]/route";
import { POST as regenerateEmail } from "./[id]/emails/[emailId]/regenerate/route";

const mocked = vi.mocked;

const campaign = { id: "camp-1", userId: "user-1", status: "pending_review" };

const contact = {
  id: "c-1",
  email: "a@b.com",
  firstName: "Ann",
  lastName: null,
  company: null,
  jobTitle: null,
  aiHint: null,
  customFields: null,
  status: "subscribed",
};

function emailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "email-1",
    campaignId: "camp-1",
    contactId: "c-1",
    subject: "Hi",
    body: "Body",
    approvalStatus: "pending",
    status: "generated",
    sentAt: null,
    createdAt: new Date("2026-01-01"),
    contact,
    deliveryEvents: [],
    ...overrides,
  };
}

describe("api/campaigns — email sub-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession("user-1");
  });

  // ─── GET /api/campaigns/[id]/emails ───────────────────────────────────────

  describe("GET /api/campaigns/[id]/emails", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await listEmails(
        jsonRequest("/api/campaigns/camp-1/emails"),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 when the campaign is not owned by the user", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(null as never);
      const res = await listEmails(
        jsonRequest("/api/campaigns/camp-1/emails"),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 on an invalid approvalStatus param", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      const res = await listEmails(
        jsonRequest("/api/campaigns/camp-1/emails", { searchParams: { approvalStatus: "bogus" } }),
        routeParams({ id: "camp-1" })
      );
      expect(res.status).toBe(400);
    });

    it("returns emails with opened=false when no events exceed 15s threshold", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      const sentAt = new Date("2026-06-01T10:00:00Z");
      const earlyOpen = new Date(sentAt.getTime() + 5_000); // 5s — below threshold
      mocked(prisma.campaignEmail.findMany).mockResolvedValue([
        emailRow({ sentAt, deliveryEvents: [{ occurredAt: earlyOpen }] }),
      ] as never);
      mocked(prisma.campaignEmail.count).mockResolvedValue(1 as never);

      const res = await listEmails(
        jsonRequest("/api/campaigns/camp-1/emails"),
        routeParams({ id: "camp-1" })
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.emails[0].opened).toBe(false);
    });

    it("returns emails with opened=true when an event exceeds the 15s threshold", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      const sentAt = new Date("2026-06-01T10:00:00Z");
      const realOpen = new Date(sentAt.getTime() + 20_000); // 20s — above threshold
      mocked(prisma.campaignEmail.findMany).mockResolvedValue([
        emailRow({ sentAt, deliveryEvents: [{ occurredAt: realOpen }] }),
      ] as never);
      mocked(prisma.campaignEmail.count).mockResolvedValue(1 as never);

      const res = await listEmails(
        jsonRequest("/api/campaigns/camp-1/emails"),
        routeParams({ id: "camp-1" })
      );
      const body = await res.json();

      expect(body.emails[0].opened).toBe(true);
    });

    it("clamps perPage to a maximum of 100", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      mocked(prisma.campaignEmail.findMany).mockResolvedValue([] as never);
      mocked(prisma.campaignEmail.count).mockResolvedValue(0 as never);

      await listEmails(
        jsonRequest("/api/campaigns/camp-1/emails", { searchParams: { perPage: "9999" } }),
        routeParams({ id: "camp-1" })
      );

      expect(prisma.campaignEmail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });
  });

  // ─── PATCH /api/campaigns/[id]/emails/[emailId] ───────────────────────────

  describe("PATCH /api/campaigns/[id]/emails/[emailId]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await patchEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1", { method: "PATCH", body: {} }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 when the campaign is not owned by the user", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(null as never);
      const res = await patchEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1", { method: "PATCH", body: {} }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when the email does not exist", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      mocked(prisma.campaignEmail.findFirst).mockResolvedValue(null as never);
      const res = await patchEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1", {
          method: "PATCH",
          body: { approvalStatus: "approved" },
        }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );
      expect(res.status).toBe(404);
    });

    it("returns 403 when the contact is suppressed", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      mocked(prisma.campaignEmail.findFirst).mockResolvedValue({
        id: "email-1",
        contact: { status: "suppressed" },
      } as never);
      const res = await patchEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1", {
          method: "PATCH",
          body: { approvalStatus: "approved" },
        }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );
      expect(res.status).toBe(403);
    });

    it("updates allowed fields and returns ok", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      mocked(prisma.campaignEmail.findFirst).mockResolvedValue({
        id: "email-1",
        contact: { status: "subscribed" },
      } as never);
      mocked(prisma.campaignEmail.update).mockResolvedValue({} as never);

      const res = await patchEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1", {
          method: "PATCH",
          body: { subject: "New subject", approvalStatus: "approved" },
        }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );

      expect(res.status).toBe(200);
      expect(prisma.campaignEmail.update).toHaveBeenCalledWith({
        where: { id: "email-1" },
        data: { subject: "New subject", approvalStatus: "approved" },
      });
    });
  });

  // ─── POST /api/campaigns/[id]/emails/[emailId]/regenerate ─────────────────

  describe("POST /api/campaigns/[id]/emails/[emailId]/regenerate", () => {
    const aiConfig = {
      id: "ai-1",
      provider: "openai",
      model: "gpt-4o-mini",
      encryptedApiKey: "enc",
      baseUrl: null,
      status: "connected",
    };

    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await regenerateEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1/regenerate", { method: "POST" }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 when the campaign is not owned by the user", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(null as never);
      const res = await regenerateEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1/regenerate", { method: "POST" }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when the email does not exist", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      mocked(prisma.campaignEmail.findFirst).mockResolvedValue(null as never);
      const res = await regenerateEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1/regenerate", { method: "POST" }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 when no connected AI config exists", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue(campaign as never);
      mocked(prisma.campaignEmail.findFirst).mockResolvedValue(
        { id: "email-1", contact } as never
      );
      mocked(prisma.aiConfig.findFirst).mockResolvedValue(null as never);
      const res = await regenerateEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1/regenerate", { method: "POST" }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );
      expect(res.status).toBe(400);
    });

    it("regenerates and updates the email body by default", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        goal: "Book demos",
        product: null,
        cta: null,
        tone: null,
        language: "English",
        emailLength: "medium",
        systemPrompt: null,
      } as never);
      mocked(prisma.campaignEmail.findFirst).mockResolvedValue(
        { id: "email-1", contact } as never
      );
      mocked(prisma.aiConfig.findFirst).mockResolvedValue(aiConfig as never);
      mocked(generateEmail).mockResolvedValue({
        subject: "New subject",
        body: "New body",
        personalizationNotes: "Notes",
      });
      mocked(prisma.campaignEmail.update).mockResolvedValue({
        subject: "New subject",
        body: "New body",
      } as never);

      const res = await regenerateEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1/regenerate", { method: "POST", body: {} }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );

      expect(res.status).toBe(200);
      expect(mocked(generateEmail)).toHaveBeenCalledOnce();
      expect(prisma.campaignEmail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "email-1" },
          data: expect.objectContaining({ body: "New body", status: "generated" }),
        })
      );
    });

    it("returns 500 when the AI call fails", async () => {
      mocked(prisma.campaign.findFirst).mockResolvedValue({
        ...campaign,
        goal: "g",
        product: null,
        cta: null,
        tone: null,
        language: "en",
        emailLength: "medium",
        systemPrompt: null,
      } as never);
      mocked(prisma.campaignEmail.findFirst).mockResolvedValue(
        { id: "email-1", contact } as never
      );
      mocked(prisma.aiConfig.findFirst).mockResolvedValue(aiConfig as never);
      mocked(generateEmail).mockRejectedValue(new Error("timeout"));

      const res = await regenerateEmail(
        jsonRequest("/api/campaigns/camp-1/emails/email-1/regenerate", { method: "POST", body: {} }),
        routeParams({ id: "camp-1", emailId: "email-1" })
      );

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("timeout");
    });
  });
});

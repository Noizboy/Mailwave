// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");

import { prisma } from "@/lib/prisma";
import { mockSession, jsonRequest, routeParams } from "@/test/api-helpers";
import { GET as getDashboard } from "../dashboard/route";
import { GET as getReports } from "./route";
import { GET as exportCsv } from "./export/route";
import { GET as getNotifications, PATCH as markAllRead } from "../notifications/route";
import { PATCH as markOneRead } from "../notifications/[id]/route";

const mocked = vi.mocked;

describe("api/dashboard + reports + notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession("user-1");
  });

  describe("GET /api/dashboard", () => {
    it("aggregates stats scoped to the session user with safe defaults", async () => {
      mocked(prisma.contact.count).mockResolvedValue(10 as never);
      mocked(prisma.list.count).mockResolvedValue(2 as never);
      mocked(prisma.campaign.count).mockResolvedValue(1 as never);
      mocked(prisma.campaignEmail.count)
        .mockResolvedValueOnce(0 as never)
        .mockResolvedValueOnce(0 as never)
        .mockResolvedValueOnce(4 as never);
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue(null as never);
      mocked(prisma.aiConfig.findUnique).mockResolvedValue(null as never);
      mocked(prisma.campaign.findMany).mockResolvedValue([] as never);

      const res = await getDashboard();
      const body = await res.json();

      expect(body.stats).toMatchObject({
        totalContacts: 10,
        totalLists: 2,
        emailsSent: 0, // null aggregate coerced to 0
        failedEmails: 0,
        pendingReviews: 4,
      });
      expect(body.smtpStatus).toBe("disconnected");
      expect(body.aiStatus).toBe("disconnected");
      expect(prisma.contact.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    });
  });

  describe("GET /api/reports", () => {
    it("computes the delivery rate from sent and failed sums", async () => {
      mocked(prisma.contact.count).mockResolvedValue(0 as never);
      mocked(prisma.campaign.count).mockResolvedValue(0 as never);
      mocked(prisma.campaignEmail.count)
        .mockResolvedValueOnce(90 as never)
        .mockResolvedValueOnce(10 as never);
      mocked(prisma.campaign.findMany).mockResolvedValue([] as never);
      mocked(prisma.deliveryEvent.groupBy).mockResolvedValue([] as never);

      const res = await getReports();
      const body = await res.json();

      expect(body.summary.deliveryRate).toBe(90);
      expect(body.summary.totalEmailsSent).toBe(90);
    });

    it("returns 0 delivery rate when nothing was sent (no division by zero)", async () => {
      mocked(prisma.contact.count).mockResolvedValue(0 as never);
      mocked(prisma.campaign.count).mockResolvedValue(0 as never);
      mocked(prisma.campaignEmail.count)
        .mockResolvedValueOnce(0 as never)
        .mockResolvedValueOnce(0 as never);
      mocked(prisma.campaign.findMany).mockResolvedValue([] as never);
      mocked(prisma.deliveryEvent.groupBy).mockResolvedValue([] as never);

      const res = await getReports();
      expect((await res.json()).summary.deliveryRate).toBe(0);
    });
  });

  describe("GET /api/reports/export", () => {
    it("produces well-formed CSV with quoted fields and a header row", async () => {
      mocked(prisma.campaignEmail.findMany).mockResolvedValue([
        {
          campaign: { name: 'Launch "Alpha"' },
          contact: { email: "a@b.com", firstName: "Ann, Jr.", lastName: null, company: null },
          subject: "Hi",
          approvalStatus: "approved",
          status: "sent",
          sentAt: new Date("2026-07-01T12:00:00Z"),
        },
      ] as never);

      const res = await exportCsv(jsonRequest("/api/reports/export"));
      const text = await res.text();
      const lines = text.split("\n");

      expect(res.headers.get("content-type")).toBe("text/csv");
      expect(lines[0]).toContain('"Campaign"');
      expect(lines[1]).toContain('"Launch ""Alpha"""'); // quotes escaped
      expect(lines[1]).toContain('"Ann, Jr."'); // commas preserved inside quotes
      expect(lines[1]).toContain("2026-07-01T12:00:00.000Z");
    });

    it("filters by campaignId while still scoping to the user", async () => {
      mocked(prisma.campaignEmail.findMany).mockResolvedValue([] as never);

      await exportCsv(jsonRequest("/api/reports/export", { searchParams: { campaignId: "camp-9" } }));

      expect(prisma.campaignEmail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaignId: "camp-9", campaign: { userId: "user-1" } },
        })
      );
    });
  });

  describe("notifications", () => {
    it("returns notifications with the unread count", async () => {
      mocked(prisma.notification.findMany).mockResolvedValue([{ id: "n1" }] as never);
      mocked(prisma.notification.count).mockResolvedValue(1 as never);

      const res = await getNotifications(jsonRequest("/api/notifications"));
      const body = await res.json();

      expect(body.unreadCount).toBe(1);
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } })
      );
    });

    it("marks all read scoped to the user", async () => {
      mocked(prisma.notification.updateMany).mockResolvedValue({ count: 3 } as never);
      await markAllRead();
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", read: false },
        data: { read: true },
      });
    });

    it("marks a single notification read only when owned", async () => {
      mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 } as never);
      await markOneRead(
        jsonRequest("/api/notifications/n1", { method: "PATCH" }),
        routeParams({ id: "n1" })
      );
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: "n1", userId: "user-1" },
        data: { read: true },
      });
    });
  });
});

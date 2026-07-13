// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// api-helpers transitively imports @/lib/auth, which loads next-auth — mock it
// so this test stays hermetic and doesn't pull in next/server resolution.
vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");
vi.mock("@/lib/track-sign", () => ({
  // Always-valid signature in tests so we exercise the rate-limit path.
  verifyEmailId: vi.fn(() => true),
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { __resetRateLimitStore } from "@/lib/rate-limit";
import { GET as trackPixel } from "./route";
import { routeParams } from "@/test/api-helpers";

const mocked = vi.mocked;

function trackRequest(emailId: string, ip?: string, userAgent?: string): NextRequest {
  const url = new URL(`http://localhost:3000/api/track/${emailId}?s=test-sig`);
  const headers: Record<string, string> = {};
  if (ip) headers["x-forwarded-for"] = ip;
  if (userAgent) headers["user-agent"] = userAgent;
  return new NextRequest(url, { method: "GET", headers });
}

describe("GET /api/track/[emailId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await __resetRateLimitStore();
  });

  it("always returns the GIF pixel regardless of outcome", async () => {
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "e1",
      status: "sent",
    } as never);
    mocked(prisma.deliveryEvent.create).mockResolvedValue({} as never);

    const res = await trackPixel(
      trackRequest("e1", "203.0.113.1"),
      routeParams({ emailId: "e1" })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(1);
  });

  // SEC-005: more than 60/min/IP silently drops the open event but the pixel
  // is still served. We use distinct emailIds so the per-email block doesn't
  // dedupe the requests before the IP quota fires.
  it("returns 200 (pixel) but skips recording opens past the 60/min/IP limit", async () => {
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "e",
      status: "sent",
    } as never);
    mocked(prisma.deliveryEvent.create).mockResolvedValue({} as never);

    for (let i = 0; i < 60; i++) {
      const res = await trackPixel(
        trackRequest(`e${i}`, "203.0.113.9"),
        routeParams({ emailId: `e${i}` })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/gif");
    }
    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(60);

    const overflow = await trackPixel(
      trackRequest(`e-overflow`, "203.0.113.9"),
      routeParams({ emailId: "e-overflow" })
    );
    expect(overflow.status).toBe(200);
    expect(overflow.headers.get("content-type")).toBe("image/gif");
    // The overflow request must NOT have recorded an open event.
    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(60);
  });

  it("skips open event when pixel fires within 15 s of sentAt (scanner heuristic)", async () => {
    const recentSentAt = new Date(Date.now() - 2_000); // 2 seconds ago
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "scanner-e1",
      status: "sent",
      sentAt: recentSentAt,
    } as never);

    const res = await trackPixel(
      trackRequest("scanner-e1", "203.0.113.1"),
      routeParams({ emailId: "scanner-e1" })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(prisma.deliveryEvent.create).not.toHaveBeenCalled();
  });

  it("records open event when pixel fires more than 15 s after sentAt", async () => {
    const oldSentAt = new Date(Date.now() - 20_000); // 20 seconds ago
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "human-e1",
      status: "sent",
      sentAt: oldSentAt,
    } as never);
    mocked(prisma.deliveryEvent.create).mockResolvedValue({} as never);

    const res = await trackPixel(
      trackRequest("human-e1", "203.0.113.1"),
      routeParams({ emailId: "human-e1" })
    );

    expect(res.status).toBe(200);
    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Gmail", "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)"],
    ["Yahoo Mail", "Mozilla/5.0 (compatible; YahooMailProxy; +https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html)"],
    ["Microsoft Office", "Microsoft-Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.15726)"],
    ["Proofpoint", "Mozilla/5.0 (compatible; Proofpoint Email Security)"],
  ])("returns pixel but skips open event for %s image proxy", async (_name, ua) => {
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "proxy-e1",
      status: "sent",
    } as never);

    const res = await trackPixel(
      trackRequest("proxy-e1", "203.0.113.1", ua),
      routeParams({ emailId: "proxy-e1" })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(prisma.deliveryEvent.create).not.toHaveBeenCalled();
  });

  it("counts requests against the IP bucket independently per IP", async () => {
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "e",
      status: "sent",
    } as never);
    mocked(prisma.deliveryEvent.create).mockResolvedValue({} as never);

    // Burn the full 60/min quota for one IP with distinct emailIds.
    for (let i = 0; i < 60; i++) {
      await trackPixel(trackRequest(`a${i}`, "198.51.100.1"), routeParams({ emailId: `a${i}` }));
    }

    // A different IP must still be allowed.
    const res = await trackPixel(trackRequest("b0", "198.51.100.2"), routeParams({ emailId: "b0" }));
    expect(res.status).toBe(200);
    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(61);
  });
});

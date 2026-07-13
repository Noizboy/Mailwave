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

  it("records a second open event if the same email is loaded again (no permanent dedup)", async () => {
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "e2",
      status: "sent",
    } as never);
    mocked(prisma.deliveryEvent.create).mockResolvedValue({} as never);

    await trackPixel(trackRequest("e2", "203.0.113.1"), routeParams({ emailId: "e2" }));
    await trackPixel(trackRequest("e2", "203.0.113.2"), routeParams({ emailId: "e2" }));

    // Both requests from different IPs must each create an event; the
    // scanner/human distinction is now done at query time in the emails API.
    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(2);
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

  it.each([
    ["Gmail", "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)"],
    ["Yahoo Mail", "Mozilla/5.0 (compatible; YahooMailProxy; +https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html)"],
    ["Microsoft Office", "Microsoft-Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.15726)"],
    ["Proofpoint", "Mozilla/5.0 (compatible; Proofpoint Email Security)"],
    ["Cisco IronPort", "Mozilla/5.0 (compatible; IronPort Email Security)"],
    ["Sophos", "Mozilla/5.0 (compatible; Sophos Email Gateway/1.0)"],
    ["Forcepoint", "Forcepoint Email Security/8.5"],
    ["Abnormal Security", "Abnormal-Security-Scanner/1.0"],
    ["AppRiver", "AppRiver Email Security/2.0"],
    ["Cloudflare Email", "Cloudflare-Email-Security/1.0"],
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

  // CN-003: Apple Mail Privacy Protection — Apple owns 17.0.0.0/8 and routes
  // ALL image prefetches through that range before the user opens the email.
  // The UA is indistinguishable from a real Safari user, so only the IP range
  // check reliably catches Apple MPP.
  it.each([
    ["17.0.0.1"],
    ["17.58.100.200"],
    ["17.255.255.255"],
  ])("returns pixel but skips open event for Apple MPP IP %s", async (ip) => {
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "apple-e1",
      status: "sent",
    } as never);

    const res = await trackPixel(
      trackRequest("apple-e1", ip, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15"),
      routeParams({ emailId: "apple-e1" })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(prisma.deliveryEvent.create).not.toHaveBeenCalled();
  });

  it("does NOT block a real open from a non-Apple IP with Safari UA", async () => {
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "safari-e1",
      status: "sent",
    } as never);
    mocked(prisma.deliveryEvent.create).mockResolvedValue({} as never);

    const res = await trackPixel(
      trackRequest("safari-e1", "203.0.113.5", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15"),
      routeParams({ emailId: "safari-e1" })
    );

    expect(res.status).toBe(200);
    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(1);
  });

  // CN-003: per-(emailId, IP) dedup — only the first hit from a given IP for a
  // given email within 60 s records an event. Subsequent hits return the pixel
  // without touching the DB (prevents multi-node proxy clusters from inflating counts).
  it("records only one open event when the same IP loads the same email twice within 60 s", async () => {
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "dedup-e1",
      status: "sent",
    } as never);
    mocked(prisma.deliveryEvent.create).mockResolvedValue({} as never);

    await trackPixel(trackRequest("dedup-e1", "203.0.113.10"), routeParams({ emailId: "dedup-e1" }));
    await trackPixel(trackRequest("dedup-e1", "203.0.113.10"), routeParams({ emailId: "dedup-e1" }));

    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(1);
  });

  it("records separate open events when different IPs load the same email", async () => {
    mocked(prisma.campaignEmail.findUnique).mockResolvedValue({
      id: "dedup-e2",
      status: "sent",
    } as never);
    mocked(prisma.deliveryEvent.create).mockResolvedValue({} as never);

    await trackPixel(trackRequest("dedup-e2", "203.0.113.11"), routeParams({ emailId: "dedup-e2" }));
    await trackPixel(trackRequest("dedup-e2", "203.0.113.12"), routeParams({ emailId: "dedup-e2" }));

    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(2);
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

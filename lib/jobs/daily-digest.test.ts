import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationPreference: { findMany: vi.fn() },
    deliveryEvent: { count: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { processDailyDigest, type DailyDigestJobData } from "./daily-digest";

const mocked = vi.mocked;

function fakeJob(): Job<DailyDigestJobData> {
  return {} as unknown as Job<DailyDigestJobData>;
}

describe("processDailyDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked(prisma.notification.create).mockResolvedValue({} as never);
    mocked(prisma.deliveryEvent.count).mockResolvedValue(0 as never);
  });

  it("creates no notifications when no users have daily_digest enabled", async () => {
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([] as never);

    const result = await processDailyDigest(fakeJob());

    expect(result).toEqual({ processed: 0 });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("creates one digest notification per eligible user with sent/failed counts", async () => {
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { userId: "user-1" },
      { userId: "user-2" },
    ] as never);
    mocked(prisma.deliveryEvent.count)
      .mockResolvedValueOnce(42 as never)  // user-1 sent
      .mockResolvedValueOnce(3 as never)   // user-1 failed
      .mockResolvedValueOnce(10 as never)  // user-2 sent
      .mockResolvedValueOnce(0 as never);  // user-2 failed

    const result = await processDailyDigest(fakeJob());

    expect(result).toEqual({ processed: 2 });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          type: "digest.daily",
          body: expect.stringContaining("42 sent"),
        }),
      })
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-2",
          type: "digest.daily",
          body: expect.stringContaining("10 sent"),
        }),
      })
    );
  });

  it("only queries preferences with daily_digest eventType and inApp true", async () => {
    mocked(prisma.notificationPreference.findMany).mockResolvedValue([] as never);

    await processDailyDigest(fakeJob());

    expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith({
      where: { eventType: "daily_digest", inApp: true },
      select: { userId: true },
    });
  });
});

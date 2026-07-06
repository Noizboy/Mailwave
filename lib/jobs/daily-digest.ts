import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { QUEUE_NAMES } from "./queue";

export interface DailyDigestJobData {
  triggeredAt?: string;
}

export async function processDailyDigest(_job: Job<DailyDigestJobData>) {
  const dayAgo = new Date(Date.now() - 86400000);

  const prefs = await prisma.notificationPreference.findMany({
    where: { eventType: "daily_digest", inApp: true },
    select: { userId: true },
  });

  for (const { userId } of prefs) {
    const [sentCount, failedCount] = await Promise.all([
      prisma.deliveryEvent.count({
        where: {
          eventType: "sent",
          occurredAt: { gte: dayAgo },
          campaignEmail: { campaign: { userId } },
        },
      }),
      prisma.deliveryEvent.count({
        where: {
          eventType: "failed",
          occurredAt: { gte: dayAgo },
          campaignEmail: { campaign: { userId } },
        },
      }),
    ]);

    await prisma.notification.create({
      data: {
        userId,
        type: "digest.daily",
        title: "Daily delivery digest",
        body: `Last 24 hours: ${sentCount} sent, ${failedCount} failed.`,
      },
    });
  }

  return { processed: prefs.length };
}

export function startDailyDigestWorker() {
  const worker = new Worker(QUEUE_NAMES.dailyDigest, processDailyDigest, {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
    concurrency: 1,
  });

  worker.on("failed", (job, err) => {
    console.error(`Daily digest job ${job?.id} failed:`, err.message);
  });

  return worker;
}

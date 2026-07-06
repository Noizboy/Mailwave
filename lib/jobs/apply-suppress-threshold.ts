import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { QUEUE_NAMES } from "./queue";

export interface ApplySuppressThresholdJobData {
  userId: string;
  suppressAfterEmails: number;
}

const BATCH_SIZE = 500;

export async function processApplySuppressThreshold(job: Job<ApplySuppressThresholdJobData>) {
  const { userId, suppressAfterEmails } = job.data;

  let totalSuppressed = 0;
  let cursor: string | undefined;

  while (true) {
    const contacts = await prisma.contact.findMany({
      where: {
        userId,
        status: "subscribed",
        emailsSentCount: { gte: suppressAfterEmails },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });

    if (contacts.length === 0) break;

    const ids = contacts.map((c) => c.id);
    const { count } = await prisma.contact.updateMany({
      where: { id: { in: ids } },
      data: { status: "suppressed" },
    });

    totalSuppressed += count;
    cursor = contacts[contacts.length - 1].id;

    await job.updateProgress(Math.min(99, Math.round((totalSuppressed / (totalSuppressed + BATCH_SIZE)) * 100)));

    if (contacts.length < BATCH_SIZE) break;

    // Pause between batches to avoid hammering the DB
    await new Promise((r) => setTimeout(r, 200));
  }

  return { totalSuppressed };
}

export function startApplySuppressThresholdWorker() {
  const worker = new Worker(
    QUEUE_NAMES.suppressContacts,
    processApplySuppressThreshold,
    {
      connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
      concurrency: 2,
      // Rate limit: max 10 suppress jobs per minute across all users
      limiter: { max: 10, duration: 60_000 },
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`Suppress-contacts job ${job?.id} failed:`, err.message);
  });

  return worker;
}

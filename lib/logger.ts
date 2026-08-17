import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

type Level = "info" | "warn" | "error";

function log(
  level: Level,
  category: string,
  message: string,
  metadata?: Record<string, unknown>,
  userId?: string
) {
  // Fire-and-forget: never blocks the caller; write failures are silently dropped
  // so a DB issue cannot cascade into the main request/job path.
  prisma.systemLog
    .create({
      data: {
        level,
        category,
        message,
        metadata: metadata as Prisma.InputJsonValue | undefined,
        userId,
      },
    })
    .catch(() => {});
}

export const logger = {
  info: (category: string, message: string, meta?: Record<string, unknown>, userId?: string) =>
    log("info", category, message, meta, userId),
  warn: (category: string, message: string, meta?: Record<string, unknown>, userId?: string) =>
    log("warn", category, message, meta, userId),
  error: (category: string, message: string, meta?: Record<string, unknown>, userId?: string) =>
    log("error", category, message, meta, userId),
};

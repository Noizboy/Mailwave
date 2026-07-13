import { prisma } from "@/lib/prisma";

const DEFAULTS: Record<string, boolean> = {
  campaign_complete: true,
  campaign_error: false,
  ai_email_ready: true,
  ai_email_error: false,
  email_bounced: false,
  daily_digest: false,
  system_alerts: true,
  low_credits: true,
};

export async function getNotifPrefs(
  userId: string,
  eventTypes: string[]
): Promise<Record<string, boolean>> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId, eventType: { in: eventTypes } },
    select: { eventType: true, inApp: true },
  });
  const result: Record<string, boolean> = {};
  for (const type of eventTypes) {
    result[type] = DEFAULTS[type] ?? true;
  }
  for (const row of rows) {
    result[row.eventType] = row.inApp;
  }
  return result;
}

import type { PrismaClient } from "../../app/generated/prisma/client";
import { NOTIFICATION_EVENT_TYPES } from "./fixtures";

// Notification preference persistence. Each event type gets a default
// in-app-on / email-off preference for the demo user.

export async function seedNotificationPreferences(prisma: PrismaClient, userId: string) {
  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    await prisma.notificationPreference.upsert({
      where: { userId_eventType: { userId, eventType } },
      update: { inApp: true, email: false },
      create: { userId, eventType, inApp: true, email: false },
    });
  }
}

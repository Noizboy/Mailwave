import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

const VALID_EVENT_TYPES = [
  "campaign_complete",
  "campaign_error",
  "ai_email_ready",
  "ai_email_error",
  "email_bounced",
  "daily_digest",
  "system_alerts",
  "low_credits",
] as const;

const DEFAULTS: Record<string, boolean> = {
  campaign_complete: true,
  campaign_error: true,
  ai_email_ready: false,
  ai_email_error: true,
  email_bounced: true,
  daily_digest: false,
  system_alerts: true,
  low_credits: true,
};

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.notificationPreference.findMany({
    where: { userId: user.id },
  });

  const result: Record<string, boolean> = { ...DEFAULTS };
  for (const row of rows) {
    result[row.eventType] = row.inApp;
  }

  return NextResponse.json(result);
}

const patchSchema = z.object({
  eventType: z.enum(VALID_EVENT_TYPES),
  inApp: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { eventType, inApp } = parsed.data;

  await prisma.notificationPreference.upsert({
    where: { userId_eventType: { userId: user.id, eventType } },
    create: { userId: user.id, eventType, inApp, email: false },
    update: { inApp },
  });

  return NextResponse.json({ ok: true });
}

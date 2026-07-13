import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deriveCampaignMetrics } from "@/lib/campaign-metrics";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const [
    totalContacts,
    activeContacts,
    totalCampaigns,
    completedCampaigns,
    totalSent,
    totalFailed,
    campaignBreakdown,
    openedEvents,
  ] = await Promise.all([
    prisma.contact.count({ where: { userId } }),
    prisma.contact.count({ where: { userId, status: "subscribed" } }),
    prisma.campaign.count({ where: { userId } }),
    prisma.campaign.count({ where: { userId, status: "completed" } }),
    prisma.campaignEmail.count({ where: { campaign: { userId }, status: "sent" } }),
    prisma.campaignEmail.count({ where: { campaign: { userId }, status: "failed" } }),
    prisma.campaign.findMany({
      where: { userId, status: { in: ["completed", "sending", "paused"] } },
      select: {
        id: true,
        name: true,
        status: true,
        totalEmails: true,
        startedAt: true,
        completedAt: true,
        list: { select: { name: true } },
        emails: {
          select: {
            approvalStatus: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    // Fetch only sent emails that have at least one opened event, then include
    // just the first event per email for the 15-second scanner filter (CN-002).
    // This avoids loading every DeliveryEvent row for large accounts.
    prisma.campaignEmail.findMany({
      where: {
        campaign: { userId },
        status: "sent",
        sentAt: { not: null },
        deliveryEvents: { some: { eventType: "opened" } },
      },
      select: {
        id: true,
        campaignId: true,
        sentAt: true,
        deliveryEvents: {
          where: { eventType: "opened" },
          select: { occurredAt: true },
          orderBy: { occurredAt: "asc" },
          take: 1,
        },
      },
    }),
  ]);

  const sent = totalSent;
  const failed = totalFailed;
  const deliveryRate = sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : 0;

  // Count genuine opens: first event per email must be >= 15 s after sentAt (CN-002).
  // openedEvents is now a list of CampaignEmail rows (one per email) each carrying
  // only their first opened DeliveryEvent, so no dedup loop is needed.
  const OPEN_THRESHOLD_MS = 15_000;
  const openCountByCampaign: Record<string, number> = {};

  for (const email of openedEvents) {
    const firstEvent = email.deliveryEvents[0];
    if (
      email.sentAt != null &&
      firstEvent != null &&
      firstEvent.occurredAt.getTime() - email.sentAt.getTime() >= OPEN_THRESHOLD_MS
    ) {
      openCountByCampaign[email.campaignId] = (openCountByCampaign[email.campaignId] ?? 0) + 1;
    }
  }

  const totalOpened = Object.values(openCountByCampaign).reduce((a, b) => a + b, 0);
  const openRate = sent > 0 ? Math.round((totalOpened / sent) * 100) : 0;

  const campaigns = campaignBreakdown.map(({ emails, ...campaign }) => ({
    ...campaign,
    ...deriveCampaignMetrics(emails),
    openedCount: openCountByCampaign[campaign.id] ?? 0,
  }));

  return NextResponse.json({
    summary: {
      totalContacts,
      activeContacts,
      totalCampaigns,
      completedCampaigns,
      totalEmailsSent: sent,
      totalFailed: failed,
      deliveryRate,
      totalOpened,
      openRate,
    },
    campaigns,
  });
}

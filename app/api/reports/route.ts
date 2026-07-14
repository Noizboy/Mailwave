import { NextResponse } from "next/server";
import { deriveCampaignMetrics } from "@/lib/campaign-metrics";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

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
    // Fetch only sent emails that have at least one opened event. Keep the same
    // event window used by the campaign email view: an early scanner prefetch
    // must not hide a later genuine open (CN-002).
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
          take: 20,
        },
      },
    }),
  ]);

  const sent = totalSent;
  const failed = totalFailed;
  const deliveryRate = sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : 0;

  // Count genuine opens: any event per email must be >= 15 s after sentAt (CN-002).
  // Each CampaignEmail row is already unique, so no dedup loop is needed.
  const OPEN_THRESHOLD_MS = 15_000;
  const openCountByCampaign: Record<string, number> = {};

  for (const email of openedEvents) {
    const sentAt = email.sentAt;
    if (
      sentAt != null &&
      email.deliveryEvents.some(
        (event) => event.occurredAt.getTime() - sentAt.getTime() >= OPEN_THRESHOLD_MS
      )
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

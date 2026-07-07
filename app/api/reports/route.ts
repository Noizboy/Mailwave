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
  ]);

  const sent = totalSent;
  const failed = totalFailed;
  const deliveryRate = sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : 0;

  // Deduplicated open counts per campaign (one open per email, not per event)
  const openGroups = await prisma.deliveryEvent.groupBy({
    by: ["campaignEmailId"],
    where: {
      eventType: "opened",
      campaignEmail: { campaign: { userId } },
    },
    _count: { campaignEmailId: true },
  });

  // Map campaignEmailId → campaignId to bucket opens per campaign
  const openedEmailIds = openGroups.map((g) => g.campaignEmailId);
  const openedEmails =
    openedEmailIds.length > 0
      ? await prisma.campaignEmail.findMany({
          where: { id: { in: openedEmailIds } },
          select: { id: true, campaignId: true },
        })
      : [];

  const openCountByCampaign: Record<string, number> = {};
  for (const e of openedEmails) {
    openCountByCampaign[e.campaignId] = (openCountByCampaign[e.campaignId] ?? 0) + 1;
  }

  const totalOpened = openedEmailIds.length;
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

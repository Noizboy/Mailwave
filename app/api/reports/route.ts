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
    // Fetch opened events with the email's sentAt so we can apply the same
    // 15-second scanner-filter used in the per-email view (CN-002).
    prisma.deliveryEvent.findMany({
      where: { eventType: "opened", campaignEmail: { campaign: { userId } } },
      select: {
        occurredAt: true,
        campaignEmail: { select: { id: true, campaignId: true, sentAt: true } },
      },
    }),
  ]);

  const sent = totalSent;
  const failed = totalFailed;
  const deliveryRate = sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : 0;

  // Deduplicated open counts: one open per email, scanner events filtered out.
  // An event counts as a genuine open only when it arrived >= 15 s after sentAt.
  const OPEN_THRESHOLD_MS = 15_000;
  const openedEmailIdSet = new Set<string>();
  const openCountByCampaign: Record<string, number> = {};

  for (const ev of openedEvents) {
    const { sentAt, id: emailId, campaignId } = ev.campaignEmail;
    if (
      sentAt != null &&
      ev.occurredAt.getTime() - sentAt.getTime() >= OPEN_THRESHOLD_MS &&
      !openedEmailIdSet.has(emailId)
    ) {
      openedEmailIdSet.add(emailId);
      openCountByCampaign[campaignId] = (openCountByCampaign[campaignId] ?? 0) + 1;
    }
  }

  const totalOpened = openedEmailIdSet.size;
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

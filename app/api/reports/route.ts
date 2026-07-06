import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
    prisma.campaign.aggregate({ where: { userId }, _sum: { sentCount: true } }),
    prisma.campaign.aggregate({ where: { userId }, _sum: { failedCount: true } }),
    prisma.campaign.findMany({
      where: { userId, status: { in: ["completed", "sending", "paused"] } },
      select: {
        id: true,
        name: true,
        status: true,
        totalEmails: true,
        sentCount: true,
        failedCount: true,
        skippedCount: true,
        startedAt: true,
        completedAt: true,
        list: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const sent = totalSent._sum.sentCount ?? 0;
  const failed = totalFailed._sum.failedCount ?? 0;
  const deliveryRate = sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : 0;

  return NextResponse.json({
    summary: {
      totalContacts,
      activeContacts,
      totalCampaigns,
      completedCampaigns,
      totalEmailsSent: sent,
      totalFailed: failed,
      deliveryRate,
    },
    campaigns: campaignBreakdown,
  });
}

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
    totalLists,
    activeCampaigns,
    emailsSent,
    failedEmails,
    pendingReviews,
    smtpConfig,
    aiConfig,
    recentCampaigns,
  ] = await Promise.all([
    prisma.contact.count({ where: { userId } }),
    prisma.list.count({ where: { userId } }),
    prisma.campaign.count({ where: { userId, status: { in: ["sending", "paused", "generating", "pending_review", "ready_to_send"] } } }),
    prisma.campaignEmail.count({ where: { campaign: { userId }, status: "sent" } }),
    prisma.campaignEmail.count({ where: { campaign: { userId }, status: "failed" } }),
    prisma.campaignEmail.count({
      where: { campaign: { userId }, approvalStatus: "pending", status: "generated" },
    }),
    prisma.smtpConfig.findUnique({ where: { userId }, select: { status: true } }),
    prisma.aiConfig.findUnique({ where: { userId }, select: { status: true, provider: true } }),
    prisma.campaign.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        status: true,
        totalEmails: true,
        completedAt: true,
        createdAt: true,
        list: { select: { id: true, name: true } },
        emails: {
          select: {
            approvalStatus: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    stats: {
      totalContacts,
      totalLists,
      activeCampaigns,
      emailsSent,
      failedEmails,
      pendingReviews,
    },
    smtpStatus: smtpConfig?.status ?? "disconnected",
    aiStatus: aiConfig?.status ?? "disconnected",
    aiProvider: aiConfig?.provider ?? null,
    recentCampaigns: recentCampaigns.map(({ emails, ...campaign }) => ({
      ...campaign,
      ...deriveCampaignMetrics(emails),
    })),
  });
}

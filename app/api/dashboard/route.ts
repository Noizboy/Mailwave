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
    prisma.campaign.aggregate({ where: { userId }, _sum: { sentCount: true } }),
    prisma.campaign.aggregate({ where: { userId }, _sum: { failedCount: true } }),
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
        sentCount: true,
        failedCount: true,
        pendingCount: true,
        completedAt: true,
        createdAt: true,
        list: { select: { id: true, name: true } },
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
      emailsSent: emailsSent._sum.sentCount ?? 0,
      failedEmails: failedEmails._sum.failedCount ?? 0,
      pendingReviews,
    },
    smtpStatus: smtpConfig?.status ?? "disconnected",
    aiStatus: aiConfig?.status ?? "disconnected",
    aiProvider: aiConfig?.provider ?? null,
    recentCampaigns,
  });
}

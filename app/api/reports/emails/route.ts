import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;
  const url = new URL(req.url);

  const campaignId = url.searchParams.get("campaignId") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const q = url.searchParams.get("q") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const perPage = Math.min(100, Math.max(10, parseInt(url.searchParams.get("perPage") ?? "25")));

  const where: Prisma.CampaignEmailWhereInput = {
    campaign: { userId },
    ...(campaignId ? { campaignId } : {}),
    ...(status ? { status: status as Prisma.EnumCampaignEmailStatusFilter } : {}),
    ...(from || to
      ? {
          sentAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          contact: {
            OR: [
              { email: { contains: q, mode: "insensitive" as const } },
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [total, emails, statsCounts] = await Promise.all([
    prisma.campaignEmail.count({ where }),
    prisma.campaignEmail.findMany({
      where,
      select: {
        id: true,
        status: true,
        approvalStatus: true,
        subject: true,
        sentAt: true,
        errorReason: true,
        campaign: { select: { id: true, name: true } },
        contact: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.campaignEmail.groupBy({
      by: ["status"],
      where: { campaign: { userId } },
      _count: { _all: true },
    }),
  ]);

  const stats = {
    sent: 0,
    failed: 0,
    generated: 0,
    skipped: 0,
    pending: 0,
  };
  for (const row of statsCounts) {
    const key = row.status as keyof typeof stats;
    if (key in stats) stats[key] = row._count._all;
  }

  return NextResponse.json({
    emails,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
    stats,
  });
}

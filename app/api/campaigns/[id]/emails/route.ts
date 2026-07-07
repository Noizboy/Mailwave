import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const approvalStatus = url.searchParams.get("approvalStatus");
  const status = url.searchParams.get("status");
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const perPage = parseInt(url.searchParams.get("perPage") ?? "50");

  const emails = await prisma.campaignEmail.findMany({
    where: {
      campaignId: id,
      OR: [
        { status: "sent" },
        { contact: { status: { not: "suppressed" } } },
      ],
      ...(approvalStatus ? { approvalStatus: approvalStatus as "pending" | "approved" | "rejected" | "skipped" } : {}),
      ...(status ? { status: status as "pending" | "generated" | "approved" | "rejected" | "skipped" | "sending" | "sent" | "failed" } : {}),
    },
    include: {
      contact: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          company: true,
          jobTitle: true,
          status: true,
        },
      },
      deliveryEvents: {
        where: { eventType: "opened" },
        take: 1,
        select: { id: true },
      },
    },
    orderBy: { createdAt: "asc" },
    skip: (page - 1) * perPage,
    take: perPage,
  });

  const total = await prisma.campaignEmail.count({
    where: {
      campaignId: id,
      OR: [
        { status: "sent" },
        { contact: { status: { not: "suppressed" } } },
      ],
      ...(approvalStatus ? { approvalStatus: approvalStatus as "pending" | "approved" | "rejected" | "skipped" } : {}),
    },
  });

  const emailsWithOpened = emails.map(({ deliveryEvents, ...e }) => ({
    ...e,
    opened: deliveryEvents.length > 0,
  }));

  return NextResponse.json({ emails: emailsWithOpened, total, page, pageSize: perPage });
}

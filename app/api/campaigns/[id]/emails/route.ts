import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "skipped"]);
const emailStatusSchema = z.enum(["pending", "generated", "approved", "rejected", "skipped", "sending", "sent", "failed"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const approvalStatusRaw = url.searchParams.get("approvalStatus");
  const statusRaw = url.searchParams.get("status");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("perPage") ?? "50")));

  const approvalStatusParsed = approvalStatusRaw ? approvalStatusSchema.safeParse(approvalStatusRaw) : null;
  const statusParsed = statusRaw ? emailStatusSchema.safeParse(statusRaw) : null;
  if (approvalStatusParsed && !approvalStatusParsed.success) {
    return NextResponse.json({ error: "Invalid approvalStatus" }, { status: 400 });
  }
  if (statusParsed && !statusParsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const approvalStatus = approvalStatusParsed?.data;
  const status = statusParsed?.data;

  const emails = await prisma.campaignEmail.findMany({
    where: {
      campaignId: id,
      OR: [
        { status: "sent" },
        { contact: { status: { not: "suppressed" } } },
      ],
      ...(approvalStatus ? { approvalStatus } : {}),
      ...(status ? { status } : {}),
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
        select: { occurredAt: true },
        orderBy: { occurredAt: "asc" },
        take: 20,
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
      ...(approvalStatus ? { approvalStatus } : {}),
    },
  });

  // An "opened" event only counts as a real human open if it arrived at least
  // 15 s after sentAt. Events within that window are likely scanner / proxy
  // prefetches. Filtering here (rather than at write time) means we never
  // permanently block a real open just because a scanner fired first (CN-002).
  const OPEN_THRESHOLD_MS = 15_000;
  const emailsWithOpened = emails.map(({ deliveryEvents, ...e }) => ({
    ...e,
    opened:
      e.sentAt != null &&
      deliveryEvents.some(
        (ev) => ev.occurredAt.getTime() - e.sentAt!.getTime() >= OPEN_THRESHOLD_MS
      ),
  }));

  return NextResponse.json({ emails: emailsWithOpened, total, page, pageSize: perPage });
}

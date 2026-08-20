import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/session";
import { findOwnedCampaign } from "@/lib/api/ownership";

export const runtime = "nodejs";

const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "skipped"]);
const emailStatusSchema = z.enum(["pending", "generated", "approved", "rejected", "skipped", "sending", "sent", "failed", "not_generated"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await findOwnedCampaign(id, user.id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const approvalStatusRaw = url.searchParams.get("approvalStatus");
  const statusRaw = url.searchParams.get("status");
  const search = url.searchParams.get("search")?.trim();
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

  // "not_generated" is a synthetic filter: contacts in the campaign's list
  // that have no CampaignEmail row yet (generation cancelled or failed
  // mid-way). We query ListMember and return EmailRow-shaped objects with
  // a sentinel status so the frontend can render them alongside real emails.
  if (status === "not_generated") {
    const sendingAccount = await prisma.sendingAccount.findUnique({
      where: { userId: user.id },
      select: { suppressAfterEmails: true },
    });
    const suppressAfterEmails = sendingAccount?.suppressAfterEmails ?? 3;

    if (!campaign.listId) {
      return NextResponse.json({ emails: [], total: 0, page, pageSize: perPage, suppressAfterEmails });
    }

    const notGenWhere = {
      listId: campaign.listId,
      contact: {
        userId: user.id,
        status: { not: "suppressed" as const },
        campaignEmails: { none: { campaignId: id } },
        ...(search ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        } : {}),
      },
    };

    const [members, total] = await Promise.all([
      prisma.listMember.findMany({
        where: notGenWhere,
        include: {
          contact: {
            select: { id: true, email: true, firstName: true, lastName: true, company: true, jobTitle: true, status: true, emailsSentCount: true },
          },
        },
        orderBy: { addedAt: "asc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.listMember.count({ where: notGenWhere }),
    ]);

    const syntheticEmails = members.map((m) => ({
      id: `not-gen-${m.contactId}`,
      subject: null,
      body: null,
      personalizationNotes: null,
      approvalStatus: "pending" as const,
      status: "not_generated" as const,
      errorReason: null,
      sentAt: null,
      opened: false,
      contact: m.contact,
    }));

    return NextResponse.json({ emails: syntheticEmails, total, page, pageSize: perPage, suppressAfterEmails });
  }

  const where: Prisma.CampaignEmailWhereInput = {
    AND: [
      { campaignId: id },
      { OR: [{ status: "sent" }, { contact: { status: { not: "suppressed" } } }] },
      ...(approvalStatus ? [{ approvalStatus }] : []),
      ...(status ? [{ status }] : []),
      ...(search
        ? [{
            OR: [
              { contact: { firstName: { contains: search, mode: "insensitive" as const } } },
              { contact: { lastName: { contains: search, mode: "insensitive" as const } } },
              { contact: { email: { contains: search, mode: "insensitive" as const } } },
            ],
          }]
        : []),
    ],
  };

  const [emails, total, sendingAccount] = await Promise.all([
    prisma.campaignEmail.findMany({
      where,
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
            emailsSentCount: true,
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
    }),
    prisma.campaignEmail.count({ where }),
    prisma.sendingAccount.findUnique({
      where: { userId: user.id },
      select: { suppressAfterEmails: true },
    }),
  ]);

  const suppressAfterEmails = sendingAccount?.suppressAfterEmails ?? 3;

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

  return NextResponse.json({ emails: emailsWithOpened, total, page, pageSize: perPage, suppressAfterEmails });
}

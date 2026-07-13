import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  email: z.email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  aiHint: z.string().optional(),
  customFields: z.record(z.string(), z.string()).optional(),
  listId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const listId = searchParams.get("listId") || "";
  const fromDate = searchParams.get("fromDate") || "";
  const toDate = searchParams.get("toDate") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { userId: session.user.id };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
    ];
  }
  if (listId) {
    where.listMembers = { some: { listId } };
  }
  if (fromDate || toDate) {
    const sentAtFilter: Record<string, Date> = {};
    if (fromDate) sentAtFilter.gte = new Date(fromDate);
    if (toDate) sentAtFilter.lte = new Date(toDate + "T23:59:59.999Z");
    where.campaignEmails = { some: { sentAt: sentAtFilter } };
  }

  const [contacts, total, sendingAccount] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        company: true,
        jobTitle: true,
        status: true,
        emailsSentCount: true,
        createdAt: true,
        listMembers: { include: { list: { select: { id: true, name: true } } } },
        campaignEmails: {
          where: { sentAt: { not: null } },
          orderBy: { sentAt: "desc" },
          take: 1,
          include: { campaign: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.contact.count({ where }),
    prisma.sendingAccount.findUnique({
      where: { userId: session.user.id },
      select: { suppressAfterEmails: true },
    }),
  ]);

  return NextResponse.json({
    contacts,
    total,
    page,
    limit,
    suppressAfterEmails: sendingAccount?.suppressAfterEmails ?? 3,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { listId, ...contactData } = parsed.data;

  // If a listId is supplied, verify it belongs to this user before creating a
  // membership — otherwise a caller could add a contact to another user's list.
  if (listId) {
    const owned = await prisma.list.findFirst({
      where: { id: listId, userId: session.user.id },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const existing = await prisma.contact.findFirst({
    where: { userId: session.user.id, email: contactData.email.toLowerCase() },
  });
  if (existing) {
    return NextResponse.json({ error: "Contact with this email already exists" }, { status: 409 });
  }

  const { customFields, ...restContactData } = contactData;
  const contact = await prisma.contact.create({
    data: {
      ...restContactData,
      email: contactData.email.toLowerCase(),
      userId: session.user.id,
      status: "subscribed",
      ...(customFields ? { customFields } : {}),
    },
  });

  if (listId) {
    await prisma.listMember.create({ data: { listId, contactId: contact.id } });
  }

  return NextResponse.json(contact, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const updateSchema = z.object({
  email: z.email().optional(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  aiHint: z.string().optional().nullable(),
  status: z.enum(["subscribed", "unsubscribed", "suppressed", "invalid"]).optional(),
  customFields: z.record(z.string(), z.string()).optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, userId: session.user.id },
    include: {
      listMembers: { include: { list: { select: { id: true, name: true } } } },
      campaignEmails: {
        include: { campaign: { select: { id: true, name: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (contact.status === "unsubscribed") {
    return NextResponse.json({ error: "Unsubscribed contacts cannot be modified" }, { status: 409 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { customFields, ...rest } = parsed.data;
  const updated = await prisma.contact.update({
    where: { id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { ...rest, ...(customFields !== undefined ? { customFields: customFields as any } : {}) },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.contact.deleteMany({
    where: { id, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}

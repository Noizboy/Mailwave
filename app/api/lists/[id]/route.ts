import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const list = await prisma.list.findFirst({
    where: { id, userId: session.user.id },
    include: {
      members: {
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              company: true,
              status: true,
              emailsSentCount: true,
            },
          },
        },
        orderBy: { addedAt: "desc" },
      },
    },
  });

  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stats = {
    total: list.members.length,
    subscribed: list.members.filter((m) => m.contact.status === "subscribed").length,
    invalid: list.members.filter((m) => m.contact.status === "invalid").length,
    suppressed: list.members.filter((m) => m.contact.status === "suppressed").length,
    unsubscribed: list.members.filter((m) => m.contact.status === "unsubscribed").length,
  };

  return NextResponse.json({ ...list, stats });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const list = await prisma.list.updateMany({
    where: { id, userId: session.user.id },
    data: { name: name.trim() },
  });

  if (list.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.list.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}

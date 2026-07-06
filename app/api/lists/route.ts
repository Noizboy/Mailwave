import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lists = await prisma.list.findMany({
    where: { userId: session.user.id },
    include: {
      _count: { select: { members: true } },
      members: {
        include: { contact: { select: { status: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const listsWithStats = lists.map((list) => ({
    id: list.id,
    name: list.name,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    totalContacts: list._count.members,
    subscribedContacts: list.members.filter((m) => m.contact.status === "subscribed").length,
    issueCount: list.members.filter((m) =>
      ["invalid", "suppressed", "unsubscribed"].includes(m.contact.status)
    ).length,
  }));

  return NextResponse.json(listsWithStats);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "List name is required" }, { status: 400 });
  }

  const list = await prisma.list.create({
    data: { userId: session.user.id, name: name.trim() },
  });

  return NextResponse.json(list, { status: 201 });
}

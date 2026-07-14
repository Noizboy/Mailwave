import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lists = await prisma.list.findMany({
    where: { userId: user.id },
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
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "List name is required" }, { status: 400 });
  }

  const list = await prisma.list.create({
    data: { userId: user.id, name: name.trim() },
  });

  return NextResponse.json(list, { status: 201 });
}

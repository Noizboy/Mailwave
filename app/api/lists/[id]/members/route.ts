import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api/session";
import { findOwnedList } from "@/lib/api/ownership";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const list = await findOwnedList(id, user.id);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { contactIds } = await req.json();
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: "contactIds array required" }, { status: 400 });
  }

  // Verify all contactIds belong to the authenticated user before adding
  const ownedContacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, userId: user.id },
    select: { id: true },
  });
  const ownedIds = ownedContacts.map((c) => c.id);

  const data = ownedIds.map((contactId: string) => ({
    listId: id,
    contactId,
  }));

  if (data.length > 0) await prisma.listMember.createMany({ data, skipDuplicates: true });
  return NextResponse.json({ added: data.length });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const list = await findOwnedList(id, user.id);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { contactIds } = await req.json();
  if (!Array.isArray(contactIds)) {
    return NextResponse.json({ error: "contactIds array required" }, { status: 400 });
  }

  await prisma.listMember.deleteMany({
    where: { listId: id, contactId: { in: contactIds } },
  });

  return NextResponse.json({ removed: contactIds.length });
}

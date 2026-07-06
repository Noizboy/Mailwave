import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const importRecord = await prisma.import.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!importRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { rowId, rowData } = await req.json();
  if (!rowId) return NextResponse.json({ error: "rowId required" }, { status: 400 });

  const row = await prisma.importRow.findFirst({ where: { id: rowId, importId: id } });
  if (!row) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  const { validateEmail } = await import("@/lib/csv");
  const emailCol = Object.keys(rowData).find((k) => /^email/i.test(k));
  const email = emailCol ? rowData[emailCol] : "";

  let status: "valid" | "invalid" | "duplicate" | "missing_data" = row.status as "valid" | "invalid" | "duplicate" | "missing_data";
  let errorReason: string | null = row.errorReason;

  if (!email) {
    status = "missing_data";
    errorReason = "Email is missing";
  } else if (!validateEmail(email)) {
    status = "invalid";
    errorReason = "Invalid email format";
  } else {
    const existing = await prisma.contact.findFirst({
      where: { userId: session.user.id, email: email.trim().toLowerCase() },
    });
    if (existing) {
      status = "duplicate";
      errorReason = "Email already exists";
    } else {
      status = "valid";
      errorReason = null;
    }
  }

  const updated = await prisma.importRow.update({
    where: { id: rowId },
    data: { rowData, status, errorReason },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const importRecord = await prisma.import.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!importRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { rowIds } = await req.json();
  if (!rowIds || !Array.isArray(rowIds)) {
    return NextResponse.json({ error: "rowIds array required" }, { status: 400 });
  }

  await prisma.importRow.deleteMany({
    where: { id: { in: rowIds }, importId: id },
  });

  return NextResponse.json({ deleted: rowIds.length });
}

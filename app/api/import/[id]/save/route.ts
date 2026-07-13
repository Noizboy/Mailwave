import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateEmail } from "@/lib/csv";
import { z } from "zod";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;

  const importRecord = await prisma.import.findFirst({
    where: { id, userId: userId },
    include: { rows: { orderBy: { rowIndex: "asc" } } },
  });
  if (!importRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (importRecord.status === "saved") {
    return NextResponse.json({ error: "Import already saved" }, { status: 409 });
  }

  const bodySchema = z.object({
    listId: z.string().min(1).optional(),
    createListName: z.string().min(1).optional(),
  });
  const bodyParsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!bodyParsed.success) {
    return NextResponse.json({ error: bodyParsed.error.flatten() }, { status: 400 });
  }
  const { listId, createListName } = bodyParsed.data;

  const columnMapping = (importRecord.columnMapping as Record<string, string>) || {};

  let resolvedListId: string | null = listId || null;
  if (createListName && !resolvedListId) {
    const list = await prisma.list.create({
      data: { userId: userId, name: createListName },
    });
    resolvedListId = list.id;
  }

  const emailKey = Object.entries(columnMapping).find(([, v]) => v === "email")?.[0];
  const knownFields = ["email", "firstName", "lastName", "company", "jobTitle", "aiHint"];

  // Build the set of valid rows to import (skip invalid/duplicate/missing)
  type ContactInput = {
    email: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    jobTitle?: string;
    aiHint?: string;
    customFields?: Record<string, string>;
  };
  const toImport: ContactInput[] = [];
  let skippedCount = 0;

  for (const row of importRecord.rows) {
    if (row.status === "duplicate" || row.status === "invalid" || row.status === "missing_data") {
      skippedCount++;
      continue;
    }
    const rowData = row.rowData as Record<string, string>;
    const email = emailKey ? rowData[emailKey]?.trim() : null;
    if (!email || !validateEmail(email)) { skippedCount++; continue; }

    const contactData: Record<string, string | undefined> = {};
    const customFields: Record<string, string> = {};
    for (const [csvCol, field] of Object.entries(columnMapping)) {
      const val = rowData[csvCol];
      if (!val) continue;
      if (knownFields.includes(field)) contactData[field] = val;
      else customFields[csvCol] = val;
    }
    toImport.push({
      email: email.toLowerCase(),
      firstName: contactData.firstName,
      lastName: contactData.lastName,
      company: contactData.company,
      jobTitle: contactData.jobTitle,
      aiHint: contactData.aiHint,
      customFields: Object.keys(customFields).length ? customFields : undefined,
    });
  }

  // Batch import: 4 queries regardless of row count.
  // 1. Find existing contacts by email so we skip their creation.
  const existingContacts = await prisma.contact.findMany({
    where: { userId: userId, email: { in: toImport.map((r) => r.email) } },
    select: { id: true, email: true },
  });
  const existingEmails = new Set(existingContacts.map((c) => c.email));

  // 2. Create new contacts in bulk.
  const newContacts = toImport.filter((r) => !existingEmails.has(r.email));
  if (newContacts.length > 0) {
    await prisma.contact.createMany({
      data: newContacts.map((r) => ({
        userId: userId,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        company: r.company,
        jobTitle: r.jobTitle,
        aiHint: r.aiHint,
        customFields: r.customFields ?? undefined,
        status: "subscribed",
        importId: importRecord.id,
      })),
      skipDuplicates: true,
    });
  }

  // 3. Fetch all contact IDs for the imported emails (existing + newly created).
  const allContacts = await prisma.contact.findMany({
    where: { userId: userId, email: { in: toImport.map((r) => r.email) } },
    select: { id: true },
  });

  // 4. Create list memberships in bulk.
  if (resolvedListId && allContacts.length > 0) {
    await prisma.listMember.createMany({
      data: allContacts.map((c) => ({ listId: resolvedListId!, contactId: c.id })),
      skipDuplicates: true,
    });
  }

  const savedCount = allContacts.length;

  await prisma.import.update({
    where: { id: importRecord.id },
    data: { status: "saved" },
  });

  return NextResponse.json({
    savedCount,
    skippedCount,
    listId: resolvedListId,
  });
}

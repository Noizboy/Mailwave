import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateEmail } from "@/lib/csv";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const importRecord = await prisma.import.findFirst({
    where: { id, userId: session.user.id },
    include: { rows: { orderBy: { rowIndex: "asc" } } },
  });
  if (!importRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (importRecord.status === "saved") {
    return NextResponse.json({ error: "Import already saved" }, { status: 409 });
  }

  const { listId, createListName } = await req.json().catch(() => ({}));

  const columnMapping = (importRecord.columnMapping as Record<string, string>) || {};

  let resolvedListId: string | null = listId || null;
  if (createListName && !resolvedListId) {
    const list = await prisma.list.create({
      data: { userId: session.user.id, name: createListName },
    });
    resolvedListId = list.id;
  }

  const emailKey = Object.entries(columnMapping).find(([, v]) => v === "email")?.[0];

  let savedCount = 0;
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
    for (const [csvCol, field] of Object.entries(columnMapping)) {
      const val = rowData[csvCol];
      if (val) contactData[field] = val;
    }

    const customFields: Record<string, string> = {};
    for (const [csvCol, field] of Object.entries(columnMapping)) {
      const knownFields = ["email", "firstName", "lastName", "company", "jobTitle", "aiHint"];
      if (!knownFields.includes(field)) {
        const val = rowData[csvCol];
        if (val) customFields[csvCol] = val;
      }
    }

    try {
      const contact = await prisma.contact.upsert({
        where: { userId_email: { userId: session.user.id, email: email.toLowerCase() } },
        update: {},
        create: {
          userId: session.user.id,
          email: email.toLowerCase(),
          firstName: contactData.firstName,
          lastName: contactData.lastName,
          company: contactData.company,
          jobTitle: contactData.jobTitle,
          aiHint: contactData.aiHint,
          customFields: Object.keys(customFields).length ? customFields : undefined,
          status: "subscribed",
          importId: importRecord.id,
        },
      });

      if (resolvedListId) {
        await prisma.listMember.upsert({
          where: { listId_contactId: { listId: resolvedListId, contactId: contact.id } },
          update: {},
          create: { listId: resolvedListId, contactId: contact.id },
        });
      }
      savedCount++;
    } catch {
      skippedCount++;
    }
  }

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

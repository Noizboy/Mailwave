import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCsvText, buildColumnMapping, detectEmailColumn, validateEmail } from "@/lib/csv";

export const runtime = "nodejs";

// Caps to prevent memory exhaustion from oversized uploads (CN-008).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 10_000;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
    return NextResponse.json({ error: "File must be a CSV." }, { status: 400 });
  }

  // Reject oversized uploads before reading the body into memory.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `CSV must be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  const text = await file.text();
  const parsed = parseCsvText(text);

  if (parsed.errors.length > 0) {
    return NextResponse.json({ errors: parsed.errors }, { status: 422 });
  }

  if (parsed.rowCount === 0) {
    return NextResponse.json({ errors: ["CSV has no data rows."] }, { status: 422 });
  }

  if (parsed.rowCount > MAX_ROWS) {
    return NextResponse.json(
      { errors: [`CSV has ${parsed.rowCount} rows; the maximum is ${MAX_ROWS}.`] },
      { status: 413 }
    );
  }

  const emailCol = detectEmailColumn(parsed.headers);
  if (!emailCol) {
    return NextResponse.json({ errors: ["No email column found."] }, { status: 422 });
  }

  const columnMapping = buildColumnMapping(parsed.headers);

  // Find existing emails for this user to detect duplicates
  const existingEmails = await prisma.contact.findMany({
    where: { userId },
    select: { email: true },
  });
  const existingEmailSet = new Set(existingEmails.map((c) => c.email.toLowerCase()));

  // Create import record
  const importRecord = await prisma.import.create({
    data: {
      userId,
      filename: file.name,
      rowCount: parsed.rowCount,
      status: "review",
      columnMapping,
    },
  });

  // Create import rows with validation
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  const rowsToCreate = parsed.rows.map((row, idx) => {
    const email = (row[emailCol] || "").trim();
    const emailLower = email.toLowerCase();
    let status: "valid" | "invalid" | "duplicate" | "missing_data" = "valid";
    let errorReason: string | undefined;

    if (!email) {
      status = "missing_data";
      errorReason = "Email is missing";
      invalidCount++;
    } else if (!validateEmail(email)) {
      status = "invalid";
      errorReason = "Invalid email format";
      invalidCount++;
    } else if (existingEmailSet.has(emailLower)) {
      status = "duplicate";
      errorReason = "Email already exists";
      duplicateCount++;
    } else {
      validCount++;
      existingEmailSet.add(emailLower); // prevent in-file dupes
    }

    return {
      importId: importRecord.id,
      rowData: row,
      status,
      errorReason,
      rowIndex: idx,
    };
  });

  await prisma.importRow.createMany({ data: rowsToCreate });

  await prisma.import.update({
    where: { id: importRecord.id },
    data: { validCount, invalidCount, duplicateCount },
  });

  return NextResponse.json({
    importId: importRecord.id,
    filename: file.name,
    rowCount: parsed.rowCount,
    validCount,
    invalidCount,
    duplicateCount,
    headers: parsed.headers,
    columnMapping,
  });
}

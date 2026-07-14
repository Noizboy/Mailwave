import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");

  const EXPORT_LIMIT = 10_000;
  const emails = await prisma.campaignEmail.findMany({
    where: {
      ...(campaignId ? { campaignId } : {}),
      campaign: { userId: user.id },
    },
    include: {
      contact: { select: { email: true, firstName: true, lastName: true, company: true } },
      campaign: { select: { name: true } },
    },
    orderBy: { sentAt: "desc" },
    take: EXPORT_LIMIT,
  });
  const truncated = emails.length === EXPORT_LIMIT;

  const rows = [
    ["Campaign", "First Name", "Last Name", "Email", "Company", "Subject", "Approval", "Status", "Sent At"],
    ...emails.map((e) => [
      e.campaign.name,
      e.contact.firstName ?? "",
      e.contact.lastName ?? "",
      e.contact.email,
      e.contact.company ?? "",
      e.subject ?? "",
      e.approvalStatus,
      e.status,
      e.sentAt ? new Date(e.sentAt).toISOString() : "",
    ]),
  ];

  // Neutralize spreadsheet formula injection: a cell beginning with = + - @
  // (or a tab/CR that some parsers strip to reach those) is executed as a
  // formula by Excel/Sheets. Prefix such values with a single quote so they're
  // treated as literal text. Contact fields originate from imported CSVs, so
  // they are untrusted input.
  const sanitizeCell = (v: unknown): string => {
    const s = String(v);
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  };
  const csv = rows
    .map((r) => r.map((v) => `"${sanitizeCell(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const headers: Record<string, string> = {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="mailwave-export.csv"`,
  };
  if (truncated) headers["X-Truncated"] = "true";

  return new NextResponse(csv, { headers });
}

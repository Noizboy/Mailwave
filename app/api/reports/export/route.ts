import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");

  const emails = await prisma.campaignEmail.findMany({
    where: {
      ...(campaignId ? { campaignId } : {}),
      campaign: { userId: session.user.id },
    },
    include: {
      contact: { select: { email: true, firstName: true, lastName: true, company: true } },
      campaign: { select: { name: true } },
    },
    orderBy: { sentAt: "desc" },
  });

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

  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="mailwave-export.csv"`,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  emailIds: z.array(z.string()).min(1).max(200),
  approvalStatus: z.enum(["approved", "skipped"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Don't allow bulk approval changes while the worker is actively sending or
  // after completion — it can race the send loop.
  if (["sending", "completed"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Emails cannot be changed while the campaign is ${campaign.status}.` },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { emailIds, approvalStatus } = parsed.data;

  const result = await prisma.campaignEmail.updateMany({
    where: {
      id: { in: emailIds },
      campaignId: id,
      contact: { status: { not: "suppressed" } },
    },
    data: { approvalStatus },
  });

  return NextResponse.json({ updated: result.count });
}

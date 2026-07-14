import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/session";
import { findOwnedCampaign } from "@/lib/api/ownership";

export const runtime = "nodejs";

const patchSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
  approvalStatus: z.enum(["pending", "approved", "rejected", "skipped"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, emailId } = await params;

  const campaign = await findOwnedCampaign(id, user.id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Don't allow editing/approval changes while the worker is actively sending
  // or after completion — it can race the send loop or mutate already-sent mail.
  if (["sending", "completed"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Emails cannot be edited while the campaign is ${campaign.status}.` },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const emailExists = await prisma.campaignEmail.findFirst({
    where: { id: emailId, campaignId: id },
    include: { contact: { select: { status: true } } },
  });
  if (!emailExists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (emailExists.contact.status === "suppressed") {
    return NextResponse.json({ error: "Contact is suppressed" }, { status: 403 });
  }

  await prisma.campaignEmail.update({
    where: { id: emailId },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true });
}

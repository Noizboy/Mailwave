import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

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
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, emailId } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const emailExists = await prisma.campaignEmail.findFirst({
    where: { id: emailId, campaignId: id },
  });
  if (!emailExists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.campaignEmail.update({
    where: { id: emailId },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api/session";
import { findOwnedCampaign } from "@/lib/api/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { regenerateCampaignEmail } from "@/lib/campaigns/regenerate-email";

export const runtime = "nodejs";

// Cap single-email regenerations at 10/min/user — this endpoint calls the AI
// provider (spends credits) and previously had no limit, unlike the batch
// generate endpoint (SEC-004).
const REGEN_MAX = 10;
const REGEN_WINDOW_MS = 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`campaign-regenerate:${user.id}`, REGEN_MAX, REGEN_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many regeneration requests. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { RetryAfter: String(rl.retryAfterSeconds) } }
    );
  }

  const { id, emailId } = await params;

  const campaign = await findOwnedCampaign(id, user.id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const campaignEmail = await prisma.campaignEmail.findFirst({
    where: { id: emailId, campaignId: id },
    include: {
      contact: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          company: true,
          jobTitle: true,
          aiHint: true,
          customFields: true,
        },
      },
    },
  });
  if (!campaignEmail) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const target: "subject" | "body" = body.target === "subject" ? "subject" : "body";

  const result = await regenerateCampaignEmail({
    userId: user.id,
    emailId,
    campaign: {
      goal: campaign.goal,
      product: campaign.product,
      cta: campaign.cta,
      tone: campaign.tone,
      language: campaign.language,
      emailLength: campaign.emailLength,
      systemPrompt: campaign.systemPrompt,
    },
    contact: {
      email: campaignEmail.contact.email,
      firstName: campaignEmail.contact.firstName,
      lastName: campaignEmail.contact.lastName,
      company: campaignEmail.contact.company,
      jobTitle: campaignEmail.contact.jobTitle,
      aiHint: campaignEmail.contact.aiHint,
      customFields: campaignEmail.contact.customFields as Record<string, string> | null,
    },
    target,
  });

  if (result.ok) {
    return NextResponse.json({ ok: true, subject: result.subject, body: result.body });
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}

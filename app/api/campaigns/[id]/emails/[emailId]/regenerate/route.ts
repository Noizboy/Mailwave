import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { generateEmail, buildSystemPrompt, buildUserPrompt, PROVIDER_BASE_URLS } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSafeHost } from "@/lib/ssrf";

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
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const rl = await checkRateLimit(`campaign-regenerate:${userId}`, REGEN_MAX, REGEN_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many regeneration requests. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { RetryAfter: String(rl.retryAfterSeconds) } }
    );
  }

  const { id, emailId } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId },
  });
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

  const aiConfig = await prisma.aiConfig.findFirst({
    where: { userId, status: "connected" },
    orderBy: { updatedAt: "desc" },
  });
  if (!aiConfig || !aiConfig.encryptedApiKey || !aiConfig.model) {
    return NextResponse.json({ error: "No connected AI config" }, { status: 400 });
  }

  const apiKey = decrypt(aiConfig.encryptedApiKey);
  const provider = aiConfig.provider as string;
  const model = aiConfig.model;
  const baseUrl = aiConfig.baseUrl ?? PROVIDER_BASE_URLS[provider] ?? undefined;

  // Re-validate a user-supplied AI base URL before the outbound call (TOCTOU /
  // DNS-rebinding — CN-005). Built-in provider URLs are trusted.
  if (aiConfig.baseUrl) {
    const hostCheck = await assertSafeHost(aiConfig.baseUrl);
    if (!hostCheck.ok) {
      return NextResponse.json({ error: hostCheck.reason ?? "AI base URL not allowed." }, { status: 400 });
    }
  }

  const systemPrompt = buildSystemPrompt({
    goal: campaign.goal,
    product: campaign.product,
    cta: campaign.cta,
    tone: campaign.tone,
    language: campaign.language,
    emailLength: campaign.emailLength,
    basePrompt: campaign.systemPrompt,
  });

  const { contact } = campaignEmail;
  const userPrompt = buildUserPrompt({
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    jobTitle: contact.jobTitle,
    aiHint: contact.aiHint,
    customFields: contact.customFields as Record<string, string> | null,
  });

  const body = await req.json().catch(() => ({}));
  const target: "subject" | "body" = body.target === "subject" ? "subject" : "body";

  try {
    const result = await generateEmail({
      provider: provider as "openai" | "anthropic" | "google_gemini" | "openrouter" | "custom",
      model,
      apiKey,
      baseUrl,
      systemPrompt,
      userPrompt,
    });

    const updateData =
      target === "subject"
        ? { subject: result.subject, modelUsed: model }
        : {
            body: result.body,
            personalizationNotes: result.personalizationNotes,
            promptUsed: userPrompt,
            modelUsed: model,
            generatedAt: new Date(),
            status: "generated" as const,
            approvalStatus: "pending" as const,
            errorReason: null,
          };

    const updated = await prisma.campaignEmail.update({
      where: { id: emailId },
      data: updateData,
    });

    return NextResponse.json({ ok: true, subject: updated.subject, body: updated.body });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { generateEmail, buildSystemPrompt, buildUserPrompt, PROVIDER_BASE_URLS, DEFAULT_MODELS } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
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
  if (!aiConfig || !aiConfig.encryptedApiKey) {
    return NextResponse.json({ error: "No connected AI config" }, { status: 400 });
  }

  const apiKey = decrypt(aiConfig.encryptedApiKey);
  const provider = aiConfig.provider as string;
  const model = campaign.aiModel ?? DEFAULT_MODELS[provider] ?? "gpt-4o-mini";
  const baseUrl = aiConfig.baseUrl ?? PROVIDER_BASE_URLS[provider] ?? undefined;

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

  try {
    const result = await generateEmail({
      provider: provider as "openai" | "anthropic" | "google_gemini" | "openrouter" | "custom",
      model,
      apiKey,
      baseUrl,
      systemPrompt,
      userPrompt,
    });

    const updated = await prisma.campaignEmail.update({
      where: { id: emailId },
      data: {
        subject: result.subject,
        body: result.body,
        personalizationNotes: result.personalizationNotes,
        promptUsed: userPrompt,
        modelUsed: model,
        generatedAt: new Date(),
        status: "generated",
        approvalStatus: "pending",
        errorReason: null,
      },
    });

    return NextResponse.json({ ok: true, subject: updated.subject, body: updated.body });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}

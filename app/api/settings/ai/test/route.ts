import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { generateEmail, buildSystemPrompt, buildUserPrompt, PROVIDER_BASE_URLS, DEFAULT_MODELS, type AiProviderName } from "@/lib/ai";
import { APIConnectionError, AuthenticationError, NotFoundError, RateLimitError, PermissionDeniedError } from "openai";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.aiConfig.findUnique({ where: { userId: session.user.id } });
  const provider = config?.provider as AiProviderName | undefined;
  const isCodex = provider === "codex";

  if (!config || (!isCodex && !config.encryptedApiKey)) {
    return NextResponse.json({ error: "AI not configured" }, { status: 422 });
  }
  if (isCodex && !config.oauthConnected) {
    return NextResponse.json({ error: "Codex not connected" }, { status: 422 });
  }

  let success = false;
  let errorMessage: string | null = null;

  try {
    const apiKey = !isCodex ? decrypt(config.encryptedApiKey!) : "";
    const model = config.model ?? DEFAULT_MODELS[provider!] ?? "gpt-4o-mini";
    const baseUrl = config.baseUrl ?? PROVIDER_BASE_URLS[provider!] ?? undefined;

    await generateEmail({
      provider: provider!,
      model,
      apiKey,
      baseUrl,
      userId: isCodex ? session.user.id : undefined,
      systemPrompt: buildSystemPrompt({
        goal: "Test connection",
        tone: "professional",
        language: "en",
        emailLength: "short",
      }),
      userPrompt: buildUserPrompt({ email: "test@example.com" }),
    });

    success = true;
  } catch (err) {
    errorMessage = friendlyAiError(err);
  }

  await prisma.aiConfig.update({
    where: { userId: session.user.id },
    data: {
      status: success ? "connected" : "error",
      testedAt: new Date(),
    },
  });

  if (success) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: errorMessage }, { status: 422 });
}

function friendlyAiError(err: unknown): string {
  if (err instanceof APIConnectionError) {
    return "Could not reach the provider. Check the Base URL and your network connection.";
  }
  if (err instanceof AuthenticationError) {
    return "Invalid API key. Check your credentials and try again.";
  }
  if (err instanceof PermissionDeniedError) {
    return "Access denied. Your API key may not have permission to use this model.";
  }
  if (err instanceof NotFoundError) {
    return "Model not found. Check the model name is correct for this provider.";
  }
  if (err instanceof RateLimitError) {
    return "Rate limit reached. Wait a moment and try again.";
  }
  // Anthropic SDK errors share the same class names but are separate imports —
  // check by constructor name to avoid a second import.
  if (err instanceof Error) {
    const name = err.constructor.name;
    if (name === "APIConnectionError") {
      return "Could not reach the provider. Check the Base URL and your network connection.";
    }
    if (name === "AuthenticationError") {
      return "Invalid API key. Check your credentials and try again.";
    }
    if (name === "PermissionDeniedError") {
      return "Access denied. Your API key may not have permission to use this model.";
    }
    if (name === "NotFoundError") {
      return "Model not found. Check the model name is correct for this provider.";
    }
    if (name === "RateLimitError") {
      return "Rate limit reached. Wait a moment and try again.";
    }
  }
  return "An unexpected error occurred. Check your provider settings and try again.";
}

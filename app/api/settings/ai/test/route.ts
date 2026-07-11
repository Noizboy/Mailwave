import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateEmail, buildSystemPrompt, buildUserPrompt, PROVIDER_BASE_URLS, DEFAULT_MODELS, type AiProviderName } from "@/lib/ai";
import { APIConnectionError, AuthenticationError, NotFoundError, RateLimitError, PermissionDeniedError, BadRequestError, APIError } from "openai";

export const runtime = "nodejs";

// SEC-003: cap real AI provider calls at 5/min/user so a frontend bug or
// attacker cannot drain the user's provider credits through this endpoint.
const AI_TEST_MAX = 5;
const AI_TEST_WINDOW_MS = 60 * 1000;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`ai-test:${session.user.id}`, AI_TEST_MAX, AI_TEST_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many AI test requests. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { RetryAfter: String(rl.retryAfterSeconds) } }
    );
  }

  const config = await prisma.aiConfig.findUnique({ where: { userId: session.user.id } });
  const providerName = config?.provider as string | undefined;

  if (!config || !config.encryptedApiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 422 });
  }

  let success = false;
  let errorMessage: string | null = null;

  try {
    const provider = providerName as AiProviderName;
    const apiKey = decrypt(config.encryptedApiKey);
    const model = config.model ?? DEFAULT_MODELS[provider!] ?? "gpt-4o-mini";
    const baseUrl = config.baseUrl ?? PROVIDER_BASE_URLS[provider!] ?? undefined;

    await generateEmail({
      provider: provider!,
      model,
      apiKey,
      baseUrl,
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
    console.error("[AI test] provider=%s error=%s status=%s msg=%s",
      providerName,
      err instanceof Error ? err.constructor.name : typeof err,
      (err as { status?: number }).status ?? "n/a",
      err instanceof Error ? err.message : String(err),
    );
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
  if (err instanceof BadRequestError) {
    return "Bad request. For OpenRouter, use the format 'provider/model' (e.g. openai/gpt-4o-mini).";
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
    if (name === "BadRequestError") {
      return "Bad request. For OpenRouter, use the format 'provider/model' (e.g. openai/gpt-4o-mini).";
    }
    if (name === "UnprocessableEntityError") {
      return "The provider rejected the model or request. Check the model name is valid for this provider.";
    }
    // Fallback: if the error has a status code, surface it directly
    const status = (err as { status?: number }).status;
    if (typeof status === "number") {
      if (status === 402) return "Insufficient credits on your provider account. Add credits and try again.";
      console.error("[AI test] API error status=%s name=%s msg=%s", status, name, err.message);
      return `Provider error (${status}): ${err.message}`;
    }
    console.error("[AI test] Unrecognized error:", name, err.message);
  }
  // Catch-all for any remaining OpenAI SDK API errors (e.g. 402 payment required)
  if (err instanceof APIError) {
    if (err.status === 402) {
      return "Insufficient credits on your provider account. Add credits and try again.";
    }
    console.error("[AI test] APIError status=%s message=%s", err.status, err.message);
    return `Provider error (${err.status}): ${err.message}`;
  }
  return "An unexpected error occurred. Check your provider settings and try again.";
}

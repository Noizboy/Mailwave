import { describe, it, expect, vi, beforeEach } from "vitest";

const { anthropicCreate, openaiCreate, assertSafeHostMock } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openaiCreate: vi.fn(),
  assertSafeHostMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return { messages: { create: anthropicCreate } };
  }),
}));

vi.mock("openai", () => ({
  default: vi.fn(function (this: unknown, opts: { baseURL?: string }) {
    openaiConstructorOpts.push(opts);
    return { chat: { completions: { create: openaiCreate } } };
  }),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((c: string) => `decrypted:${c}`),
}));

vi.mock("@/lib/ssrf", () => ({
  assertSafeHost: assertSafeHostMock,
}));

const openaiConstructorOpts: { baseURL?: string }[] = [];

import { generateEmail, buildSystemPrompt, buildUserPrompt, resolveAiConfig } from "./ai";

const VALID_JSON = JSON.stringify({
  subject: "Hi Alice",
  body: "Line one.\nLine two.",
  personalizationNotes: "Mentioned Acme",
});

function anthropicResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

function openaiResponse(text: string) {
  return { choices: [{ message: { content: text } }] };
}

const baseInput = {
  model: "test-model",
  apiKey: "test-key",
  systemPrompt: "You are a copywriter.",
  userPrompt: "Write to Alice.",
};

describe("generateEmail", () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    openaiCreate.mockReset();
    openaiConstructorOpts.length = 0;
  });

  it("uses the Anthropic client for provider=anthropic", async () => {
    anthropicCreate.mockResolvedValue(anthropicResponse(VALID_JSON));
    const result = await generateEmail({ ...baseInput, provider: "anthropic" });
    expect(anthropicCreate).toHaveBeenCalledOnce();
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(result.subject).toBe("Hi Alice");
    expect(result.body).toBe("Line one.\nLine two.");
  });

  it("uses the OpenAI-compatible client for provider=openai", async () => {
    openaiCreate.mockResolvedValue(openaiResponse(VALID_JSON));
    const result = await generateEmail({ ...baseInput, provider: "openai" });
    expect(openaiCreate).toHaveBeenCalledOnce();
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(result.personalizationNotes).toBe("Mentioned Acme");
  });

  it("passes baseUrl through for custom providers", async () => {
    openaiCreate.mockResolvedValue(openaiResponse(VALID_JSON));
    await generateEmail({ ...baseInput, provider: "custom", baseUrl: "http://localhost:9999/v1" });
    expect(openaiConstructorOpts[0]?.baseURL).toBe("http://localhost:9999/v1");
  });

  it("strips markdown code fences when the model ignores instructions", async () => {
    openaiCreate.mockResolvedValue(openaiResponse("```json\n" + VALID_JSON + "\n```"));
    const result = await generateEmail({ ...baseInput, provider: "openai" });
    expect(result.subject).toBe("Hi Alice");
  });

  it("falls back to raw content when JSON parsing fails", async () => {
    openaiCreate.mockResolvedValue(openaiResponse("Dear Alice, plain text — not JSON."));
    const result = await generateEmail({ ...baseInput, provider: "openai" });
    expect(result.subject).toBe("Generated Subject");
    expect(result.body).toBe("Dear Alice, plain text — not JSON.");
    expect(result.personalizationNotes).toContain("JSON parse failed");
  });

  it("handles empty completion content without throwing", async () => {
    openaiCreate.mockResolvedValue({ choices: [] });
    const result = await generateEmail({ ...baseInput, provider: "openai" });
    expect(result.subject).toBe("Generated Subject");
    expect(result.body).toBe("");
  });
});

describe("buildSystemPrompt", () => {
  it("includes all provided campaign fields", () => {
    const prompt = buildSystemPrompt({
      goal: "Book demos",
      product: "MailWave",
      cta: "Schedule a call",
      tone: "friendly",
      language: "Spanish",
      emailLength: "short",
    });
    expect(prompt).toContain("- Goal: Book demos");
    expect(prompt).toContain("Product/Service: MailWave");
    expect(prompt).toContain("Primary CTA: Schedule a call");
    expect(prompt).toContain("Tone: friendly");
    expect(prompt).toContain("Language: Spanish");
    expect(prompt).toContain("1-2 paragraphs");
  });

  it("omits null fields and defaults tone to professional", () => {
    const prompt = buildSystemPrompt({ language: "English", emailLength: "medium" });
    expect(prompt).not.toContain("Campaign Goal");
    expect(prompt).not.toContain("Product/Service");
    expect(prompt).toContain("Tone: professional");
    expect(prompt).toContain("3-4 paragraphs");
  });

  it("uses the long-length guide for emailLength=long", () => {
    const prompt = buildSystemPrompt({ language: "English", emailLength: "long" });
    expect(prompt).toContain("5+ paragraphs");
  });
});

describe("buildUserPrompt", () => {
  it("assembles the full name from first and last", () => {
    const prompt = buildUserPrompt({
      email: "alice@acme.com",
      firstName: "Alice",
      lastName: "Smith",
      company: "Acme",
      jobTitle: "CTO",
      aiHint: "Met at conference",
    });
    expect(prompt).toContain("Name: Alice Smith");
    expect(prompt).toContain("Company: Acme");
    expect(prompt).toContain("Job Title: CTO");
    expect(prompt).toContain("Additional context about this person: Met at conference");
  });

  it("omits the name line when both name parts are missing", () => {
    const prompt = buildUserPrompt({ email: "x@y.com" });
    expect(prompt).toContain("Email: x@y.com");
    expect(prompt).not.toContain("Name:");
  });

  it("appends custom fields as a block", () => {
    const prompt = buildUserPrompt({
      email: "x@y.com",
      customFields: { industry: "SaaS", region: "LATAM" },
    });
    expect(prompt).toContain("Custom Fields:");
    expect(prompt).toContain("industry: SaaS");
    expect(prompt).toContain("region: LATAM");
  });

  it("omits the custom-fields block when empty", () => {
    const prompt = buildUserPrompt({ email: "x@y.com", customFields: {} });
    expect(prompt).not.toContain("Custom Fields:");
  });
});

describe("resolveAiConfig", () => {
  const baseRaw = {
    provider: "openai",
    model: "gpt-4o-mini",
    encryptedApiKey: "enc-key",
    baseUrl: null,
  };

  beforeEach(() => {
    assertSafeHostMock.mockReset();
    assertSafeHostMock.mockResolvedValue({ ok: true });
  });

  it("returns a resolved config with decrypted key, model, and undefined base URL", async () => {
    const result = await resolveAiConfig(baseRaw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.provider).toBe("openai");
    expect(result.config.model).toBe("gpt-4o-mini");
    expect(result.config.apiKey).toBe("decrypted:enc-key");
    expect(result.config.baseUrl).toBeUndefined();
  });

  it("falls back to DEFAULT_MODELS when model is null", async () => {
    const result = await resolveAiConfig({ ...baseRaw, model: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.model).toBe("gpt-4o-mini");
  });

  it("uses modelOverride when provided and non-null", async () => {
    const result = await resolveAiConfig(baseRaw, { modelOverride: "gpt-4o" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.model).toBe("gpt-4o");
  });

  it("returns no-api-key error when encryptedApiKey is null", async () => {
    const result = await resolveAiConfig({ ...baseRaw, encryptedApiKey: null });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("no-api-key");
    expect(result.error.message).toBe("AI config has no API key stored");
  });

  it("returns no-model error when requireModel is true and model is null", async () => {
    const result = await resolveAiConfig({ ...baseRaw, model: null }, { requireModel: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("no-model");
  });

  it("does NOT return no-model when requireModel is false (falls back to DEFAULT_MODELS)", async () => {
    const result = await resolveAiConfig({ ...baseRaw, model: null });
    expect(result.ok).toBe(true);
  });

  it("validates a custom base URL via assertSafeHost and rejects unsafe hosts", async () => {
    assertSafeHostMock.mockResolvedValue({ ok: false, reason: "Host resolves to a private/reserved IP range." });
    const result = await resolveAiConfig({ ...baseRaw, baseUrl: "http://internal:8080/v1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unsafe-base-url");
    expect(result.error.message).toBe("Host resolves to a private/reserved IP range.");
    expect(assertSafeHostMock).toHaveBeenCalledWith("http://internal:8080/v1");
  });

  it("uses 'unsafe host' as fallback reason when assertSafeHost returns no reason", async () => {
    assertSafeHostMock.mockResolvedValue({ ok: false });
    const result = await resolveAiConfig({ ...baseRaw, baseUrl: "http://internal:8080/v1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe("unsafe host");
  });

  it("passes validation for a safe custom base URL", async () => {
    assertSafeHostMock.mockResolvedValue({ ok: true });
    const result = await resolveAiConfig({ ...baseRaw, baseUrl: "https://api.customai.com/v1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.baseUrl).toBe("https://api.customai.com/v1");
  });

  it("resolves built-in provider base URLs without calling assertSafeHost", async () => {
    const result = await resolveAiConfig({
      ...baseRaw,
      provider: "google_gemini",
      baseUrl: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(assertSafeHostMock).not.toHaveBeenCalled();
  });

  it("prefers a custom base URL over the built-in provider URL", async () => {
    const result = await resolveAiConfig({
      ...baseRaw,
      provider: "google_gemini",
      baseUrl: "https://custom.example.com/v1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.baseUrl).toBe("https://custom.example.com/v1");
    expect(assertSafeHostMock).toHaveBeenCalledWith("https://custom.example.com/v1");
  });
});

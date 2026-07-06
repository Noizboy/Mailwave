import { describe, it, expect, vi, beforeEach } from "vitest";

const anthropicCreate = vi.fn();
const openaiCreate = vi.fn();

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

const openaiConstructorOpts: { baseURL?: string }[] = [];

import { generateEmail, buildSystemPrompt, buildUserPrompt } from "./ai";

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
    expect(prompt).toContain("Campaign Goal: Book demos");
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

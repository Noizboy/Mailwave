// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs before the vi.mock factory is evaluated, so the mock fn is
// available inside the factory.
const { generateEmail } = vi.hoisted(() => ({
  generateEmail: vi.fn(),
}));

vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");
vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn(() => "decrypted-key"),
  encrypt: vi.fn(() => "encrypted"),
}));
vi.mock("@/lib/ai", () => ({
  generateEmail,
  buildSystemPrompt: vi.fn(() => "sys"),
  buildUserPrompt: vi.fn(() => "usr"),
  PROVIDER_BASE_URLS: {},
  DEFAULT_MODELS: { openai: "gpt-4o-mini" },
  resolveAiConfig: vi.fn().mockResolvedValue({
    ok: true,
    config: {
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "decrypted-key",
      baseUrl: undefined,
    },
  }),
}));

import { prisma } from "@/lib/prisma";
import { __resetRateLimitStore } from "@/lib/rate-limit";
import { mockSession } from "@/test/api-helpers";
import { POST as testAi } from "./route";

const mocked = vi.mocked;

describe("POST /api/settings/ai/test", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockSession("user-1");
    await __resetRateLimitStore();
  });

  it("returns 422 when AI is not configured", async () => {
    mocked(prisma.aiConfig.findUnique).mockResolvedValue(null as never);
    const res = await testAi();
    expect(res.status).toBe(422);
  });

  // SEC-003: more than 5 calls/min/user from the same user return 429 and
  // never reach the AI provider.
  it("returns 429 once the 5/min per-user quota is exceeded", async () => {
    mocked(prisma.aiConfig.findUnique).mockResolvedValue({
      provider: "openai",
      encryptedApiKey: "encrypted",
      model: "gpt-4o-mini",
      baseUrl: null,
    } as never);
    generateEmail.mockResolvedValue({ subject: "ok", body: "ok" });
    mocked(prisma.aiConfig.update).mockResolvedValue({} as never);

    for (let i = 0; i < 5; i++) {
      const res = await testAi();
      expect(res.status).toBe(200);
    }
    const sixth = await testAi();
    expect(sixth.status).toBe(429);
    expect(generateEmail).toHaveBeenCalledTimes(5);
    expect(sixth.headers.get("retryafter")).toBeTruthy();
  });
});

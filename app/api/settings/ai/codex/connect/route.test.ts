import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomBytes: vi.fn((size: number) => {
      // Return predictable bytes for testing
      return Buffer.alloc(size, 0xab);
    }),
  };
});

import { auth } from "@/lib/auth";
import { GET } from "./route";

const mockedAuth = vi.mocked(auth);

function makeRequest() {
  return new Request("http://localhost:3000/api/settings/ai/codex/connect");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_CLIENT_ID = "test-client-id";
  process.env.NEXTAUTH_URL = "http://localhost:3000";
});

describe("GET /api/settings/ai/codex/connect", () => {
  it("redirects to login when unauthenticated", async () => {
    mockedAuth.mockResolvedValueOnce(null as never);
    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("returns 500 when OPENAI_CLIENT_ID is missing", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } } as never);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env.OPENAI_CLIENT_ID;
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("redirects to OpenAI authorize URL with correct params and sets cookie", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } } as never);
    const res = await GET();

    // Should redirect
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    const url = new URL(location);

    expect(url.hostname).toBe("auth.openai.com");
    expect(url.pathname).toBe("/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toContain("/api/settings/ai/codex/callback");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBeTruthy();

    // Cookie should be set
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("codex_oauth_state");
    expect(setCookie).toContain("HttpOnly");
  });
});

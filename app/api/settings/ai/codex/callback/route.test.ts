import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiConfig: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace("enc:", "")),
}));

// Mock fetch for the OpenAI token endpoint
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedUpsert = vi.mocked(prisma.aiConfig.upsert);

const VALID_STATE = "abc123";
const VALID_VERIFIER = "verifier-xyz";
const COOKIE_VALUE = `${VALID_STATE}:${VALID_VERIFIER}`;

function makeRequest(params: Record<string, string>, cookieValue?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/settings/ai/codex/callback");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set("cookie", `codex_oauth_state=${cookieValue}`);
  }
  return new NextRequest(url.toString(), { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_CLIENT_ID = "test-client-id";
  process.env.OPENAI_CLIENT_SECRET = "test-client-secret";
  process.env.NEXTAUTH_URL = "http://localhost:3000";
});

describe("GET /api/settings/ai/codex/callback", () => {
  it("redirects to login when unauthenticated", async () => {
    mockedAuth.mockResolvedValueOnce(null as never);
    const req = makeRequest({ code: "code", state: VALID_STATE }, COOKIE_VALUE);
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects to error URL when error param is present", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } } as never);
    const req = makeRequest({ error: "access_denied", state: VALID_STATE }, COOKIE_VALUE);
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("codex=error");
  });

  it("redirects to error URL on state mismatch", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } } as never);
    const req = makeRequest({ code: "code", state: "wrong-state" }, COOKIE_VALUE);
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("codex=error");
  });

  it("redirects to error URL when cookie is missing", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } } as never);
    const req = makeRequest({ code: "code", state: VALID_STATE });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("codex=error");
  });

  it("redirects to error URL when token endpoint returns non-ok", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } } as never);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
    const req = makeRequest({ code: "code", state: VALID_STATE }, COOKIE_VALUE);
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("codex=error");
  });

  it("saves encrypted tokens and redirects to success URL on valid flow", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } } as never);
    mockedUpsert.mockResolvedValueOnce({} as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "tok_access",
        refresh_token: "tok_refresh",
        expires_in: 3600,
      }),
    });

    const req = makeRequest({ code: "auth-code", state: VALID_STATE }, COOKIE_VALUE);
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("codex=connected");

    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        create: expect.objectContaining({
          provider: "codex",
          oauthConnected: true,
          oauthAccessToken: "enc:tok_access",
          oauthRefreshToken: "enc:tok_refresh",
        }),
        update: expect.objectContaining({
          provider: "codex",
          oauthConnected: true,
          oauthAccessToken: "enc:tok_access",
        }),
      })
    );

    // Cookie should be cleared
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("codex_oauth_state=");
  });
});

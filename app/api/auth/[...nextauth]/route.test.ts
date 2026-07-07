// @vitest-environment node
//
// TSB-003: Auth contract integration test.
//
// This file locks down the reusable NextAuth v5 contract that TestSprite and
// other black-box tests depend on:
//   1. Unauthenticated protected routes return HTTP 401 with `{ error: "Unauthorized" }`.
//   2. The real `authorize` function from `lib/auth.ts` accepts valid seed
//      credentials (`demo@mailwave.app` / `password123`) and returns the user
//      object; rejects invalid credentials and unknown users with `null`.
//   3. Rate limiting blocks repeated failures before the user is consulted.
//
// next-auth v5 cannot be imported in the Vitest node environment (its internal
// `env.js` imports `next/server` via a bare specifier that Node's ESM resolver
// rejects). To test the REAL authorize logic without loading the real next-auth
// internals, we mock the `next-auth` module so that the `NextAuth({...})` call
// in `lib/auth.ts` captures the real `authorize` function passed to the
// `Credentials` provider. We then exercise that function directly with mocked
// Prisma + rate-limit dependencies.
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import bcrypt from "bcryptjs";

// Capture the real `authorize` function passed to the Credentials provider.
// `vi.hoisted` makes this reference available inside the hoisted `vi.mock`
// factory below (which runs before any other code in the file).
const { capturedAuthorize } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  capturedAuthorize: { current: null as ((credentials: any, req: any) => Promise<any>) | null },
}));

vi.mock("next-auth", () => {
  return {
    default: (config: { providers?: Array<Record<string, unknown>> }) => {
      const credProvider = config.providers?.find(
        (p) => typeof p === "object" && p !== null && "authorize" in p
      );
      if (credProvider && typeof credProvider.authorize === "function") {
        capturedAuthorize.current = credProvider.authorize as typeof capturedAuthorize.current;
      }
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      };
    },
    // Credentials provider factory passes options through so `authorize` is captured above.
    Credentials: (opts: Record<string, unknown>) => ({ id: "credentials", ...opts }),
    // CredentialsSignin is the base class for RateLimitError — provide a stub.
    CredentialsSignin: class CredentialsSignin {
      code = "credentials";
    },
  };
});

// IMPORTANT: `Credentials` is imported from `next-auth/providers/credentials`, not
// from `next-auth`. The real Credentials provider WRAPS `authorize` in a normalizer
// that returns null when called directly outside the NextAuth request pipeline, which
// would defeat the capture above. Mock it as a pass-through so the original authorize
// function is retained on the provider object and captured by the `next-auth` mock.
vi.mock("next-auth/providers/credentials", () => ({
  default: (opts: Record<string, unknown>) => ({ id: "credentials", ...opts }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  isBlocked: vi.fn().mockResolvedValue({ blocked: false, retryAfterSeconds: 0 }),
  recordFailure: vi.fn().mockResolvedValue(undefined),
  resetFailures: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { isBlocked, recordFailure, resetFailures } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import { GET as getContacts } from "@/app/api/contacts/route";

const mocked = vi.mocked;

// Seed user mirrors `prisma/seed.ts` (demo@mailwave.app / password123).
const SEED_EMAIL = "demo@mailwave.app";
const SEED_PASSWORD = "password123";
let seedHash: string;

beforeAll(async () => {
  seedHash = await bcrypt.hash(SEED_PASSWORD, 4);
});

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3001/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(isBlocked).mockResolvedValue({ blocked: false, retryAfterSeconds: 0 });
  mocked(prisma.user.findUnique).mockResolvedValue(null as never);
});

describe("Auth contract — protected routes return 401 when unauthenticated", () => {
  it("returns 401 with `{ error: 'Unauthorized' }` body", async () => {
    const res = await getContacts(new NextRequest("http://localhost:3001/api/contacts"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});

describe("Auth contract — authorize function (real lib/auth.ts logic)", () => {
  it("returns the user object for valid seed credentials and resets rate-limit failures", async () => {
    mocked(prisma.user.findUnique).mockResolvedValue({
      id: "seed-user-1",
      email: SEED_EMAIL,
      name: "Demo User",
      passwordHash: seedHash,
    } as never);

    const result = await capturedAuthorize.current!(
      { email: SEED_EMAIL, password: SEED_PASSWORD },
      makeRequest({ "x-forwarded-for": "127.0.0.1" })
    );

    expect(result).toEqual({
      id: "seed-user-1",
      email: SEED_EMAIL,
      name: "Demo User",
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: SEED_EMAIL } })
    );
    // Successful login resets failures for both IP and account keys.
    expect(resetFailures).toHaveBeenCalledWith(expect.stringContaining("login:ip:127.0.0.1"));
    expect(resetFailures).toHaveBeenCalledWith(expect.stringContaining("login:acct:demo@mailwave.app"));
  });

  it("returns null for invalid credentials and records failures", async () => {
    mocked(prisma.user.findUnique).mockResolvedValue({
      id: "seed-user-1",
      email: SEED_EMAIL,
      name: "Demo User",
      passwordHash: seedHash,
    } as never);

    const result = await capturedAuthorize.current!(
      { email: SEED_EMAIL, password: "definitely-wrong-password" },
      makeRequest({ "x-forwarded-for": "127.0.0.1" })
    );

    expect(result).toBeNull();
    // Failed login records failures for both IP and account keys.
    expect(recordFailure).toHaveBeenCalledWith(expect.stringContaining("login:ip:127.0.0.1"));
    expect(recordFailure).toHaveBeenCalledWith(expect.stringContaining("login:acct:demo@mailwave.app"));
  });

  it("returns null for an unknown user and records failures", async () => {
    mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const result = await capturedAuthorize.current!(
      { email: "nobody@mailwave.app", password: "password123" },
      makeRequest({ "x-forwarded-for": "10.0.0.1" })
    );

    expect(result).toBeNull();
    expect(recordFailure).toHaveBeenCalledWith(expect.stringContaining("login:ip:10.0.0.1"));
    expect(recordFailure).toHaveBeenCalledWith(expect.stringContaining("login:acct:nobody@mailwave.app"));
  });

  it("returns null for credentials that fail schema validation (missing email) without hitting the database", async () => {
    const result = await capturedAuthorize.current!(
      { email: "", password: "short" },
      makeRequest({ "x-forwarded-for": "127.0.0.1" })
    );

    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalledWith(expect.stringContaining("login:ip:127.0.0.1"));
  });

  it("throws (rate-limited) when the IP key is blocked before consulting the database", async () => {
    mocked(isBlocked).mockImplementation((key: string) =>
      key.includes("login:ip:")
        ? Promise.resolve({ blocked: true, retryAfterSeconds: 900 })
        : Promise.resolve({ blocked: false, retryAfterSeconds: 0 })
    );

    await expect(
      capturedAuthorize.current!(
        { email: SEED_EMAIL, password: SEED_PASSWORD },
        makeRequest({ "x-forwarded-for": "127.0.0.1" })
      )
    ).rejects.toThrow();

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

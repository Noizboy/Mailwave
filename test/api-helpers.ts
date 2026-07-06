import { vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// Requires `vi.mock("@/lib/auth")` in the calling test file (manual mock in lib/__mocks__/auth.ts).
export function mockSession(userId: string | null) {
  const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
  mockedAuth.mockResolvedValue(userId ? { user: { id: userId } } : null);
}

export function jsonRequest(
  path: string,
  options: { method?: string; body?: unknown; searchParams?: Record<string, string> } = {}
): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, {
    method: options.method ?? "GET",
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

// Route handler `context.params` is a Promise in this Next.js version.
export function routeParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

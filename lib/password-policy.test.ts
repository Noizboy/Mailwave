import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validatePassword, validatePasswordLength, checkPasswordBreach } from "./password-policy";

// Mock the global fetch so the breach-list test is hermetic.
// Node 20's built-in fetch needs direct assignment — vi.stubGlobal doesn't
// always intercept it in module scope.
const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
});

describe("validatePasswordLength", () => {
  it("rejects passwords shorter than 12 characters", () => {
    expect(validatePasswordLength("short").ok).toBe(false);
    expect(validatePasswordLength("11charshe").ok).toBe(false);
    expect(validatePasswordLength("11charshe").reason).toMatch(/at least 12/i);
  });

  it("accepts exactly 12 characters", () => {
    expect(validatePasswordLength("12charshit!!").ok).toBe(true); // 12 chars
  });

  it("rejects passwords longer than 128 characters", () => {
    const tooLong = "x".repeat(129);
    expect(validatePasswordLength(tooLong).ok).toBe(false);
    expect(validatePasswordLength(tooLong).reason).toMatch(/at most 128/i);
  });

  it("accepts 128 characters", () => {
    const max = "x".repeat(128);
    expect(validatePasswordLength(max).ok).toBe(true);
  });
});

describe("checkPasswordBreach", () => {

  it("returns 0 when the suffix is not in the response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "AAAAA111111111111111111111111111111111:3\nBBBBB222222222222222222222222222222222:7",
    });
    const count = await checkPasswordBreach("a-very-unique-password-not-breached-123");
    expect(count).toBe(0);
  });

  it("returns the count when the suffix matches", async () => {
    // "password123" -> SHA-1 = ...; we craft a fake response containing its
    // actual suffix so the lookup hits.
    const crypto = await import("node:crypto");
    const sha1 = crypto.createHash("sha1").update("password123").digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => `${suffix}:4720085`,
    });

    const count = await checkPasswordBreach("password123");
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      expect.objectContaining({ headers: { "Add-Padding": "true" } })
    );
    expect(count).toBe(4720085);
  });

  it("returns null on network error (best-effort)", async () => {
    fetchMock.mockRejectedValue(new Error("ENOTFOUND"));
    const count = await checkPasswordBreach("some-password-12345");
    expect(count).toBe(null);
  });

  it("returns null on non-200 response", async () => {
    fetchMock.mockResolvedValue({ ok: false, text: async () => "" });
    const count = await checkPasswordBreach("some-password-12345");
    expect(count).toBe(null);
  });
});

describe("validatePassword", () => {

  it("rejects short passwords before hitting the network", async () => {
    const result = await validatePassword("short");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/at least 12/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects local denylist entries before hitting the network", async () => {
    const result = await validatePassword("password123");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too common/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects breached passwords", async () => {
    // Craft a response that says this password is breached.
    const crypto = await import("node:crypto");
    const sha1 = crypto.createHash("sha1").update("a-breached-password").digest("hex").toUpperCase();
    const suffix = sha1.slice(5);

    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => `${suffix}:42`,
    });

    const result = await validatePassword("a-breached-password");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/data breaches/i);
  });

  it("accepts a strong, non-breached password", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "00000000000000000000000000000000000:0",
    });
    const result = await validatePassword("a-strong-unique-passphrase-2026");
    expect(result.ok).toBe(true);
    expect(result.breachCheckSkipped).toBeFalsy();
  });

  it("accepts with a warning when the breach API is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ENOTFOUND"));
    const result = await validatePassword("a-strong-unique-passphrase-2026");
    expect(result.ok).toBe(true);
    expect(result.breachCheckSkipped).toBe(true);
  });
});

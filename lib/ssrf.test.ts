import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertSafeHost } from "./ssrf";

describe("assertSafeHost", () => {
  it("rejects private IPv4 ranges", async () => {
    expect((await assertSafeHost("127.0.0.1")).ok).toBe(false);
    expect((await assertSafeHost("10.0.0.1")).ok).toBe(false);
    expect((await assertSafeHost("192.168.1.1")).ok).toBe(false);
    expect((await assertSafeHost("169.254.169.254")).ok).toBe(false); // cloud metadata
    expect((await assertSafeHost("172.16.0.1")).ok).toBe(false);
  });

  it("rejects IPv6 loopback and link-local", async () => {
    expect((await assertSafeHost("::1")).ok).toBe(false);
    expect((await assertSafeHost("fe80::1")).ok).toBe(false);
    expect((await assertSafeHost("fc00::1")).ok).toBe(false);
  });

  it("rejects metadata hostnames", async () => {
    expect((await assertSafeHost("metadata.google.internal")).ok).toBe(false);
    expect((await assertSafeHost("metadata")).ok).toBe(false);
  });

  it("extracts hostname from host:port and URLs", async () => {
    // These resolve to public IPs — should be ok. Using a stable public resolver.
    const r1 = await assertSafeHost("8.8.8.8:587");
    expect(r1.ok).toBe(true);
    const r2 = await assertSafeHost("https://api.openai.com");
    expect(r2.ok).toBe(true);
  });

  it("rejects empty / invalid input", async () => {
    expect((await assertSafeHost("")).ok).toBe(false);
    expect((await assertSafeHost("   ")).ok).toBe(false);
  });

  it("rejects a raw blocked IP even inside a URL", async () => {
    expect((await assertSafeHost("http://127.0.0.1/v1")).ok).toBe(false);
    expect((await assertSafeHost("http://169.254.169.254/latest/meta-data")).ok).toBe(false);
  });
});

describe("assertSafeHost — SSRF_TEST_ALLOWLIST", () => {
  const ORIG_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    // Tests in this suite run outside production so the allowlist can be exercised.
    // The vitest environment does not set NODE_ENV=production.
    delete process.env.SSRF_TEST_ALLOWLIST;
  });

  afterEach(() => {
    delete process.env.SSRF_TEST_ALLOWLIST;
    // Restore NODE_ENV if it was changed by a specific test.
    (process.env as Record<string, string | undefined>).NODE_ENV = ORIG_NODE_ENV;
  });

  it("allows an exact allowlisted origin in a non-production env", async () => {
    process.env.SSRF_TEST_ALLOWLIST = "http://localhost:9899";
    const result = await assertSafeHost("http://localhost:9899/v1");
    expect(result.ok).toBe(true);
  });

  it("does not allow an origin that merely shares an allowlist prefix", async () => {
    process.env.SSRF_TEST_ALLOWLIST = "http://localhost:9899";
    const result = await assertSafeHost("http://localhost:9899.evil/v1");
    expect(result.ok).toBe(false);
  });

  it("still rejects a private host that does NOT match the allowlist", async () => {
    process.env.SSRF_TEST_ALLOWLIST = "http://localhost:9899";
    // 127.0.0.2 is not in the allowlist — full SSRF check should reject it.
    const result = await assertSafeHost("http://127.0.0.2/evil");
    expect(result.ok).toBe(false);
  });

  it("ignores the allowlist entirely when NODE_ENV is production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.SSRF_TEST_ALLOWLIST = "http://localhost:9899";
    const result = await assertSafeHost("http://localhost:9899/v1");
    // Production must reject localhost regardless of the allowlist.
    expect(result.ok).toBe(false);
  });

  it("does not bypass non-allowlisted private URLs via an allowlist that contains other entries", async () => {
    process.env.SSRF_TEST_ALLOWLIST = "http://localhost:9899";
    const notInList = await assertSafeHost("http://192.168.1.1/v1");
    expect(notInList.ok).toBe(false);
  });

  it("an empty allowlist does not affect normal rejection of private hosts", async () => {
    process.env.SSRF_TEST_ALLOWLIST = "";
    expect((await assertSafeHost("http://127.0.0.1/v1")).ok).toBe(false);
  });
});

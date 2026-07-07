import { describe, it, expect } from "vitest";
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

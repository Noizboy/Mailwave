import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt } from "./crypto";

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

describe("crypto", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key";
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("roundtrips plaintext", () => {
    const plaintext = "smtp-password-123";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("roundtrips unicode content", () => {
    const plaintext = "contraseña-ñáéíóú-密码-🔑";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("roundtrips the empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-input";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it("throws on tampered ciphertext (GCM auth tag)", () => {
    const ciphertext = encrypt("sensitive");
    const data = Buffer.from(ciphertext, "base64");
    // Flip a bit in the encrypted payload (past the 12-byte IV + 16-byte tag)
    data[28] ^= 0xff;
    const tampered = data.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when decrypting with a different key", () => {
    const ciphertext = encrypt("sensitive");
    process.env.ENCRYPTION_KEY = "another-key-entirely";
    expect(() => decrypt(ciphertext)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is not set", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow("ENCRYPTION_KEY env var not set");
    expect(() => decrypt("x")).toThrow("ENCRYPTION_KEY env var not set");
  });

  it("pads short keys to 32 bytes instead of failing", () => {
    process.env.ENCRYPTION_KEY = "short";
    const plaintext = "still-works";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("truncates long keys to 32 bytes", () => {
    process.env.ENCRYPTION_KEY = "x".repeat(64);
    const plaintext = "long-key-input";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, __resetCryptoKeyCache } from "./crypto";

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;
const VALID_KEY = "test-encryption-key-with-32-chars-min"; // 37 chars

describe("crypto", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
    __resetCryptoKeyCache();
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
    __resetCryptoKeyCache();
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
    process.env.ENCRYPTION_KEY = "another-key-entirely-with-32-chars-or-more";
    __resetCryptoKeyCache();
    expect(() => decrypt(ciphertext)).toThrow();
  });

  it("throws when ENCRYPTION_KEY is not set", () => {
    delete process.env.ENCRYPTION_KEY;
    __resetCryptoKeyCache();
    expect(() => encrypt("x")).toThrow("ENCRYPTION_KEY env var not set");
    expect(() => decrypt("x")).toThrow("ENCRYPTION_KEY env var not set");
  });

  it("rejects keys shorter than 32 characters", () => {
    process.env.ENCRYPTION_KEY = "short";
    __resetCryptoKeyCache();
    expect(() => encrypt("x")).toThrow(/at least 32 characters/);
  });

  it("rejects known placeholder values", () => {
    process.env.ENCRYPTION_KEY = "change-me-32-chars-minimum-please";
    __resetCryptoKeyCache();
    expect(() => encrypt("x")).toThrow(/placeholder/);

    process.env.ENCRYPTION_KEY = "your-32-or-more-character-key-here";
    __resetCryptoKeyCache();
    expect(() => encrypt("x")).toThrow(/placeholder/);
  });

  it("accepts keys longer than 32 characters via SHA-256 derivation", () => {
    process.env.ENCRYPTION_KEY = "x".repeat(64);
    __resetCryptoKeyCache();
    const plaintext = "long-key-input";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });
});

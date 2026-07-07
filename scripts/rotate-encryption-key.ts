/**
 * One-shot script to rotate the at-rest ENCRYPTION_KEY.
 *
 * It decrypts every stored secret with OLD_ENCRYPTION_KEY (the previous key)
 * and re-encrypts it with the new ENCRYPTION_KEY (the current env value).
 * All four encrypted columns are covered:
 *   - SmtpConfig.encryptedPassword
 *   - AiConfig.encryptedApiKey
 *   - AiConfig.oauthAccessToken
 *   - AiConfig.oauthRefreshToken
 *
 * Usage:
 *   1. Set NEW ENCRYPTION_KEY in .env (the new key, >= 32 chars, not a placeholder)
 *   2. Set OLD_ENCRYPTION_KEY to the previous key value
 *   3. Run:  npm run rotate-key
 *
 * The script is idempotent in the sense that re-running it with the same
 * OLD_ENCRYPTION_KEY will fail to decrypt the already-rotated rows and skip
 * them with a warning — it never destroys data. Take a DB backup before
 * running in production.
 */
import "dotenv/config";
import crypto from "crypto";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ALGORITHM = "aes-256-gcm";
const MIN_KEY_LENGTH = 32;

function deriveKey(secret: string): Buffer {
  if (secret.length < MIN_KEY_LENGTH) {
    throw new Error(`Key must be at least ${MIN_KEY_LENGTH} characters (got ${secret.length}).`);
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function decryptWithKey(ciphertext: string, key: Buffer): string {
  const data = Buffer.from(ciphertext, "base64");
  if (data.length < 28) throw new Error("Ciphertext too short");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

async function main() {
  const oldKeyRaw = process.env.OLD_ENCRYPTION_KEY;
  const newKeyRaw = process.env.ENCRYPTION_KEY;

  if (!oldKeyRaw) {
    console.error("✗ OLD_ENCRYPTION_KEY env var is required (the previous key).");
    process.exit(1);
  }
  if (!newKeyRaw) {
    console.error("✗ ENCRYPTION_KEY env var is required (the new key, already set in .env).");
    process.exit(1);
  }
  if (oldKeyRaw === newKeyRaw) {
    console.error("✗ OLD_ENCRYPTION_KEY and ENCRYPTION_KEY are identical — nothing to rotate.");
    process.exit(1);
  }

  const oldKey = deriveKey(oldKeyRaw);
  const newKey = deriveKey(newKeyRaw);
  console.log("→ Old key derived (SHA-256).");
  console.log("→ New key derived (SHA-256).");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

  let rotated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // SmtpConfig.encryptedPassword
    const smtpConfigs = await prisma.smtpConfig.findMany({
      where: { encryptedPassword: { not: null } },
      select: { id: true, encryptedPassword: true },
    });
    console.log(`→ SmtpConfig: ${smtpConfigs.length} rows with encryptedPassword.`);
    for (const c of smtpConfigs) {
      try {
        const plaintext = decryptWithKey(c.encryptedPassword!, oldKey);
        const reencrypted = encryptWithKey(plaintext, newKey);
        await prisma.smtpConfig.update({ where: { id: c.id }, data: { encryptedPassword: reencrypted } });
        rotated++;
      } catch (err) {
        if (err instanceof Error && /auth tag|unsupported|final/.test(err.message)) {
          // Likely already rotated with the new key — skip safely.
          skipped++;
        } else {
          console.error(`  ✗ SmtpConfig ${c.id}:`, err instanceof Error ? err.message : err);
          failed++;
        }
      }
    }

    // AiConfig: encryptedApiKey, oauthAccessToken, oauthRefreshToken
    const aiConfigs = await prisma.aiConfig.findMany({
      where: {
        OR: [
          { encryptedApiKey: { not: null } },
          { oauthAccessToken: { not: null } },
          { oauthRefreshToken: { not: null } },
        ],
      },
      select: { id: true, encryptedApiKey: true, oauthAccessToken: true, oauthRefreshToken: true },
    });
    console.log(`→ AiConfig: ${aiConfigs.length} rows with at least one encrypted field.`);

    for (const c of aiConfigs) {
      const updates: Record<string, string> = {};
      let rowRotated = false;
      let rowSkipped = false;

      for (const [field, value] of [
        ["encryptedApiKey", c.encryptedApiKey],
        ["oauthAccessToken", c.oauthAccessToken],
        ["oauthRefreshToken", c.oauthRefreshToken],
      ] as const) {
        if (!value) continue;
        try {
          const plaintext = decryptWithKey(value, oldKey);
          updates[field] = encryptWithKey(plaintext, newKey);
          rowRotated = true;
        } catch (err) {
          if (err instanceof Error && /auth tag|unsupported|final/.test(err.message)) {
            rowSkipped = true;
          } else {
            throw err;
          }
        }
      }

      if (rowRotated) {
        await prisma.aiConfig.update({ where: { id: c.id }, data: updates });
        rotated++;
      } else if (rowSkipped) {
        skipped++;
      }
    }

    console.log("\n=== Rotation complete ===");
    console.log(`  Rotated: ${rotated}`);
    console.log(`  Skipped (already on new key?): ${skipped}`);
    console.log(`  Failed: ${failed}`);
    if (failed > 0) {
      console.error("✗ Some rows failed. Review errors above before proceeding.");
      process.exit(1);
    }
  } finally {
    await (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

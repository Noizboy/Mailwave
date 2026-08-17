import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function generateApiKey(): { raw: string; hash: string } {
  const raw = `mw_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Returns the userId (or "__env__" for env-based keys) if valid, null otherwise. */
export async function validateApiKey(raw: string): Promise<string | null> {
  // Static key configured in .env takes priority — no DB lookup needed
  const envKey = process.env.PUBLIC_LOGS_API_KEY;
  if (envKey && raw === envKey) return "__env__";

  if (!raw.startsWith("mw_")) return null;
  const hash = hashApiKey(raw);
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!record || record.revokedAt) return null;

  // Update lastUsedAt without blocking the response
  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return record.userId;
}

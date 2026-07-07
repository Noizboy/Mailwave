import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.aiConfig.findUnique({ where: { userId: session.user.id } });

  // Best-effort token revocation — don't fail if it errors
  if (config?.oauthAccessToken) {
    try {
      const token = decrypt(config.oauthAccessToken);
      await fetch("https://auth.openai.com/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch {
      // ignore
    }
  }

  await prisma.aiConfig.update({
    where: { userId: session.user.id },
    data: {
      oauthConnected: false,
      oauthAccessToken: null,
      oauthRefreshToken: null,
      oauthExpiresAt: null,
      provider: "openai",
      status: "disconnected",
    },
  });

  return NextResponse.json({ ok: true });
}

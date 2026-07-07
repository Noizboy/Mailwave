import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL;
  const ERROR_REDIRECT = `${base}/settings?tab=ai&codex=error`;
  const SUCCESS_REDIRECT = `${base}/settings?tab=ai&codex=connected`;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(ERROR_REDIRECT);
  }

  const cookie = req.cookies.get("codex_oauth_state")?.value;
  if (!cookie) return NextResponse.redirect(ERROR_REDIRECT);

  const colonIdx = cookie.indexOf(":");
  if (colonIdx === -1) return NextResponse.redirect(ERROR_REDIRECT);

  const storedState = cookie.slice(0, colonIdx);
  const codeVerifier = cookie.slice(colonIdx + 1);

  if (storedState !== state || !codeVerifier) {
    return NextResponse.redirect(ERROR_REDIRECT);
  }

  try {
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/settings/ai/codex/callback`;
    const tokenRes = await fetch("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: process.env.OPENAI_CLIENT_ID!,
        client_secret: process.env.OPENAI_CLIENT_SECRET!,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) return NextResponse.redirect(ERROR_REDIRECT);

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const { access_token, refresh_token, expires_in } = tokens;

    await prisma.aiConfig.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        provider: "codex",
        oauthAccessToken: encrypt(access_token),
        oauthRefreshToken: refresh_token ? encrypt(refresh_token) : null,
        oauthExpiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        oauthConnected: true,
        status: "connected",
      },
      update: {
        provider: "codex",
        oauthAccessToken: encrypt(access_token),
        oauthRefreshToken: refresh_token ? encrypt(refresh_token) : null,
        oauthExpiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        oauthConnected: true,
        status: "connected",
      },
    });

    const response = NextResponse.redirect(SUCCESS_REDIRECT);
    response.cookies.delete("codex_oauth_state");
    return response;
  } catch {
    return NextResponse.redirect(ERROR_REDIRECT);
  }
}

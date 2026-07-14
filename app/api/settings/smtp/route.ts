import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { assertSafeHost } from "@/lib/ssrf";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.smtpConfig.findUnique({
    where: { userId: user.id },
  });

  if (!config) return NextResponse.json(null);

  return NextResponse.json({
    ...config,
    encryptedPassword: config.encryptedPassword ? "••••••••" : null,
  });
}

const smtpSchema = z.object({
  host: z.string().min(1),
  // The settings form displays 587 as the default but only submits the field
  // once edited, so the server must supply the same default.
  port: z.number().int().min(1).max(65535).default(587),
  username: z.string().min(1),
  password: z.string().optional(),
  fromName: z.string().min(1),
  fromEmail: z.email(),
  replyTo: z.string().nullish(),
  encryption: z.enum(["tls", "ssl", "none"]).default("tls"),
});

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = smtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { password, ...rest } = parsed.data;

  // SSRF check on the SMTP host before persisting (CN-005).
  const hostCheck = await assertSafeHost(rest.host);
  if (!hostCheck.ok) {
    return NextResponse.json({ error: hostCheck.reason ?? "Invalid SMTP host." }, { status: 400 });
  }

  const existing = await prisma.smtpConfig.findUnique({ where: { userId: user.id } });

  const encryptedPassword = password
    ? encrypt(password)
    : existing?.encryptedPassword ?? null;

  await prisma.smtpConfig.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...rest,
      encryptedPassword,
      status: "disconnected",
    },
    update: {
      ...rest,
      encryptedPassword,
      status: "disconnected",
    },
  });

  return NextResponse.json({ ok: true });
}

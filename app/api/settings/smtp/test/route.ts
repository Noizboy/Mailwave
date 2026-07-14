import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import nodemailer from "nodemailer";
import { getAuthenticatedUser } from "@/lib/api/session";

function humanizeSmtpError(raw: string): string {
  if (/ECONNREFUSED/i.test(raw)) return "Connection refused. Check the hostname and port.";
  if (/ENOTFOUND/i.test(raw)) return "Hostname not found. Verify the server address.";
  if (/ETIMEDOUT|ESOCKET/i.test(raw)) return "Connection timed out. The server is not responding.";
  if (/Invalid login|Authentication|auth/i.test(raw)) return "Authentication failed. Check your username and App Password.";
  if (/certificate|SSL|TLS/i.test(raw)) return "SSL/TLS error. Try changing the encryption setting.";
  if (/ECONNRESET/i.test(raw)) return "Connection was reset by the server. Check your encryption settings.";
  if (/Greeting never received/i.test(raw)) return "No response from server. Check the hostname and port.";
  return raw.split("\n")[0].slice(0, 120);
}

export const runtime = "nodejs";

// SEC-002: cap real SMTP sends at 5/min/user so a caller cannot burn their
// provider quota through this endpoint.
const SMTP_TEST_MAX = 5;
const SMTP_TEST_WINDOW_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`smtp-test:${user.id}`, SMTP_TEST_MAX, SMTP_TEST_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many SMTP test requests. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { RetryAfter: String(rl.retryAfterSeconds) } }
    );
  }

  const config = await prisma.smtpConfig.findUnique({ where: { userId: user.id } });
  if (!config || !config.host || !config.encryptedPassword) {
    return NextResponse.json({ error: "SMTP not configured" }, { status: 422 });
  }

  const body = await req.json().catch(() => ({}));
  // SEC-001: validate the test email format before opening an SMTP connection.
  // The field is optional — when absent, the endpoint only runs `verify()`.
  let testEmail: string | undefined;
  if (typeof body.testEmail === "string" && body.testEmail.trim()) {
    const parsed = z.email().safeParse(body.testEmail.trim());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid test email format." }, { status: 400 });
    }
    testEmail = parsed.data;
  }

  let success = false;
  let errorMessage: string | null = null;

  try {
    const password = decrypt(config.encryptedPassword);
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port ?? 587,
      secure: config.encryption === "ssl",
      auth: { user: config.username ?? "", pass: password },
      // Note: when encryption === "none", nodemailer will not upgrade to TLS,
      // so rejectUnauthorized is irrelevant. For "tls"/"ssl" we keep the
      // default (cert validation ON). Never disable cert validation — it
      // enables MITM when STARTTLS is negotiated (CN-007).
    });

    if (testEmail) {
      const from = config.fromName
        ? `"${config.fromName}" <${config.fromEmail ?? config.username ?? ""}>`
        : (config.fromEmail ?? config.username ?? "");

      await transporter.sendMail({
        from,
        to: testEmail,
        subject: "MailWave — SMTP Test Email",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111;">
            <h2 style="margin:0 0 12px;">SMTP Test Successful ✓</h2>
            <p style="color:#555;margin:0 0 8px;">
              This is a test email sent from <strong>MailWave</strong> to verify your SMTP configuration.
            </p>
            <p style="color:#555;margin:0 0 20px;">
              If you received this, your mail server is configured correctly and ready to send campaigns.
            </p>
            <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;" />
            <p style="color:#999;font-size:12px;margin:0 0 4px;">From: ${config.fromEmail ?? config.username ?? ""}</p>
            <p style="color:#999;font-size:12px;margin:0;">SMTP: ${config.host}:${config.port ?? 587}</p>
          </div>
        `,
      });
    } else {
      await transporter.verify();
    }

    success = true;
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Unknown error";
    errorMessage = humanizeSmtpError(raw);
  }

  await prisma.smtpConfig.update({
    where: { userId: user.id },
    data: {
      status: success ? "connected" : "failed",
      testedAt: new Date(),
    },
  });

  if (success) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: errorMessage }, { status: 422 });
}

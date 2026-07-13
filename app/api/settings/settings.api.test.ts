// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const verify = vi.fn();
const suppressQueueAdd = vi.fn();

vi.mock("@/lib/auth");
vi.mock("@/lib/prisma");
vi.mock("@/lib/ssrf", () => ({
  // SSRF check stubbed in tests — always allow (hermetic, no DNS).
  assertSafeHost: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/password-policy", () => ({
  // Stub the policy: enforce length locally (pure), skip the HIBP network call.
  validatePassword: vi.fn(async (pw: string) => {
    if (typeof pw !== "string" || pw.length < 12) {
      return { ok: false, reason: "Password must be at least 12 characters long." };
    }
    if (pw.length > 128) {
      return { ok: false, reason: "Password must be at most 128 characters long." };
    }
    return { ok: true };
  }),
  validatePasswordLength: vi.fn((pw: string) => {
    if (typeof pw !== "string" || pw.length < 12) return { ok: false, reason: "too short" };
    if (pw.length > 128) return { ok: false, reason: "too long" };
    return { ok: true };
  }),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ verify })) },
}));
vi.mock("@/lib/jobs/queue", () => ({
  getSuppressContactsQueue: () => ({ add: suppressQueueAdd }),
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { __resetRateLimitStore } from "@/lib/rate-limit";
import { mockSession, jsonRequest } from "@/test/api-helpers";
import { GET as getSmtp, PUT as putSmtp } from "./smtp/route";
import { POST as testSmtp } from "./smtp/test/route";
import { GET as getAi, PUT as putAi } from "./ai/route";
import { POST as changePassword } from "./account/password/route";
import { GET as getLimits, PUT as putLimits } from "./sending-limits/route";
import { GET as getNotifPrefs, PATCH as patchNotifPrefs } from "./notification-preferences/route";

const mocked = vi.mocked;

const validSmtpBody = {
  host: "smtp.example.com",
  port: 587,
  username: "sender",
  fromName: "Sender",
  fromEmail: "sender@example.com",
};

describe("api/settings", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "settings-test-key-with-32-chars-min";
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSession("user-1");
    // SEC-002/SEC-003: each test starts with a fresh in-memory rate-limit
    // window so the per-user quota doesn't leak across cases.
    await __resetRateLimitStore();
  });

  describe("GET /api/settings/smtp — secret masking", () => {
    it("never returns the stored encrypted password, only a mask", async () => {
      const stored = encrypt("real-smtp-password");
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({
        userId: "user-1",
        host: "smtp.example.com",
        encryptedPassword: stored,
      } as never);

      const res = await getSmtp();
      const body = await res.json();

      expect(body.encryptedPassword).toBe("••••••••");
      const raw = JSON.stringify(body);
      expect(raw).not.toContain(stored);
      expect(raw).not.toContain("real-smtp-password");
    });
  });

  describe("PUT /api/settings/smtp", () => {
    it("encrypts the password before persisting (never plaintext at rest)", async () => {
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue(null as never);
      mocked(prisma.smtpConfig.upsert).mockResolvedValue({} as never);

      await putSmtp(
        jsonRequest("/api/settings/smtp", {
          method: "PUT",
          body: { ...validSmtpBody, password: "hunter2secret" },
        })
      );

      const args = mocked(prisma.smtpConfig.upsert).mock.calls[0][0];
      const storedValue = (args?.create as { encryptedPassword: string }).encryptedPassword;
      expect(storedValue).not.toContain("hunter2secret");
      expect(decrypt(storedValue)).toBe("hunter2secret");
      // Any config change invalidates the previous connection test
      expect((args?.create as { status: string }).status).toBe("disconnected");
    });

    it("keeps the existing encrypted password when none is provided", async () => {
      const existing = encrypt("old-password");
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({
        encryptedPassword: existing,
      } as never);
      mocked(prisma.smtpConfig.upsert).mockResolvedValue({} as never);

      await putSmtp(jsonRequest("/api/settings/smtp", { method: "PUT", body: validSmtpBody }));

      const args = mocked(prisma.smtpConfig.upsert).mock.calls[0][0];
      expect((args?.update as { encryptedPassword: string }).encryptedPassword).toBe(existing);
    });

    it("rejects an invalid port with 400", async () => {
      const res = await putSmtp(
        jsonRequest("/api/settings/smtp", {
          method: "PUT",
          body: { ...validSmtpBody, port: 99999 },
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/settings/smtp/test", () => {
    it("returns 422 when SMTP is not configured", async () => {
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue(null as never);
      const res = await testSmtp(jsonRequest("/api/settings/smtp/test", { method: "POST", body: {} }));
      expect(res.status).toBe(422);
    });

    it("marks the config connected on a successful verify", async () => {
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({
        userId: "user-1",
        host: "smtp.example.com",
        port: 587,
        username: "sender",
        encryption: "tls",
        encryptedPassword: encrypt("pw"),
      } as never);
      verify.mockResolvedValue(true);
      mocked(prisma.smtpConfig.update).mockResolvedValue({} as never);

      const res = await testSmtp(jsonRequest("/api/settings/smtp/test", { method: "POST", body: {} }));

      expect(res.status).toBe(200);
      expect(prisma.smtpConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "connected" }),
        })
      );
    });

    it("marks the config failed and does not leak the password on error", async () => {
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({
        userId: "user-1",
        host: "smtp.example.com",
        port: 587,
        username: "sender",
        encryption: "tls",
        encryptedPassword: encrypt("super-secret-pw"),
      } as never);
      verify.mockRejectedValue(new Error("Invalid login"));
      mocked(prisma.smtpConfig.update).mockResolvedValue({} as never);

      const res = await testSmtp(jsonRequest("/api/settings/smtp/test", { method: "POST", body: {} }));
      const raw = JSON.stringify(await res.json());

      expect(res.status).toBe(422);
      expect(raw).not.toContain("super-secret-pw");
      expect(prisma.smtpConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "failed" }),
        })
      );
    });

    // SEC-001: invalid testEmail must be rejected before any SMTP work.
    it("rejects a malformed testEmail with 400 before opening SMTP", async () => {
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({
        userId: "user-1",
        host: "smtp.example.com",
        port: 587,
        username: "sender",
        encryption: "tls",
        encryptedPassword: encrypt("pw"),
      } as never);
      mocked(prisma.smtpConfig.update).mockResolvedValue({} as never);

      const res = await testSmtp(
        jsonRequest("/api/settings/smtp/test", { method: "POST", body: { testEmail: "no-es-un-email" } })
      );

      expect(res.status).toBe(400);
      expect(verify).not.toHaveBeenCalled();
      expect(prisma.smtpConfig.update).not.toHaveBeenCalled();
    });

    // SEC-002: more than 5 calls/min/user from the same user return 429.
    it("returns 429 once the 5/min per-user quota is exceeded", async () => {
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({
        userId: "user-1",
        host: "smtp.example.com",
        port: 587,
        username: "sender",
        encryption: "tls",
        encryptedPassword: encrypt("pw"),
      } as never);
      verify.mockResolvedValue(true);
      mocked(prisma.smtpConfig.update).mockResolvedValue({} as never);

      for (let i = 0; i < 5; i++) {
        const res = await testSmtp(jsonRequest("/api/settings/smtp/test", { method: "POST", body: {} }));
        expect(res.status).toBe(200);
      }
      const sixth = await testSmtp(jsonRequest("/api/settings/smtp/test", { method: "POST", body: {} }));
      expect(sixth.status).toBe(429);
      expect(sixth.headers.get("retryafter")).toBeTruthy();
    });
  });

  describe("GET/PUT /api/settings/ai", () => {
    it("masks the stored API key on GET", async () => {
      const stored = encrypt("sk-verysecret");
      mocked(prisma.aiConfig.findUnique).mockResolvedValue({
        provider: "openai",
        encryptedApiKey: stored,
      } as never);

      const res = await getAi();
      const raw = JSON.stringify(await res.json());

      expect(raw).not.toContain(stored);
      expect(raw).not.toContain("sk-verysecret");
    });

    it("encrypts the API key on PUT and resets status", async () => {
      mocked(prisma.aiConfig.findUnique).mockResolvedValue(null as never);
      mocked(prisma.aiConfig.upsert).mockResolvedValue({} as never);

      await putAi(
        jsonRequest("/api/settings/ai", {
          method: "PUT",
          body: { provider: "anthropic", model: "claude-haiku-4-5-20251001", apiKey: "sk-ant-secret" },
        })
      );

      const args = mocked(prisma.aiConfig.upsert).mock.calls[0][0];
      const storedValue = (args?.create as { encryptedApiKey: string }).encryptedApiKey;
      expect(storedValue).not.toContain("sk-ant-secret");
      expect(decrypt(storedValue)).toBe("sk-ant-secret");
      expect((args?.create as { status: string }).status).toBe("disconnected");
    });

    it("rejects an unknown provider with 400", async () => {
      const res = await putAi(
        jsonRequest("/api/settings/ai", { method: "PUT", body: { provider: "skynet" } })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/settings/account/password", () => {
    it("rejects a wrong current password", async () => {
      mocked(prisma.user.findUnique).mockResolvedValue({
        passwordHash: await bcrypt.hash("correct-password", 4),
      } as never);

      const res = await changePassword(
        jsonRequest("/api/settings/account/password", {
          method: "POST",
          body: { currentPassword: "wrong-password", newPassword: "new-password-123" },
        })
      );

      expect(res.status).toBe(400);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects a new password shorter than 12 chars", async () => {
      const res = await changePassword(
        jsonRequest("/api/settings/account/password", {
          method: "POST",
          body: { currentPassword: "correct-password", newPassword: "short" },
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects a new password equal to the current one", async () => {
      const res = await changePassword(
        jsonRequest("/api/settings/account/password", {
          method: "POST",
          body: { currentPassword: "same-password-12", newPassword: "same-password-12" },
        })
      );
      expect(res.status).toBe(400);
    });

    it("stores a bcrypt hash of the new password, never the plaintext", async () => {
      mocked(prisma.user.findUnique).mockResolvedValue({
        passwordHash: await bcrypt.hash("correct-password", 4),
      } as never);
      mocked(prisma.user.update).mockResolvedValue({} as never);

      const res = await changePassword(
        jsonRequest("/api/settings/account/password", {
          method: "POST",
          body: { currentPassword: "correct-password", newPassword: "new-password-123" },
        })
      );

      expect(res.status).toBe(200);
      const args = mocked(prisma.user.update).mock.calls[0][0];
      const newHash = (args?.data as { passwordHash: string }).passwordHash;
      expect(newHash).not.toBe("new-password-123");
      expect(await bcrypt.compare("new-password-123", newHash)).toBe(true);
    });
  });

  describe("GET /api/settings/sending-limits", () => {
    it("returns documented defaults when nothing is configured", async () => {
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue(null as never);
      mocked(prisma.sendingAccount.findUnique).mockResolvedValue(null as never);

      const res = await getLimits();
      expect(await res.json()).toEqual({
        dailyLimit: 500,
        hourlyLimit: 50,
        suppressAfterEmails: 3,
      });
    });

    it("returns stored values when configs exist", async () => {
      mocked(prisma.smtpConfig.findUnique).mockResolvedValue({
        dailyLimit: 200,
        hourlyLimit: 20,
      } as never);
      mocked(prisma.sendingAccount.findUnique).mockResolvedValue({
        suppressAfterEmails: 5,
      } as never);

      const body = await (await getLimits()).json();
      expect(body).toEqual({ dailyLimit: 200, hourlyLimit: 20, suppressAfterEmails: 5 });
    });
  });

  describe("PUT /api/settings/sending-limits", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession(null);
      const res = await putLimits(
        jsonRequest("/api/settings/sending-limits", { method: "PUT", body: { dailyLimit: 100 } })
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 on invalid input", async () => {
      const res = await putLimits(
        jsonRequest("/api/settings/sending-limits", { method: "PUT", body: { dailyLimit: -1 } })
      );
      expect(res.status).toBe(400);
    });

    it("upserts smtp limits scoped to the user", async () => {
      mocked(prisma.smtpConfig.upsert).mockResolvedValue({} as never);

      const res = await putLimits(
        jsonRequest("/api/settings/sending-limits", {
          method: "PUT",
          body: { dailyLimit: 300, hourlyLimit: 30 },
        })
      );

      expect(res.status).toBe(200);
      expect(prisma.smtpConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          create: expect.objectContaining({ dailyLimit: 300, hourlyLimit: 30 }),
          update: expect.objectContaining({ dailyLimit: 300, hourlyLimit: 30 }),
        })
      );
      expect(suppressQueueAdd).not.toHaveBeenCalled();
    });

    it("enqueues a deduplicated suppress job when suppressAfterEmails is set", async () => {
      mocked(prisma.sendingAccount.upsert).mockResolvedValue({} as never);
      suppressQueueAdd.mockResolvedValue({ id: "job-1" });

      const res = await putLimits(
        jsonRequest("/api/settings/sending-limits", {
          method: "PUT",
          body: { suppressAfterEmails: 5 },
        })
      );

      expect(res.status).toBe(200);
      expect(suppressQueueAdd).toHaveBeenCalledWith(
        "apply-suppress-threshold",
        { userId: "user-1", suppressAfterEmails: 5 },
        expect.objectContaining({ jobId: "suppress-user-1" })
      );
    });

    it("does not enqueue a suppress job when only smtp limits change", async () => {
      mocked(prisma.smtpConfig.upsert).mockResolvedValue({} as never);

      await putLimits(
        jsonRequest("/api/settings/sending-limits", {
          method: "PUT",
          body: { dailyLimit: 100 },
        })
      );

      expect(suppressQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/settings/notification-preferences", () => {
    it("returns documented defaults when no rows exist", async () => {
      mocked(prisma.notificationPreference.findMany).mockResolvedValue([] as never);

      const res = await getNotifPrefs();
      expect(await res.json()).toEqual({
        campaign_complete: true,
        campaign_error: true,
        ai_email_ready: false,
        ai_email_error: true,
        email_bounced: true,
        daily_digest: false,
        system_alerts: true,
        low_credits: true,
      });
    });

    it("merges saved rows over defaults", async () => {
      mocked(prisma.notificationPreference.findMany).mockResolvedValue([
        { eventType: "ai_email_ready", inApp: true },
        { eventType: "daily_digest", inApp: true },
      ] as never);

      const res = await getNotifPrefs();
      const body = await res.json();
      expect(body.ai_email_ready).toBe(true);
      expect(body.daily_digest).toBe(true);
      expect(body.campaign_complete).toBe(true); // default unchanged
    });
  });

  describe("PATCH /api/settings/notification-preferences", () => {
    it("upserts the given preference and returns ok", async () => {
      mocked(prisma.notificationPreference.upsert).mockResolvedValue({} as never);

      const res = await patchNotifPrefs(
        jsonRequest("/api/settings/notification-preferences", {
          method: "PATCH",
          body: { eventType: "campaign_complete", inApp: false },
        })
      );

      expect(res.status).toBe(200);
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ eventType: "campaign_complete", inApp: false }),
          update: { inApp: false },
        })
      );
    });

    it("rejects an unknown eventType with 400", async () => {
      const res = await patchNotifPrefs(
        jsonRequest("/api/settings/notification-preferences", {
          method: "PATCH",
          body: { eventType: "does_not_exist", inApp: true },
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects a non-boolean inApp with 400", async () => {
      const res = await patchNotifPrefs(
        jsonRequest("/api/settings/notification-preferences", {
          method: "PATCH",
          body: { eventType: "campaign_complete", inApp: "yes" },
        })
      );
      expect(res.status).toBe(400);
    });
  });
});

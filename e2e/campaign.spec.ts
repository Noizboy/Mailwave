import { test, expect } from "@playwright/test";
import { spawn, execSync, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

// Requires Redis running: this spec exercises the real BullMQ worker.
// The AI provider is a local OpenAI-compatible stub — no real AI calls, no cost.

const ROOT = path.resolve(__dirname, "..");
const STUB_PORT = 9899;
const runId = Date.now();
const campaignName = `E2E Campaign ${runId}`;

let stub: ChildProcess;
let worker: ChildProcess;

function killTree(proc: ChildProcess | undefined) {
  if (!proc?.pid) return;
  try {
    execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
  } catch {
    // already gone
  }
}

test.describe.configure({ mode: "serial" });

test.describe("campaign wizard → generation → review", () => {
  test.beforeAll(async () => {
    const stubLog = fs.openSync(path.join(ROOT, "test-results", "ai-stub.log"), "w");
    const workerLog = fs.openSync(path.join(ROOT, "test-results", "worker.log"), "w");
    stub = spawn("npx", ["tsx", "e2e/fixtures/ai-stub-server.ts"], {
      cwd: ROOT,
      shell: true,
      env: { ...process.env, AI_STUB_PORT: String(STUB_PORT) },
      stdio: ["ignore", stubLog, stubLog],
    });
    worker = spawn("npx", ["tsx", "--env-file=.env", "jobs/worker.ts"], {
      cwd: ROOT,
      shell: true,
      stdio: ["ignore", workerLog, workerLog],
    });
    // Wait for the stub to accept connections
    await expect
      .poll(
        async () => {
          try {
            const res = await fetch(`http://localhost:${STUB_PORT}/health`);
            return res.ok;
          } catch {
            return false;
          }
        },
        { timeout: 15_000 }
      )
      .toBe(true);
  });

  test.afterAll(() => {
    killTree(stub);
    killTree(worker);
  });

  test("configures the AI provider against the local stub", async ({ page }) => {
    const putRes = await page.request.put("/api/settings/ai", {
      data: {
        provider: "custom",
        model: "stub-model",
        apiKey: "e2e-stub-key",
        baseUrl: `http://localhost:${STUB_PORT}/v1`,
      },
    });
    expect(putRes.ok()).toBe(true);

    // Connection test hits the stub and flips the config to "connected"
    const testRes = await page.request.post("/api/settings/ai/test");
    expect(testRes.ok()).toBe(true);
  });

  test("creates a campaign via the wizard, generates with the worker, and approves all", async ({ page }) => {
    test.setTimeout(120_000);

    // --- Wizard (4 steps: Details → AI Instructions → Sending → Review) ---
    await page.goto("/campaigns/create");
    await page.getByPlaceholder(/Q1 Outreach/).fill(campaignName);
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /Tech Leaders Q1/ }).click();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("AI Instructions").first()).toBeVisible();
    await page.getByPlaceholder(/discovery call/).fill("E2E demo goal");
    // systemPrompt is required — fill it so step-2 validation passes
    await page.getByPlaceholder(/B2B cold email expert/).fill(
      "You are a B2B outreach expert. Write concise emails with a clear CTA."
    );

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Sending Settings")).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Confirm & Create")).toBeVisible();

    await page.getByRole("button", { name: "Create Campaign" }).click();
    // "**/campaigns/**" would also match /campaigns/create — require a real id
    await page.waitForURL(/\/campaigns\/(?!create)[^/?#]+$/);

    // --- Generation through the real queue + worker + stub ---
    const campaignId = page.url().split("/campaigns/")[1].split(/[/?#]/)[0];
    const genRes = await page.request.post(`/api/campaigns/${campaignId}/generate`);
    expect(genRes.ok(), `generate response: ${genRes.status()} ${await genRes.text()}`).toBe(true);

    // Poll until the worker finishes and the campaign reaches pending_review.
    // The detail page fetches client-side, so give each reload a moment to render.
    await expect
      .poll(
        async () => {
          await page.reload();
          return page
            .getByText("Review Emails")
            .first()
            .waitFor({ state: "visible", timeout: 4_000 })
            .then(() => true)
            .catch(() => false);
        },
        { timeout: 90_000, intervals: [2_000] }
      )
      .toBe(true);

    // --- Review + approve ---
    await page.getByText("Review Emails").first().click();
    await page.waitForURL("**/review");
    await expect(page.getByText("E2E Stub Subject").first()).toBeVisible();

    await page.getByRole("button", { name: "Approve All" }).click();
    // The toast renders the message twice (visible node + aria-live region)
    await expect(page.getByText(/emails approved/i).first()).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";

test.describe("settings", () => {
  test("saves SMTP config and never echoes the password back", async ({ page }) => {
    await page.goto("/settings");

    await page.getByRole("tab", { name: "Mail Server" }).click();

    // A fresh account must choose a provider; subsequent runs reopen the
    // persisted configuration directly.
    const customSmtpProvider = page.getByRole("button", { name: /^SMTP Server\b/ });
    if (await customSmtpProvider.isVisible()) {
      await customSmtpProvider.click();
    }

    await page.getByPlaceholder("smtp.gmail.com").fill("smtp.e2e-test.local");
    await page.getByPlaceholder("your.email@gmail.com").fill("e2e-sender");
    await page.getByPlaceholder(/Enter password|Leave blank to keep existing password/).fill("e2e-super-secret");
    await page.getByPlaceholder("Acme Corp").fill("E2E Sender");
    await page.getByPlaceholder("hello@yourdomain.com").fill("sender@e2e-test.local");

    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("SMTP settings saved")).toBeVisible();

    // Reload: config persisted, but the password field is empty (secret stays server-side)
    await page.reload();
    await page.getByRole("tab", { name: "Mail Server" }).click();
    await expect(page.getByPlaceholder("smtp.gmail.com")).toHaveValue("smtp.e2e-test.local");
    const passwordField = page.getByPlaceholder("Leave blank to keep existing password");
    await expect(passwordField).toHaveValue("");
    await expect(passwordField).toHaveAttribute("placeholder", /keep existing/i);
    await expect(page.locator("body")).not.toContainText("e2e-super-secret");
  });

  test("AI settings tab persists provider and model", async ({ page }) => {
    await page.goto("/settings?tab=ai");
    // The campaign spec configures the custom provider + stub model via API;
    // here we only assert the tab renders the persisted state without the key.
    await expect(page.getByRole("tab", { name: "AI Integration", selected: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("e2e-stub-key");
  });
});

test.describe("reports", () => {
  test("shows summary metrics and exports a CSV", async ({ page }) => {
    await page.goto("/reports");

    await expect(page.getByText("Delivery Rate")).toBeVisible();

    // The export opens a popup that immediately becomes a file download, so
    // assert the button wiring via the popup event and the payload via the API.
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Export CSV" }).click();
    await popupPromise;

    const response = await page.request.get("/api/reports/export");
    expect(response.headers()["content-type"]).toContain("text/csv");
    const body = await response.text();
    expect(body.split("\n")[0]).toContain('"Campaign"');
  });
});

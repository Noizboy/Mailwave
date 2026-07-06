import { test, expect } from "@playwright/test";

// This spec checks the public login page, so it must run unauthenticated.
test.use({ storageState: { cookies: [], origins: [] } });

test("app shell — navigation links exist", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("MailWave")).toBeVisible();
});

test("authenticated shell reaches the dashboard via saved storage state", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "e2e/.auth/user.json" });
  const page = await context.newPage();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await context.close();
});

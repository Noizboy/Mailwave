import { test, expect } from "@playwright/test";

test.describe("auth flow", () => {
  // All login-form scenarios must start unauthenticated.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("rejects a wrong password and stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@mailwave.app");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs in with valid credentials and lands on the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@mailwave.app");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("redirects unauthenticated visits to login with a callbackUrl", async ({ page }) => {
    await page.goto("/contacts");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fcontacts/);
  });
});

test.describe("auth flow — sign out", () => {
  test("signs out from the profile menu and returns to login", async ({ page }) => {
    await page.goto("/dashboard");
    // Open the profile menu in the topbar
    await page.getByRole("button", { name: /Demo User/ }).click();
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.waitForURL("**/login**");
    // Session is gone: protected routes bounce back to login
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

import { test as setup } from "@playwright/test";
import path from "path";

export const AUTH_FILE = path.resolve(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@mailwave.app");
  await page.getByRole("textbox", { name: "Password" }).fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  await page.context().storageState({ path: AUTH_FILE });
});

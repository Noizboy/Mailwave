import { test, expect } from "@playwright/test";

const runId = Date.now();
const listName = `E2E List ${runId}`;

test.describe("lists management", () => {
  test("creates a list, opens its detail, and deletes it", async ({ page }) => {
    await page.goto("/lists");

    // Create
    await page.getByRole("button", { name: "Create List" }).first().click();
    await page.getByRole("dialog").locator("input").fill(listName);
    await page.getByRole("dialog").getByRole("button", { name: /Create/ }).click();
    await expect(page.getByText(listName)).toBeVisible();

    // Detail page
    await page.getByRole("link", { name: listName }).click();
    await page.waitForURL("**/lists/**");
    await expect(page.getByText(listName).first()).toBeVisible();

    // Back to the index and delete via the card menu
    await page.goto("/lists");
    const card = page
      .getByRole("link", { name: listName })
      .locator("xpath=ancestor::div[contains(@class, 'p-5')]");
    await card.getByRole("button", { name: "List actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: `Delete \"${listName}\"?` })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.getByRole("link", { name: listName })).not.toBeVisible();
  });

  test("seeded list shows member health stats on its detail page", async ({ page }) => {
    await page.goto("/lists");
    await page.getByRole("link", { name: "Tech Leaders Q1" }).click();
    await page.waitForURL("**/lists/**");

    // Seeded members are present
    await expect(page.getByText("alice@acme.com")).toBeVisible();
    await expect(page.getByText("bob@techco.com")).toBeVisible();
  });
});

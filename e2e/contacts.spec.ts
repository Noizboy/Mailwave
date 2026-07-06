import { test, expect } from "@playwright/test";

const runId = Date.now();
const email = `e2e-contact-${runId}@example.com`;

// The search test depends on the contact created by the first test.
test.describe.configure({ mode: "serial" });

test.describe("contacts management", () => {
  test("adds a contact through the form and returns to the contacts list", async ({ page }) => {
    await page.goto("/contacts/add");

    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("First name").fill("Elena");
    await page.getByLabel("Last name").fill("Prueba");
    await page.getByLabel("Company").fill("E2E Corp");
    await page.getByRole("button", { name: "Save Contact" }).click();

    await page.waitForURL("**/contacts");
    await expect(page.getByText(email).first()).toBeVisible();
  });

  test("search filters the contacts table", async ({ page }) => {
    await page.goto("/contacts");

    await page.getByPlaceholder("Search by name, email or company…").fill(email);
    await expect(page.getByText(email)).toBeVisible();
    // Seeded contact filtered out by the search
    await expect(page.getByText("alice@acme.com")).not.toBeVisible();
  });
});

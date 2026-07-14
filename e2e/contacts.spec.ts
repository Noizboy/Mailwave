import { test, expect } from "@playwright/test";

const runId = Date.now();
const email = `e2e-contact-${runId}@example.com`;

// The search test depends on the contact created by the first test.
test.describe.configure({ mode: "serial" });

test.describe("contacts management", () => {
  test("adds a contact through the form and returns to the contacts list", async ({ page }) => {
    await page.goto("/contacts");

    await page.getByRole("button", { name: "Add Contact" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Contact" });
    await dialog.getByPlaceholder("Daniela", { exact: true }).fill("Elena");
    await dialog.getByPlaceholder("Moreno", { exact: true }).fill("Prueba");
    await dialog.getByPlaceholder("daniela@nubex.io", { exact: true }).fill(email);
    await dialog.getByPlaceholder("Nubex", { exact: true }).fill("E2E Corp");
    await dialog
      .getByPlaceholder("e.g. Mentioned pain with outbound reply rates on LinkedIn. Series B fintech. Interested in LATAM expansion.", { exact: true })
      .fill("E2E contact created to verify the contacts workflow.");
    await dialog.getByRole("button", { name: "Save Contact" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("cell", { name: email, exact: true })).toBeVisible();
  });

  test("search filters the contacts table", async ({ page }) => {
    await page.goto("/contacts");

    await page.getByPlaceholder("Search by name, email or company…").fill(email);
    await expect(page.getByRole("cell", { name: email, exact: true })).toBeVisible();
    // Seeded contact filtered out by the search
    await expect(page.getByRole("cell", { name: "alice@acme.com", exact: true })).not.toBeVisible();
  });
});

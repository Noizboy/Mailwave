import { test, expect, type Page } from "@playwright/test";

// Unique emails per run so re-runs don't turn valid rows into duplicates.
const runId = Date.now();
const validEmail1 = `e2e-${runId}-a@example.com`;
const validEmail2 = `e2e-${runId}-b@example.com`;
const cancelEmail = `e2e-${runId}-cancel@example.com`;

function csvBuffer(rows: string[][]) {
  const content = rows.map((r) => r.join(",")).join("\n");
  return { name: "e2e-import.csv", mimeType: "text/csv", buffer: Buffer.from(content) };
}

async function uploadCsv(page: Page, rows: string[][]) {
  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles(csvBuffer(rows));
  await page.getByRole("button", { name: "Upload CSV" }).click();
  await expect(page.getByText("File uploaded successfully")).toBeVisible();
}

test.describe("csv import flow", () => {
  test("upload → review → save creates only the valid contacts", async ({ page }) => {
    await uploadCsv(page, [
      ["email", "first name", "company"],
      [validEmail1, "Ana", "Acme"],
      [validEmail2, "Beto", "Globex"],
      ["not-an-email", "Bad", "Row"],
      ["alice@acme.com", "Alice", "Duplicate of seed"],
    ]);

    // Summary: 4 rows, 2 valid, 2 issues (1 invalid + 1 duplicate of seeded alice@acme.com)
    await expect(page.getByText("Total Rows")).toBeVisible();
    await expect(page.getByText("Valid Emails")).toBeVisible();

    await page.getByRole("button", { name: /Continue to Review/ }).click();
    await page.waitForURL("**/import/**");

    // Review table shows classified rows
    await expect(page.getByText(validEmail1)).toBeVisible();
    await expect(page.getByText("Invalid email format")).toBeVisible();
    await expect(page.getByText("Email already exists")).toBeVisible();

    // Save without creating a list (confirm inside the dialog)
    await page.getByRole("button", { name: "Save Contacts" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save Contacts" })
      .click();

    await page.waitForURL("**/contacts");
    await expect(page.getByText(validEmail1)).toBeVisible();
    await expect(page.getByText(validEmail2)).toBeVisible();
  });

  test("cancel import discards the rows and returns to upload", async ({ page }) => {
    await uploadCsv(page, [
      ["email", "first name"],
      [cancelEmail, "Nunca"],
    ]);

    await page.getByRole("button", { name: /Continue to Review/ }).click();
    await page.waitForURL("**/import/**");

    await page.getByRole("button", { name: "Cancel Import" }).click();
    await page.waitForURL("**/upload");

    // The cancelled row never became a contact
    await page.goto("/contacts");
    await expect(page.getByText(cancelEmail)).not.toBeVisible();
  });
});

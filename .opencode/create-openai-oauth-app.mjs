import { chromium } from "playwright";
import { writeFileSync } from "fs";

const REDIRECT_URI = "http://localhost:3001/api/settings/ai/codex/callback";
const APP_NAME = "Mailwave";
const OUT = "C:\\Users\\lexpc\\AppData\\Local\\Temp\\claude\\C--Users-lexpc-Documents-Repositories-Mailwave\\0f4c2282-fe8a-44c7-a031-b7e5b703d685\\scratchpad";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = "C:\\Users\\lexpc\\AppData\\Local\\Temp\\chrome-pw-profile";

const shot = (page, name) =>
  page.screenshot({ path: `${OUT}\\${name}.png`, fullPage: true }).catch(() => {});

console.log("Launching Chrome with copied session profile...");

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  executablePath: CHROME_PATH,
  headless: false,
  slowMo: 200,
  viewport: { width: 1280, height: 900 },
  args: ["--profile-directory=Default", "--no-first-run", "--no-default-browser-check"],
});

const page = ctx.pages()[0] ?? await ctx.newPage();

// ── Step 1: Navigate ──────────────────────────────────────────────────────────
console.log("Navigating to OpenAI OAuth Apps...");
await page.goto("https://platform.openai.com/settings/organization/oauth-apps", {
  waitUntil: "load",
  timeout: 30000,
});

console.log("Waiting for SPA to render...");
await page.waitForSelector(
  'input[type="email"], input[placeholder*="Email" i], button:has-text("Create"), h1, main, [role="main"]',
  { timeout: 20000 }
);
await page.waitForTimeout(1500);
await shot(page, "01-initial");
console.log("URL:", page.url());

// ── Step 2: Handle login if needed ───────────────────────────────────────────
const isLoginPage = await page.locator(
  'input[type="email"], input[placeholder*="Email" i], button:has-text("Continue with Google")'
).first().isVisible({ timeout: 2000 }).catch(() => false);

if (isLoginPage) {
  console.log("\n⏳  Login required. Please log in in the browser (up to 3 min)...");
  await page.waitForSelector(
    'input[type="email"], input[placeholder*="Email" i]',
    { state: "hidden", timeout: 180000 }
  );
  console.log("✅  Login done. Re-navigating...");
  await page.goto("https://platform.openai.com/settings/organization/oauth-apps", {
    waitUntil: "load",
    timeout: 30000,
  });
  await page.waitForTimeout(4000);
} else {
  console.log("✅  Session active — already logged in.");
}

await shot(page, "02-oauth-apps-page");
const pagePreview = (await page.locator("body").innerText()).slice(0, 400);
console.log("Page content:", pagePreview);

// ── Step 3: Click Create ──────────────────────────────────────────────────────
const createSelectors = [
  'button:has-text("Create")',
  'button:has-text("New")',
  'a:has-text("Create")',
];

let clicked = false;
for (let attempt = 0; attempt < 4 && !clicked; attempt++) {
  for (const sel of createSelectors) {
    if (await page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("Clicking:", sel);
      await page.locator(sel).first().click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    console.log(`Attempt ${attempt + 1}: waiting for create button...`);
    await page.waitForTimeout(2000);
  }
}

if (!clicked) {
  console.log("⚠️  Create button not found. Page text:");
  console.log((await page.locator("body").innerText()).slice(0, 500));
}

await page.waitForTimeout(1500);
await shot(page, "03-after-create-click");

// ── Step 4: Fill form ─────────────────────────────────────────────────────────
const nameFieldSel = [
  'input[placeholder*="name" i]',
  'input[name*="name" i]',
  'input[id*="name" i]',
  'label:has-text("Name") input',
].join(", ");

const hasForm = await page.locator(nameFieldSel).first()
  .isVisible({ timeout: 5000 }).catch(() => false);

if (hasForm) {
  console.log("Filling app name:", APP_NAME);
  await page.locator(nameFieldSel).first().fill(APP_NAME);

  const redirectSel = [
    'input[placeholder*="redirect" i]',
    'input[placeholder*="uri" i]',
    'input[placeholder*="callback" i]',
    'input[placeholder*="http" i]',
    'input[name*="redirect" i]',
    'label:has-text("Redirect") input',
    'label:has-text("Callback") input',
  ].join(", ");

  let hasRedirect = await page.locator(redirectSel).first()
    .isVisible({ timeout: 2000 }).catch(() => false);

  if (!hasRedirect) {
    const addBtn = page.locator('button:has-text("Add")').first();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);
      hasRedirect = await page.locator(redirectSel).first()
        .isVisible({ timeout: 2000 }).catch(() => false);
    }
  }

  if (hasRedirect) {
    console.log("Filling redirect URI:", REDIRECT_URI);
    await page.locator(redirectSel).first().fill(REDIRECT_URI);
  } else {
    console.log("⚠️  Redirect URI field not found.");
  }

  await shot(page, "04-form-filled");

  const submitSel = [
    'button[type="submit"]',
    'button:has-text("Create")',
    'button:has-text("Save")',
  ].join(", ");

  if (await page.locator(submitSel).first().isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("Submitting...");
    await page.locator(submitSel).first().click();
    await page.waitForTimeout(4000);
    await shot(page, "05-submitted");
  }
} else {
  console.log("⚠️  Form not found after clicking Create.");
  console.log((await page.locator("body").innerText()).slice(0, 500));
  await shot(page, "04-no-form");
}

// ── Step 5: Extract credentials ───────────────────────────────────────────────
const body = await page.locator("body").innerText();
console.log("\n--- Page content after submit ---");
console.log(body.slice(0, 1500));

const m1 = body.match(/client[\s_\-]?id[:\s"]+([a-zA-Z0-9_\-\.]{15,})/i);
const m2 = body.match(/client[\s_\-]?secret[:\s"]+([a-zA-Z0-9_\-\.]{15,})/i);

if (m1 || m2) {
  const creds = { OPENAI_CLIENT_ID: m1?.[1] ?? null, OPENAI_CLIENT_SECRET: m2?.[1] ?? null };
  writeFileSync(`${OUT}\\oauth-credentials.json`, JSON.stringify(creds, null, 2));
  console.log("\n✅ Credentials saved:", JSON.stringify(creds, null, 2));
} else {
  console.log("\n⚠️  Could not auto-extract credentials. Check the browser window.");
}

await shot(page, "06-final");
console.log("\nBrowser stays open 2 minutes — copy credentials if needed.");
await page.waitForTimeout(120000);
await ctx.close();

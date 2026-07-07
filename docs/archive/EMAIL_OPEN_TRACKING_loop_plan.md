# Email Open Tracking — Loop Engineering Plan

Use this checklist as a loop-engineering queue. Each loop should:

1. Pick exactly one unchecked task.
2. Define the expected outcome before editing.
3. Make the smallest safe change.
4. Run the listed verification commands.
5. Mark the task completed only after verification passes or the remaining risk is documented.

---

## Context

**Goal:** Know whether each sent email was opened. Display a per-email "Opened" indicator in the campaign detail page and an open-rate column in Reports.

**Mechanism:** Tracking pixel — a 1×1 transparent GIF served from `/api/track/[emailId]`. When the recipient's email client loads the image, the server logs a `DeliveryEvent { eventType: "opened" }`.

**Infrastructure already in place:**
- `DeliveryEvent` model with `eventType: String` (used today for `"sent"`)
- `nodemailer` sends via SMTP in `lib/jobs/send-campaign.ts`
- `.env` has `NEXTAUTH_URL="http://localhost:3000"` (reused as base URL for the pixel)

**Known limitation:** Apple Mail Privacy Protection and some corporate proxies pre-fetch images, which can inflate open counts. Opens are a directional signal, not a perfect measure.

---

## Tasks

### OT-001. Add `APP_URL` environment variable

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** None
- **Files to touch:** `.env`, `.env.example` (if it exists)
- **Problem:** The tracking pixel URL must be absolute (email clients load it from outside localhost). We need a well-known env var for the app's public base URL.
- **Expected outcome:** `.env` has `APP_URL="http://localhost:3000"`. In production this will be the real domain.
- **Done when:** `process.env.APP_URL` resolves to a non-empty string when the Next.js dev server and the BullMQ worker start.
- **Verification:**
  ```bash
  # After adding the variable, restart the worker and confirm it prints no "APP_URL undefined" errors.
  # Manual check:
  node -e "require('dotenv').config(); console.log(process.env.APP_URL)"
  ```
- **Risk / notes:** `APP_URL` is used only server-side (worker + API route), so it does NOT need the `NEXT_PUBLIC_` prefix. Do not expose it to the client bundle.

---

### OT-002. Create the tracking pixel API route

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** OT-001
- **Files to touch:** `app/api/track/[emailId]/route.ts` *(new file)*
- **Problem:** There is no endpoint that logs an "opened" event and returns the 1×1 pixel.
- **Expected outcome:** `GET /api/track/{emailId}` does three things:
  1. Looks up the `CampaignEmail` by `id` (no auth — the request comes from email clients).
  2. Creates a `DeliveryEvent { campaignEmailId, eventType: "opened" }` if the email exists and has `status: "sent"`.
  3. Returns a 1×1 transparent GIF with `Cache-Control: no-store` so clients don't cache it.
- **Done when:** Hitting the URL in a browser returns a 1×1 image (no visible content), and `DeliveryEvent` rows with `eventType = 'opened'` appear in the database.
- **Verification:**
  ```bash
  # 1. Start the dev server: npm run dev
  # 2. Send a test campaign email, grab the campaignEmailId from the DB:
  #    psql mailwave -c "SELECT id FROM \"CampaignEmail\" WHERE status='sent' LIMIT 1;"
  # 3. Hit the pixel:
  #    curl -I "http://localhost:3000/api/track/<emailId>"
  #    → expect: HTTP 200, Content-Type: image/gif
  # 4. Confirm event was logged:
  #    psql mailwave -c "SELECT * FROM \"DeliveryEvent\" WHERE \"eventType\"='opened' LIMIT 5;"
  ```
- **Risk / notes:**
  - The route must NOT require authentication (NextAuth session is not available in email clients).
  - Idempotency is intentionally loose — multiple opens create multiple rows. Uniqueness is enforced at query time (COUNT DISTINCT or first-occurrence).
  - Use `export const runtime = "nodejs"` to avoid Edge runtime issues with Prisma.

  ```ts
  // Minimal implementation sketch:
  import { NextRequest, NextResponse } from "next/server";
  import { prisma } from "@/lib/prisma";

  export const runtime = "nodejs";

  const PIXEL = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  export async function GET(_req: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
    const { emailId } = await params;
    const email = await prisma.campaignEmail.findUnique({ where: { id: emailId } });
    if (email?.status === "sent") {
      await prisma.deliveryEvent.create({
        data: { campaignEmailId: emailId, eventType: "opened" },
      });
    }
    return new NextResponse(PIXEL, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }
  ```

---

### OT-003. Inject tracking pixel into outgoing HTML emails

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** OT-001, OT-002
- **Files to touch:** `lib/jobs/send-campaign.ts`
- **Problem:** `nodemailer` is called with only `text: email.body`. There is no `html` field, so no pixel can be embedded. Plain-text emails don't load remote images.
- **Expected outcome:** Each `sendMail` call includes an `html` field with the email body wrapped in minimal HTML and a tracking pixel `<img>` appended. The `text` field is kept as a plain-text fallback.
- **Done when:** Received emails (in a test inbox) contain the pixel `<img>` tag in their source. Opening the email in Gmail or Outlook triggers a `DeliveryEvent` row in the DB.
- **Verification:**
  ```bash
  # 1. Send a test campaign to a real inbox (or Mailhog/Mailtrap).
  # 2. View the raw source of the received email — confirm the img tag is present:
  #    <img src="http://localhost:3000/api/track/<emailId>" ...>
  # 3. Open the email and hit the pixel manually if needed, then check the DB:
  #    psql mailwave -c "SELECT * FROM \"DeliveryEvent\" WHERE \"eventType\"='opened';"
  npm run test -- lib/jobs/send-campaign.test.ts
  ```
- **Risk / notes:**
  - Convert newlines to `<br>` for the HTML body so readability is preserved.
  - Keep the pixel `<img>` as the very last element before `</body>` — some clients skip trailing content.
  - In production `APP_URL` must be the public HTTPS domain; a `localhost` URL will not be reachable by external email clients.
  - Implementation change in `sendMail` call:
  ```ts
  const appUrl = process.env.APP_URL ?? "";
  const htmlBody = (email.body ?? "").replace(/\n/g, "<br>");
  const pixelUrl = `${appUrl}/api/track/${email.id}`;

  await transporter.sendMail({
    // ... existing fields ...
    text: email.body ?? "",
    html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">${htmlBody}</div>` +
          `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" />`,
  });
  ```

---

### OT-004. Expose open status in the campaign emails API

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** OT-002
- **Files to touch:** `app/api/campaigns/[id]/emails/route.ts`
- **Problem:** The emails endpoint returns `CampaignEmail` rows but does not include whether each email has been opened. The UI cannot know without querying `DeliveryEvent`.
- **Expected outcome:** Each email object in the response includes an `opened: boolean` field — `true` if at least one `DeliveryEvent` with `eventType: "opened"` exists for that email.
- **Done when:** `GET /api/campaigns/:id/emails` returns `{ ..., opened: true }` for emails that have been opened.
- **Verification:**
  ```bash
  # 1. Confirm a DeliveryEvent "opened" exists for an email.
  # 2. Fetch the endpoint and inspect the response:
  #    curl -s "http://localhost:3000/api/campaigns/<id>/emails" | jq '.emails[] | {id, status, opened}'
  #    → opened emails should show "opened": true
  npm run test -- app/api/campaigns
  ```
- **Risk / notes:**
  - Use `_count` or a raw `some` filter rather than loading all events — keep the query efficient.
  - Add `deliveryEvents: { where: { eventType: "opened" }, take: 1, select: { id: true } }` to the `include` block, then map `opened: email.deliveryEvents.length > 0`.

---

### OT-005. Show "Opened" indicator in campaign detail email list

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** OT-004
- **Files to touch:** `components/campaigns/campaign-detail-client.tsx`
- **Problem:** The email sidebar shows a "Sent" badge per contact but has no indication of whether the email was opened.
- **Expected outcome:** Sent emails show an "Opened" badge (e.g., an eye icon, green) or a "Not opened" indicator next to the existing "Sent" chip. The `EmailRow` interface is extended with `opened: boolean`.
- **Done when:** Opening a campaign with sent emails shows the open status per contact in the left sidebar list, and refreshes correctly on poll.
- **Verification:**
  ```bash
  # 1. npm run dev
  # 2. Navigate to a campaign with sent emails.
  # 3. Trigger a pixel load (curl the track URL or open the email in a real client).
  # 4. Reload the campaign page — confirm the "Opened" badge appears.
  npx tsc --noEmit
  ```
- **Risk / notes:**
  - The `fetchEmails` function fetches `/api/campaigns/${campaignId}/emails?perPage=200` — no change needed to the fetch call once OT-004 is done.
  - Extend `EmailRow` interface: add `opened?: boolean`.
  - Add badge next to the existing "Sent" chip using a lucide `Eye` icon, similar styling to the emerald "Sent" chip.

---

### OT-006. Add open counts to the reports API

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** OT-002
- **Files to touch:** `app/api/reports/route.ts`
- **Problem:** The reports endpoint returns `sentCount`, `failedCount`, etc. per campaign but no open data. There is also no global "total opened" summary metric.
- **Expected outcome:**
  - Each campaign in `campaigns` array includes `openedCount: number` (unique emails opened, deduplicated by `campaignEmailId`).
  - The `summary` object includes `totalOpened: number` and `openRate: number` (percentage of sent emails that were opened).
- **Done when:** `GET /api/reports` returns `openedCount` per campaign and `totalOpened`/`openRate` in summary.
- **Verification:**
  ```bash
  curl -s "http://localhost:3000/api/reports" | jq '{summary: .summary, first_campaign: .campaigns[0]}'
  # → summary.totalOpened, summary.openRate, campaigns[0].openedCount should be present
  npm run test -- app/api/reports
  ```
- **Risk / notes:**
  - Deduplicate opens per email: count distinct `campaignEmailId` where `eventType = 'opened'` — a single contact opening an email 3 times counts as 1.
  - Use a grouped Prisma query or raw SQL for efficiency; avoid N+1 per campaign.
  - Suggested query addition per campaign id (can be batched):
  ```ts
  const openGroups = await prisma.deliveryEvent.groupBy({
    by: ["campaignEmailId"],
    where: {
      eventType: "opened",
      campaignEmail: { campaignId: c.id },
    },
  });
  openedCount = openGroups.length;
  ```

---

### OT-007. Display open rate in Reports UI

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** OT-006
- **Files to touch:** `components/reports/reports-client.tsx`
- **Problem:** The Campaign Breakdown table has columns for Sent, Failed, and Rate (delivery rate) but no open data. The summary metric cards have no opens metric.
- **Expected outcome:**
  - Campaign Breakdown table gains an **Opens** column showing `openedCount` and an **Open Rate** column showing `Math.round(openedCount / sentCount * 100)%`.
  - The top metric cards row gains a **Opens** metric (global `totalOpened` from summary).
  - `CampaignReport` interface is extended with `openedCount: number`.
- **Done when:** The Reports page shows open counts and open rate per campaign without layout regressions. Campaigns with 0 opens show "0" or "—".
- **Verification:**
  ```bash
  # 1. npm run dev → navigate to /reports
  # 2. Confirm new columns appear in Campaign Breakdown table.
  # 3. Confirm the metric cards include "Opens".
  npx tsc --noEmit
  ```
- **Risk / notes:**
  - Open rate denominator is `sentCount`, not `totalEmails` — avoid dividing by zero.
  - The table already has 8 columns; consider making Opens/Open Rate a single combined cell (`12 · 40%`) to avoid crowding on narrow viewports.
  - `ReportSummary` interface needs `totalOpened: number; openRate: number`.

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- The implementation is complete.
- The listed verification command has been run (or the reason it was skipped is documented).
- Any failure is documented with a follow-up task.
- The change is committed if it modifies repository files.

---

## Execution order

```
OT-001 → OT-002 → OT-003   (core pipeline — do these first, in order)
                ↓
             OT-004 → OT-005   (campaign detail UI)
                ↓
             OT-006 → OT-007   (reports)
```

OT-003, OT-004, and OT-006 can be worked in parallel once OT-002 is done.

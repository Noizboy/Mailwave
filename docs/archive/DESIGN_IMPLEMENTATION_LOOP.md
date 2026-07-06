# Mailwave Design Implementation Loop

Implement the visual design from `MailWaveMockup.html` into the existing Next.js codebase.
Each loop picks **one** task, makes the smallest safe change, verifies, and marks it done.

Reference file: `MailWaveMockup.html` (root).
All components live under `components/` and pages under `app/(dashboard)/`.

---

## Design token reference (from mockup)

| Token | Value |
|---|---|
| Body background | `#F8FAFC` |
| Card background | `#fff` |
| Card border | `1px solid #E5E7EB`, `border-radius: 10px` |
| Sidebar background | `#000000` |
| Primary button | `bg:#000000 color:#fff`, `border-radius:7px` |
| Secondary button | `bg:#fff border:1px solid #E5E7EB color:#111827` |
| Danger button | `border:1px solid #FCA5A5 color:#DC2626 bg:#fff` |
| Link / accent | `#2563EB` |
| Text primary | `#111827` |
| Text secondary | `#6B7280` |
| Text muted | `#9CA3AF` |
| Success | `#16A34A` (bg `#DCFCE7`) |
| Error | `#DC2626` (bg `#FEF2F2`) |
| Warning | `#A16207` (bg `#FEF3C7`) |
| Info | `#1D4ED8` (bg `#EFF6FF`) |
| Input padding | `9px 12px` |
| Input border-radius | `7px` |
| Font | Inter (already loaded via Google Fonts) |

---

## Tasks

### DES-001. Global: update Tailwind config and base CSS to match design tokens

- [x] **Status:** Done
- **Priority:** High — everything else depends on this
- **Depends on:** None
- **Files to touch:** `tailwind.config.ts`, `app/globals.css`
- **Problem:** Current theme uses `gray-900` sidebar, blue primary buttons, and default Tailwind colors. Mockup uses `#000000` sidebar, black primary buttons, `#F8FAFC` page background, and specific gray ramps.
- **Expected outcome:** Tailwind extended theme defines `brand-black:#000000`, `page-bg:#F8FAFC`, card border `#E5E7EB`, and `globals.css` sets `body { background:#F8FAFC; font-family:'Inter'... }`. The existing component classes `bg-black` and `border-gray-200` should map correctly.
- **Done when:** `npm run build` passes and `globals.css` sets body background to `#F8FAFC`.
- **Verification:**
  ```bash
  cd C:\Users\lexpc\Documents\Repositories\Mailwave
  npx tsc --noEmit
  npm run build 2>&1 | tail -5
  ```
- **Risk / notes:** Keep existing Tailwind color names working — only extend, don't replace.

---

### DES-002. Sidebar: pure black background, section label, logo as "M" badge, no version footer

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** DES-001
- **Files to touch:** `components/layout/sidebar.tsx`
- **Problem:** Current sidebar is `bg-gray-900`, active item uses `bg-blue-600`, logo shows a Zap icon, bottom shows "MailWave v0.1". Mockup: sidebar `#000000`, active item has `color:#fff bg:rgba(255,255,255,0.08)`, logo is blue `#2563EB` square with letter "M", no footer. Nav has a "MAIN" section label above items.
- **Expected outcome:** Sidebar matches mockup: black bg, "M" logo badge, "MAIN" uppercase label, active item subtle white-bg highlight, no version footer. Mobile: `position:fixed`, off-canvas, overlay on open.
- **Done when:** Visual match to mockup sidebar; mobile hamburger toggle works.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Then visually confirm in browser at `http://localhost:3000/dashboard`.
- **Risk / notes:** Mobile sidebar state needs to be lifted to layout or use a store. Current layout may not have hamburger button — add it to TopBar (see DES-003).

---

### DES-003. TopBar: redesign — breadcrumbs, page title, CTA slot, avatar initials, notification panel

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** DES-001
- **Files to touch:** `components/layout/topbar.tsx`
- **Problem:** Current TopBar is `h-14`, shows only title + pills + notification + profile (User icon). Mockup: `h-16 (64px)`, left side has `crumbs` (small gray) + `pageTitle` (16px 600), right side keeps SMTP/AI pills, notification bell with red badge, and avatar as initials circle `#111827 bg`. Profile dropdown shows name + email + menu items. Topbar also hosts a context-specific CTA button (`topbarBtn` slot) between pills and bell.
- **Expected outcome:** TopBar at 64px, breadcrumb + title on left, pills + CTA slot + bell + avatar on right. Notification popup: 360px wide, icon-colored notification rows. Avatar shows user initials (not User icon).
- **Done when:** TopBar height is 64px; breadcrumbs visible; avatar shows "SA" for "Sofía Álvarez"; notification panel matches mockup layout.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check at `/dashboard`.
- **Risk / notes:** The `actions` prop currently handles the CTA — keep it but rename to `topbarCta` for clarity. Breadcrumbs need to be derived from pathname.

---

### DES-004. Dashboard: flat metric cards, campaigns table with full columns, quick-action buttons

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** DES-001, DES-002, DES-003
- **Files to touch:** `components/dashboard/dashboard-client.tsx`
- **Problem:** Current dashboard has icon-based stat cards and a simplified campaign list. Mockup: 6 flat cards (label uppercase 11px, value 22px 600, delta colored), "Recent Campaigns" table with columns Name/Status/Sent/Failed/Pending/Created/View, and three black quick-action buttons at the bottom. No "SMTP Status" / "AI Status" cards on the dashboard.
- **Expected outcome:** Dashboard matches mockup exactly — 6 flat metric cards, campaigns in a proper `<table>` with all columns, three buttons at bottom.
- **Done when:** Dashboard renders with table layout and flat cards; no icon-cards or status cards visible on the page.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm run test -- --testPathPattern dashboard 2>&1 | tail -10
  ```
  Visual check at `/dashboard`.

---

### DES-005. Upload CSV: drag-drop zone with idle/done states, info cards

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/import/upload-csv-client.tsx`
- **Problem:** Need to verify current upload component matches the mockup's two-state design: idle (dashed border drop zone with SVG upload icon, "Drag & drop" text, black Upload CSV button) and done (green success row with file name, row count, "Continue to Review" button). Also two info cards at bottom (Required / Recommended columns).
- **Expected outcome:** Upload page matches mockup in both states. Idle state has correct dashed border `#CBD5E1`, SVG icon in blue. Done state has green `#16A34A` check icon, file metadata, black CTA.
- **Done when:** Both states render correctly; transition works on file select.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check at `/upload` — confirm idle and done states.

---

### DES-006. CSV Review: stats row (5 cards), bulk action toolbar, table, Save/Cancel buttons

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/import/import-review-client.tsx`
- **Problem:** Verify/update CSV review page matches mockup: 5 stat cards at top (Total, Valid, Duplicates, Invalid, Lists), toolbar with checkbox + Assign to List + Create New List + Delete Selected + Cancel Import + Save Contacts, table with Status/Email/Name/Company/Job Title/List/Actions columns.
- **Expected outcome:** All stats, toolbar, and table columns match mockup. "Save Contacts" is black button; "Cancel Import" is secondary.
- **Done when:** Review page renders with correct columns and toolbar layout.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm run test -- --testPathPattern import-review 2>&1 | tail -10
  ```

---

### DES-007. Contacts: search+filter bar, table columns, pagination, bulk action toolbar

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/contacts/contacts-client.tsx`
- **Problem:** Verify/update contacts page matches mockup: search input + list filter + status filter + date range filter in a flex row; table with checkbox/Status/Email/Name/Company/List/Sent/Last Campaign/Last Sent/⋯ columns; pagination with page buttons; toolbar inside table header with count + Assign to List + Change Status + Delete Selected.
- **Expected outcome:** All columns present; pagination matches mockup style (black active page button); bulk toolbar visible.
- **Done when:** Contacts renders with all columns; pagination visible; search bar has all 4 inputs.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm run test -- --testPathPattern contacts 2>&1 | tail -10
  ```

---

### DES-008. Add Contact: two-panel form (Contact Details + List & Status), AI Hint textarea

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/contacts/add-contact-client.tsx`
- **Problem:** Verify/update add contact form matches two-card layout: card 1 "Contact Details" with First Name/Last Name/Email*/Company/Job Title/Phone/LinkedIn in 2-col grid; card 2 "List & Status" with list dropdown (+ New List… option with inline input) + Status dropdown + AI Hint textarea (`#F0F7FF` bg, blue border). Action row: Cancel + Save & add another + Save Contact.
- **Expected outcome:** Form renders in two-card layout with all fields; AI Hint textarea has correct styling; "New List" inline input appears on selection.
- **Done when:** All fields render; AI Hint textarea background is `#F0F7FF`; border `#BFDBFE`.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check at `/contacts/add`.

---

### DES-009. Contact Profile: split 2-col layout — contact card + AI email panel

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/contacts/contact-profile-client.tsx`
- **Problem:** Verify/update contact profile page matches mockup's 2-col split (`340px 1fr`): left card has avatar initials circle, contact fields in vertical list, "Edit Contact" button; right card has "AI Profile & Email" header, "Pending Review" badge, editable Subject input, editable email textarea, 3 regenerate buttons + Pending/Approve toggle buttons.
- **Expected outcome:** Split layout renders; left has all contact fields with uppercase labels; right panel has editable subject + body + regenerate/approve buttons. Approve button turns green when approved.
- **Done when:** 2-col layout renders; Pending/Approve toggle functional; AI Hint field shown in left card.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check at `/contacts/[id]`.

---

### DES-010. Lists: 3-col grid cards, search bar, pagination

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/lists/lists-client.tsx`
- **Problem:** Verify/update lists page: search bar on top (flex row with count), 3-col grid of cards. Each card: name + "Updated X" subtitle, trash icon, 3 mini-stats (Contacts/Ready/Issues), "Create Campaign" button. Pagination at bottom.
- **Expected outcome:** Grid cards match mockup; hover effect changes border to blue `#2563EB`; trash icon turns red on hover. Empty state message when search has no results.
- **Done when:** 3-col grid renders; hover border color change works; pagination visible.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check at `/lists`.

---

### DES-011. List Detail: stats row (5 cards), contacts table

- [x] **Status:** Done
- **Priority:** Low
- **Depends on:** DES-001
- **Files to touch:** `components/lists/list-detail-client.tsx`
- **Problem:** Verify/update list detail page: list name as H1, 5 stat cards row, contacts table with Status/Email/Name/Company/Email Status/View columns (no checkbox, simpler than contacts page).
- **Expected outcome:** Stats row + table match mockup.
- **Done when:** 5 cards render; table has correct columns; View links to contact profile.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```

---

### DES-012. Campaigns list: search+filter bar, table, Delete Selected toolbar

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/campaigns/campaigns-client.tsx`
- **Problem:** Verify/update campaigns list: search + status filter + list filter + date filter bar; table with checkbox/Name/List/Status/Total/Sent/Failed/Pending/Created/View columns; toolbar inside table header showing count + Delete Selected (danger button).
- **Expected outcome:** Table has all columns; Sent column text is green `#16A34A`; Failed column is red `#DC2626`.
- **Done when:** All columns present; color coding works; "Delete Selected" is danger-styled.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm run test -- --testPathPattern campaigns 2>&1 | tail -10
  ```

---

### DES-013. Create Campaign Wizard: 5-step stepper UI

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** DES-001
- **Files to touch:** `components/campaigns/create-campaign-wizard.tsx`
- **Problem:** Verify/update wizard to match mockup's stepper: numbered circles (active=`#000`, done=`#000`, upcoming=`#E5E7EB`) + step label + divider line between steps. Steps: 1=Campaign Details, 2=AI Instructions, 3=Review Emails, 4=Sending Settings, 5=Confirmation. Step 4 has dual-range slider for interval. Step 5 shows confirm grid + system prompt preview + green ready banner.
- **Expected outcome:** Stepper matches mockup visual; all 5 steps render their correct form layouts; navigation Back/Next/Save Draft/Launch buttons work.
- **Done when:** All 5 steps render; stepper circles reflect active/done/upcoming states; dual-range slider on step 4 works.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm run test -- --testPathPattern create-campaign-wizard 2>&1 | tail -10
  ```
  Visual check at `/campaigns/create`.
- **Risk / notes:** Dual-range slider (step 4) is custom CSS — two overlapping `<input type="range">` elements with `pointer-events:none` on track and `pointer-events:auto` on thumbs.

---

### DES-014. Campaign Review: split 2-col — contacts list panel + email preview panel

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/campaigns/campaign-review-client.tsx`
- **Problem:** Verify/update campaign review page: left panel `320px` is scrollable contacts list (avatar initials, name, email, colored dot status); right panel shows selected email: To header, subject box, email body, personalization notes, Edit/Regenerate/Skip/Approve buttons.
- **Expected outcome:** 2-col layout at `calc(100vh - 64px - 56px)` height; left list scrollable; right panel with Approve green button.
- **Done when:** Split layout renders; clicking contact in left updates right panel; Approve button turns green.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check at `/campaigns/[id]/review`.

---

### DES-015. Campaign Detail: stats, progress bar, details+AI cards, sends table, slide-over panel

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** DES-001
- **Files to touch:** `components/campaigns/campaign-detail-client.tsx`
- **Problem:** Verify/update campaign detail: header with campaign name + status badge + Pause/Retry Failed/Cancel buttons; 5 stat cards; progress bar (blue, `border-radius:999px`); 2-col cards for Campaign Details + AI Instructions (each with Edit button opening a modal); sends table with search+status filter + Contact/Subject/Status/Sent At/Error/View columns + pagination; slide-over "Email Detail" panel (460px from right).
- **Expected outcome:** All sections render; Edit buttons open correct modals; slide-over panel opens from right for row View; sends table has pagination with per-page selector.
- **Done when:** Progress bar visible; both edit modals open/save; slide-over works; pagination works.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check at `/campaigns/[id]`.
- **Risk / notes:** Two modals (Edit Campaign Details, Edit AI Instructions) are inline in the mockup — extract to reusable `<Modal>` wrapper or use existing `<Dialog>`.

---

### DES-016. Settings: tabs redesign — SMTP, AI, Limits, Notifications, Account

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/settings/settings-client.tsx`
- **Problem:** Verify/update settings page: tab nav with underline style (border-bottom, no pill); SMTP tab has all 9 fields (host/port/user/pass/from name/from email/reply-to/encryption/daily limit/hourly limit) + 3 action buttons; AI tab has provider selector + model selector + API key + optional Base URL (visible only for Custom Provider); Limits tab has 5 global limit fields; Notifications tab has 4 groups (Campaigns/AI/Delivery/System) each with toggle + channel select per event; Account tab has Account Settings card + Change Password card.
- **Expected outcome:** All 5 tabs render their full forms. Notification toggles are custom (36px × 20px pill). "Custom Provider" Base URL field shows/hides based on provider selection.
- **Done when:** All 5 tabs render; notification toggle styling matches mockup; Custom Provider field is conditional.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm run test -- --testPathPattern settings 2>&1 | tail -10
  ```
  Visual check at `/settings`.

---

### DES-017. Reports: stats row, search+filter bar, table, slide-over detail panel

- [x] **Status:** Done
- **Priority:** Medium
- **Depends on:** DES-001
- **Files to touch:** `components/reports/reports-client.tsx`
- **Problem:** Verify/update reports: 5 stat cards, search bar with clear button (×), status filter, date range (From/To), table with Campaign/Contact/Email/Status/Sent Date/Error/View columns, pagination with per-page selector, slide-over panel showing full email body (read-only, `white-space:pre-wrap`).
- **Expected outcome:** Stats row + filter bar + table + slide-over match mockup. View button opens 460px slide-over from right. Search bar has × clear button that appears only when search has value.
- **Done when:** All columns render; slide-over opens; pagination works; clear button visible only when search non-empty.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check at `/reports`.

---

### DES-018. Shared: status badge color map — all statuses use correct mockup colors

- [x] **Status:** Done
- **Priority:** High
- **Depends on:** DES-001
- **Files to touch:** `components/ui/badge.tsx`, `lib/utils.ts` (or new `lib/status-colors.ts`)
- **Problem:** Status badges across contacts, campaigns, and sends need consistent color mapping per mockup:
  - Ready → `bg:#DCFCE7 color:#16A34A`
  - Pending / Pending Review → `bg:#FEF3C7 color:#A16207`
  - Sending → `bg:#DBEAFE color:#1D4ED8`
  - Completed → `bg:#F0FDF4 color:#15803D`
  - Failed → `bg:#FEF2F2 color:#DC2626`
  - Draft → `bg:#F1F5F9 color:#475569`
  - Suppressed / Skipped → `bg:#F1F5F9 color:#6B7280`
  - Invalid / Unsubscribed → `bg:#FEF2F2 color:#B91C1C`
- **Expected outcome:** A `getStatusColors(status: string)` utility returns `{ bg, fg }`. All badge renders use it.
- **Done when:** All status values produce correct colors; no hardcoded badge bg/color elsewhere.
- **Verification:**
  ```bash
  npx tsc --noEmit
  npm run test 2>&1 | tail -15
  ```

---

### DES-019. Shared: notification bell badge — red circle with count, redesigned popup

- [x] **Status:** Done
- **Priority:** Low
- **Depends on:** DES-003
- **Files to touch:** `components/layout/topbar.tsx`
- **Problem:** Current badge is blue `bg-blue-600`. Mockup uses `#DC2626` with white `2px` border. Notification popup: 360px, icon-colored notification rows (`iconBg` / `iconFg`), unread rows have `#F8FAFC` bg, blue dot indicator, "View all notifications" footer link.
- **Expected outcome:** Badge is red `#DC2626`; popup width 360px with styled notification rows.
- **Done when:** Badge color is `#DC2626`; popup shows icon circles with colored backgrounds; "View all" footer link present.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check — open notification panel.

---

### DES-020. Mobile: sidebar off-canvas with hamburger toggle and overlay

- [x] **Status:** Done
- **Priority:** Low
- **Depends on:** DES-002, DES-003
- **Files to touch:** `components/layout/sidebar.tsx`, `components/layout/topbar.tsx`, `app/(dashboard)/layout.tsx`
- **Problem:** Mockup has responsive breakpoints: `≤780px` sidebar becomes `position:fixed` off-canvas (translateX(-100%)), overlay div blocks main content. Hamburger button appears in TopBar on mobile. Closing: click overlay or hamburger again.
- **Expected outcome:** Mobile viewport (<780px): sidebar hidden by default, hamburger opens it with overlay, clicking overlay closes it.
- **Done when:** Sidebar opens/closes on mobile; overlay visible when sidebar open; desktop layout unaffected.
- **Verification:**
  ```bash
  npx tsc --noEmit
  ```
  Visual check at mobile viewport (375px) in browser DevTools.

---

## Completion rule

A task can be changed from `- [ ]` to `- [x]` only when:

- Implementation is complete and visually matches the corresponding section of `MailWaveMockup.html`.
- `npx tsc --noEmit` exits 0.
- Any existing tests in the modified area still pass.
- The change is committed before marking done.

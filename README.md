This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Design System

The UI is built on [shadcn/ui](https://ui.shadcn.com/) primitives (Radix UI + Tailwind v4). Colors, radii and typography flow from a single set of HSL CSS variables declared in `app/globals.css` under the `@theme` block, so components stay tokenised end-to-end.

**Tokens** (all in HSL, defined in `app/globals.css`):

- Surfaces — `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`
- Brand — `primary`, `primary-foreground`, `ring`
- Neutrals — `secondary`, `muted`, `muted-foreground`, `accent`, `accent-foreground`
- Semantic — `destructive`, `success`, `warning` (each with `-foreground`)
- Structural — `border`, `input`
- Sidebar — `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-accent`, `sidebar-border`, `sidebar-ring`
- Radii — `--radius: 0.5rem` (plus `--radius-sm`, `--radius-md`, `--radius-lg`)

Use them via Tailwind utilities: `bg-primary`, `text-muted-foreground`, `border-input`, `focus-visible:ring-ring`, etc. Never inline raw hex values.

**Component layout:**

- `components/ui/*` — shadcn primitives (Button, Card, Input, Select, Table, Dialog, Sheet, Popover, Tooltip, Command, Pagination, Avatar, Skeleton, …). Each file exposes a `data-slot` attribute for styling hooks.
- `components/shared/*` — MailWave-specific reusable pieces built on the primitives: `PageHeader`, `MetricCard`, `FilterBar`, `DataPagination`, `StatusBadge`.
- `components/layout/*` — `Sidebar` (desktop + `MobileSidebar` via `Sheet`) and `TopBar`.

**Adding a new shadcn component**

1. Copy the source from https://ui.shadcn.com/ into `components/ui/`.
2. Replace any hex color or `bg-gray-…`/`text-slate-…` classes with token utilities (`bg-background`, `text-muted-foreground`, `border-input`, `ring-ring`, …).
3. Add `data-slot="<component>"` on the root element.
4. Install the underlying Radix primitive if needed and re-run `npm run typecheck`.

**Status badges**

Contact / campaign / email statuses render through `<StatusBadge status={x} />` in `components/shared/status-badge.tsx`. That helper maps the status string to a variant of the CVA-driven `<Badge />` component. To support a new status, add the variant class in `components/ui/badge.tsx` and list the key in `getStatusVariant` (`lib/status-colors.ts`).

## Testing

Required services: **PostgreSQL** and **Redis** running locally, with `.env` configured
(`DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`). One-time DB setup:

```bash
npm run prisma:push   # sync schema
npm run seed          # idempotent; creates demo@mailwave.app / password123
```

Commands (all from this directory):

```bash
npm run typecheck     # TypeScript
npm run lint          # ESLint
npm run test          # Vitest unit/component suite (no services needed)
npm run test:e2e      # Playwright — seeds the DB, boots next dev, logs in once
```

Conventions:

- Unit/component tests live next to the code as `*.test.ts(x)`; API route tests use
  `// @vitest-environment node` (jsdom's `File` breaks multipart parsing).
- Shared helpers: `test/api-helpers.ts` (route-handler harness), `test/render.tsx`
  (react-query render wrapper), `lib/__mocks__/` (manual mocks for `prisma` and `auth`).
- E2E fixtures: `e2e/fixtures/` — global seed, one-time login (storage state in
  `e2e/.auth/`), and an OpenAI-compatible AI stub. The campaign spec spawns the real
  BullMQ worker, so Redis must be up.
- Task history and per-task verification: see `../MAILWAVE_TESTING_LOOP.md`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

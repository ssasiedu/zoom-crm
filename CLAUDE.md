# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DM CRM — ticket and issue management for a Ghanaian customer-service and Debt Management (DM) team. Agents log client contacts (calls, WhatsApp, SMS, walk-ins); supervisors assign tickets to DM officers; officers work their queue from their phones; managers track SLAs, payments and performance across Ghana's 16 regions.

Stack: React 19, Vite 7, TypeScript, Tailwind CSS v4, React Query, React Router v7, React Hook Form + Zod, Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions).

## Commands

```bash
npm run dev            # start dev server at http://localhost:5173
npm run build           # production build into dist/
npm run build:strict    # tsc --noEmit, then build (use this before shipping — see below)
npm run typecheck        # tsc --noEmit only
npm run preview          # serve the production build locally
npm run lint             # ESLint
npm run format            # Prettier, write (sorts Tailwind classes)
npm run format:check      # Prettier, check only
```

There is no test suite/runner in this repo — don't invent test commands.

`npm install` pulls `xlsx` from `cdn.sheetjs.com` (the npm registry version is outdated); `.npmrc` sets `allow-remote=root` for this. If install fails with `EALLOWREMOTE`, run `npm i --allow-remote=root`.

Local env: `cp .env.example .env.local` and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Only the anon key ever goes in the frontend — the database enforces access via RLS, so shipping it is safe.

## Architecture

### Authorization lives in two places, deliberately

Every permission rule is enforced twice: in Postgres (RLS policies + triggers in `supabase/migrations/`) and mirrored in `src/lib/permissions.ts` (`ROLE_PERMISSIONS`, `hasPermission`) purely to control what the UI shows. **The database is the real authority** — if you change a permission, the client-side check in `permissions.ts` is cosmetic only and must match the migration, not replace it. Four roles: `admin`, `supervisor`, `agent`, `dm_officer`. `homePathFor(role)` sends `dm_officer` to `/my-tickets` and everyone else to `/dashboard`.

### All Supabase access goes through `src/services/*`

Components and hooks never import `src/lib/supabase.ts` directly — one service module per domain area (`tickets.ts`, `officers.ts`, `lookups.ts`, `notifications.ts`, `reports.ts`, etc.). Every service call result should be passed through `unwrap()`/`toAppError()` from `src/services/errors.ts`, which translates Postgres error codes (RLS denial `42501`, unique violation `23505`, FK violation `23503`, check violation `23514`, trigger-raised `P0001`) into user-facing messages. When adding a new mutation, follow this pattern rather than handling raw Supabase errors inline.

Data fetching goes through React Query, keyed via `qk` in `src/lib/queryClient.ts`, wrapped in hooks under `src/hooks/` (`useLookups`, `useTickets`, `useOfficers`, etc.) rather than called directly from components.

### The database does the heavy lifting, not the client

Read `supabase/migrations/` in order to understand the actual business rules before changing ticket logic on the client — most of it is enforced in triggers, not in React:

- `tickets_before_insert/update` triggers generate ticket numbers (`TKT-2026-000123`), normalize phone numbers, compute `DUE DATE` from `DATE OPENED` + the issue type's SLA days, enforce field-level edit permissions per role, validate status transitions, and stamp `assigned_at`/`resolved_at`/`closed_at`.
- `tickets_after_change` writes the audit trail (`ticket_activity`) and creates notifications.
- Dashboard/report numbers come from `SECURITY INVOKER` SQL functions, so they automatically respect RLS (an agent's dashboard only counts their own tickets) — don't try to replicate that filtering in the client.
- Lookup values (contact types, issue types, payment sources/types/statuses, regions) are stored on tickets by name with `ON UPDATE CASCADE` FKs, so renaming a value in Administration updates every ticket instantly; values in use can only be deactivated, not deleted.
- `tickets`, `notifications`, `ticket_comments`, `ticket_activity` are in the `supabase_realtime` publication and consumed via `src/hooks/useRealtime.ts`.
- Attachments live in the private `ticket-attachments` Storage bucket under `<ticket_id>/…`, served via short-lived signed URLs, access following ticket visibility.
- A ticket is overdue when `DUE DATE` is before today in `Africa/Accra` time and status is Open or In-Progress — this timezone matters for any date-range filter or report logic (`src/utils/dateRange.ts`).

If you change ticket behavior, check whether the migration files or the client code (or both) need updating — most "business logic" bugs are actually in the SQL triggers/RLS, not the React code.

### Routing and permission gating

`src/app/App.tsx` is the single source of routes. All feature pages are lazy-loaded. Routes needing a permission wrap their element in `<Page permission="...">`, which renders `<RequirePermission>` (in `src/features/auth/ProtectedRoute.tsx`) checking `useAuth().can(permission)`. `<RequireAuth>` wraps the whole authenticated shell (`AppShell`). Add new pages by lazily importing them here and registering the permission, matching entries in `ROLE_PERMISSIONS`.

### Directory layout

```
src/
├── app/App.tsx        Routes, providers, lazy page loading
├── components/ui/       Design-system primitives (Button, Input, Modal, DataTable…)
├── components/charts/    Recharts theme/tooltip/card wrappers
├── components/layout/    AppShell, sidebar, top bar, command palette, ErrorBoundary
├── features/<area>/     Page components + area-specific logic (tickets, dashboard, reports, admin, auth, notifications, profile)
├── hooks/           React Query hooks + AuthProvider/useAuth, realtime, theme
├── lib/            supabase client, permissions matrix, query client/keys, constants
├── services/         One module per DB domain — the only layer that talks to Supabase
├── types/           Domain types shared across the app
└── utils/           Formatting, phone validation, date ranges, export helpers
```

`supabase/migrations/*.sql` run in filename order (`...0001` extensions/enums/lookups → `...0007` storage/realtime); `supabase/seed.sql` is idempotent (only inserts sample tickets if the table is empty). `supabase/functions/invite-user` is the one Edge Function — it holds the service-role key server-side for admin user invitations and is excluded from ESLint (`eslint.config.js` ignores `supabase/functions`).

## Conventions worth knowing

- Path alias `@/*` → `src/*` (configured in both `tsconfig.json` and `vite.config.ts`).
- Money is formatted as `GH₵ 1,250.00`, dates as `DD/MM/YYYY`, and all business-time logic uses `Africa/Accra` — use the existing helpers in `src/utils/` rather than raw `Date`/`Intl` calls.
- Ghana phone numbers are validated/normalized as `0XXXXXXXXX` / `+233XXXXXXXXX` (see `src/utils/phone.ts` and the `23514` check in `errors.ts`).
- `noUnusedLocals`/`noUnusedParameters` are enforced by `tsconfig.json` (prefix intentionally-unused params/vars with `_`); `@typescript-eslint/no-explicit-any` is a warning, not an error, but avoid it outside of generic constraint helpers like `applyFilters` in `services/tickets.ts`.
- Run `npm run build:strict` (not just `npm run build`) before considering TypeScript changes done — plain `vite build` does not type-check.

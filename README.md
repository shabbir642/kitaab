# Assessment Dashboard

A local dashboard for survey assessment records: create, edit and delete records,
scan them in a dense filterable list, and see the numbers behind them.

Everything runs on your own machine. The whole dataset is a single SQLite file
under `data/`.

## Running it

```bash
pnpm install
pnpm seed        # optional: 420 sample records to look at
pnpm dev         # http://127.0.0.1:3000
```

For day-to-day use:

```bash
pnpm build && pnpm start
```

Both `dev` and `start` bind to `127.0.0.1` only. These records describe real
people, so the app is deliberately not reachable from the network — don't change
that without adding authentication first.

| Command | What it does |
|---|---|
| `pnpm dev` | dev server with hot reload |
| `pnpm build` / `pnpm start` | production build and serve |
| `pnpm seed [n] [--reset]` | insert sample records (`--reset` clears first) |
| `pnpm backup` | consistent snapshot into `backups/` |
| `pnpm check` | verifies the validation, query and analytics layers |
| `pnpm e2e [url]` | drives a real headless browser through create / edit / paste / bulk delete |
| `pnpm typecheck` / `pnpm lint` | types and lint |

## What's in it

**Records list** (`/assessments`)
- Dense table: ID, name, location, both phases with status *and* date, flags, assessor
- Keyword search across ID, name, location, assessor and remarks (SQLite FTS5)
- Faceted filters with live counts: survey status, completion status, "any status
  column is X", location, survey/completion date ranges
- One-click flags: overdue, has data issues, missing completion date, no survey date
- Sortable columns, adjustable page size, multi-select with bulk status change and
  bulk delete
- Every filter lives in the URL, so any view is bookmarkable and shareable
- Export the current filtered view to CSV

**Add records** (`/assessments/new`)
- Single-record form with validation
- Paste-multiple box for tab- or comma-separated rows; rows that fail validation
  are listed and left unsaved rather than guessed at

**Record page** (`/assessments/[id]`)
- Edit in place, plus derived values (days since survey, turnaround, overdue),
  data-quality warnings and provenance

**Analytics** (`/analytics`)
- Scoped by the same filter bar as the list
- Stat tiles: records, surveys completed, completions done, in flight, overdue,
  median turnaround
- Survey/completion activity by month, status distribution per phase, and a
  completed-vs-open breakdown by location
- Every chart has a table view, so no value is reachable only by hovering

## How it is put together

| Piece | Choice | Why |
|---|---|---|
| Store | SQLite via Node's built-in `node:sqlite` | one file to back up, no daemon, no native build step |
| Search | FTS5 external-content index kept in sync by triggers | real keyword search without duplicating the rows |
| Framework | Next.js App Router, server components | filtering, sorting and paging happen in SQL, not in the browser |
| Mutations | server actions | no hand-written API layer for CRUD |
| Charts | Recharts, themed with CSS custom properties | light/dark swap in one place |

### Things worth knowing

- **Dates are stored as `YYYY-MM-DD` strings**, never as `Date` objects, and are
  formatted without going through `Date()`. A calendar date must not shift because
  of the machine's timezone. Validation rejects dates that don't exist
  (`2026-02-31`) rather than silently rolling them into March.
- **Deletes are soft** (`deleted_at`). Nothing is destroyed; a deleted ID becomes
  reusable because the uniqueness index is partial.
- **Statuses are declared per phase** in `src/lib/schema.ts`. Adding a third phase
  means adding one entry there plus two columns — the list, filters and analytics
  pick it up from the same definitions.
- **"Overdue" and "has data issues" are defined once** as SQL fragments in
  `src/lib/queries.ts`, so the list, the filter counts and the analytics tiles can
  never disagree about what they mean.
- **Data-quality problems are warnings, not errors.** A contradictory record still
  saves and gets flagged; blocking the save is how people stop using a tool.
- `extras` is a JSON column carrying columns the app doesn't model yet. It exists
  so a future spreadsheet import doesn't have to drop anything.

### Not built yet

Spreadsheet import is deliberately out of scope for now. When it lands it needs
header mapping with saved profiles, a dry-run diff before committing, and a
quarantine for rows that fail validation — the paste box is a stopgap, not that.

## Sharing it temporarily

To let someone else poke at it without deploying anything:

```bash
pnpm build && pnpm start                              # terminal 1
cloudflared tunnel --url http://127.0.0.1:3000        # terminal 2
```

`cloudflared` prints a throwaway `https://*.trycloudflare.com` URL that proxies
to the local server. It lives only as long as that process, and the hostname is
different every time. Your machine has to stay awake.

Server actions work through the tunnel unchanged (`pnpm e2e <url>` passes against
it), so a remote tester gets the full app, forms included.

**There is no authentication.** Anyone with the link can edit and delete. That is
fine for a throwaway tunnel over sample data; it is not fine for real records.

## Layout

```
src/lib/db.ts          SQLite connection, schema, FTS triggers
src/lib/schema.ts      phases, status vocabulary, zod validation, warnings
src/lib/queries.ts     filtering, CRUD, facets, analytics aggregates
src/lib/filters.ts     URL <-> filter state
src/app/actions.ts     server actions (save, delete, bulk status, paste)
src/components/        filter bar, table, form, charts
scripts/               seed, backup, check
```

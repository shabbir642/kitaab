# Kitaab

*Kitaab* — the book you keep the records in.

A local dashboard for survey assessment records: create, edit and delete records,
scan them in a dense filterable list, and see the numbers behind them.

Runs on your own machine against a single SQLite file, or deployed against
Turso — same engine, same SQL, one environment variable apart.

## Running it

```bash
pnpm install
pnpm seed        # optional: 420 sample records to look at
pnpm dev         # http://127.0.0.1:3000
```

No database setup: with `KITAAB_DB_URL` unset the app uses a local SQLite file
at `data/app.db` and creates it on first query.

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
| `pnpm db:push` | apply the schema to whatever `KITAAB_DB_URL` points at |
| `pnpm trim [--keep N] [--yes]` | shrink to a small representative set; dry run without `--yes` |
| `pnpm copy-up [--yes] [--replace]` | copy the local database up to the configured remote |
| `pnpm smoke` | read/write smoke test, safe against production — creates one record and removes it |
| `pnpm backup` | consistent snapshot into `backups/` (local file only) |
| `pnpm check` | verifies the validation, query and analytics layers |
| `pnpm e2e [url]` | drives a real headless browser through create / edit / paste / bulk delete |
| `pnpm test:ui` | boots a server on a throwaway database and runs every browser suite against it |
| `pnpm typecheck` / `pnpm lint` | types and lint |

## What's in it

**The shell**
- A left rail of **saved views** — All records, Overdue, Awaiting completion, Data
  issues, No survey date — each carrying an absolute count, plus the busiest
  locations. The view you are standing in is the page title.
- A **keyword box** in the list header, beside Add filter. Typing narrows the
  list in place; `/` jumps to it from anywhere.
- **⌘K command palette** as the separate, optional thing: jump to a view, a
  record or an action rather than filter. Record lookup hits the server;
  everything else matches locally.
- Filters that are not a saved view appear as removable chips under the title.
  Adding one on top of a view stops the rail claiming you are still in it.

**Records list** (`/assessments`)
- Assessment · name · location · **progress** · assessor · age
- The progress column is a two-node pipeline: survey and completion as one
  journey, with the connector coloured by what is actually happening. It replaces
  four separate status/date columns.
- Keyword search across ID, name, location, assessor and remarks (SQLite FTS5)
- Faceted filters with live counts behind **Add filter**: survey status,
  completion status, "any status column is X", location, date ranges, origin
- Flags: overdue, awaiting completion, data issues, missing completion date,
  no survey date
- **Multi-level sort**: order by one field, break ties with up to three more.
  Click a column header to sort by it, shift-click to add it as a tie-breaker,
  or build the whole thing in the Sort menu.
- 10 rows per page by default, adjustable; multi-select with bulk status change
  and bulk delete
- Every filter lives in the URL, so any view is bookmarkable and shareable
- Export the current filtered view to CSV

**Add records** (`/assessments/new`)
- Opens as a **modal** over the list when reached from inside the app, and as a
  full page when the URL is opened directly — one route, two presentations
- Single-record form with validation
- Paste-multiple box for tab- or comma-separated rows; rows that fail validation
  are listed and left unsaved rather than guessed at

**Record page** (`/assessments/[id]`)
- The fields that are also on the list sit in a two-line strip at the top — the
  phase track, then location, assessor, days since survey, turnaround, last
  updated — and then get out of the way.
- Everything below is the room the list does not have: **notes**, remarks, and
  **custom fields**.
- Two editing modes, on purpose:
  - **Edit** opens the core record fields together, in a modal over the record
    (`/assessments/[id]/edit`, a full page if opened directly).
  - Everything else is edited **one field at a time**, in place, so fixing a
    note never means opening a form full of dates.
- Sidebar carries what needs attention (overdue, data-quality warnings) and
  provenance.

**Analytics** (`/analytics`)
- Scoped by the same view and filters as the list
- Stat tiles: records, surveys completed, completions done, in flight, overdue,
  median turnaround
- Survey/completion activity by month, status distribution per phase, and a
  completed-vs-open breakdown by location
- Every chart has a table view, so no value is reachable only by hovering

## How it is put together

| Piece | Choice | Why |
|---|---|---|
| Store | libSQL — a local SQLite file in dev, Turso when deployed | same engine and the same SQL in both places, including FTS5 |
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
- Paths are overridable with `KITAAB_DB_PATH` and `KITAAB_BACKUP_DIR`, which is
  how `pnpm check` runs against a scratch database instead of your real one.
- `extras` is a JSON column carrying columns the app doesn't model yet. It backs
  the record page's custom fields, and it is where a future spreadsheet import
  will put the columns it doesn't recognise — so hand-added and imported extras
  land in the same place.
- **Notes are not `remarks`.** Remarks is one overwritable field that came from
  the spreadsheet; notes accumulate, are dated, and are soft-deleted like
  everything else. Deleting one requires naming the record it belongs to.
- Timestamps are formatted by hand rather than with `toLocaleTimeString`, which
  renders differently under Node and the browser and is therefore a hydration
  mismatch on any server-rendered time.
- **The browser suites refuse to run without an explicit target.** They create
  and delete records; defaulting to the dev server once meant a test edited a
  hand-entered record. `pnpm test:ui` is the safe entry point.
- **Saved views are code, not data** (`src/lib/views.ts`). A view is a query
  string plus a count; "which view am I in" is decided by comparing filter
  signatures, so a view and the filters that reproduce it can never drift apart.
  User-defined saved views would be the natural next step.
- The rail's counts are deliberately **not** scoped by the current filters — a
  view's number has to mean the same thing wherever you are standing.
- The **keyword box and the palette are different tools**, so the keyword is
  deliberately not repeated as a filter chip, and "Clear" leaves it alone.
- Sort state is one URL parameter (`sort=location:asc,name:asc`). Unknown
  fields and duplicate levels are dropped rather than failing the request.

### Not built yet

Spreadsheet import is deliberately out of scope for now. When it lands it needs
header mapping with saved profiles, a dry-run diff before committing, and a
quarantine for rows that fail validation — the paste box is a stopgap, not that.

## Deploying

The app runs against **Turso** in production and a plain SQLite file locally.
Turso is libSQL, so the SQL — the FTS5 search included — is identical either
way; only the environment differs.

Add **Turso Cloud** from the Vercel Marketplace and it provisions the database
and injects `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. The app reads those
names directly rather than copying them into its own, because a duplicated
secret goes stale the first time the integration rotates it.

To work against it from your machine:

```bash
npx vercel link                    # once, to attach this directory to the project
npx vercel env pull .env.local     # writes the injected vars locally
pnpm db:push                       # create the tables and the FTS index there
pnpm copy-up --yes                 # move the local records up (dry runs without --yes)
```

Put the database and the functions in the same region — Turso has
`aws-ap-south-1` (Mumbai), and Vercel functions can be pinned to `bom1`.
Split across continents, every query pays the round trip twice.

Because `.env.local` repoints everything at the live database, the app prints a
warning on start when it is not using your local file, and `pnpm seed` refuses
a remote target outright unless passed `--remote`.

`pnpm smoke` is the one suite meant to be pointed at production: it checks
reads, a write, the FTS triggers behind that write, and notes, using a single
record it creates and then removes outright. It asserts nothing about how much
data exists, so it is as meaningful against ten records as ten thousand.
`pnpm check` and `pnpm test:ui` are not production-safe and say so.

Two things worth knowing:

- **A remote database is never migrated implicitly.** A local file creates and
  migrates itself so `pnpm dev` is zero-setup; a hosted one only changes when
  you run `pnpm db:push` at it deliberately.
- **Every query is a network round trip once deployed.** Locally a query is a
  ~0.1 ms file read, so the sequential style cost nothing; over a network it
  costs 20–60 ms each. The pages therefore issue their independent reads with
  `Promise.all` — the records list fires six at once, analytics ten — which
  turns roughly ten sequential trips into two rounds. Keep that shape when
  adding queries to a page.
- `pnpm backup` only snapshots a local file. For Turso, use its own dump:
  `turso db shell kitaab .dump > backups/kitaab-$(date +%F).sql`

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
src/lib/db.ts          libSQL client, schema, FTS triggers, query helpers
src/lib/schema.ts      phases, status vocabulary, zod validation, warnings
src/lib/queries.ts     filtering, CRUD, facets, analytics aggregates
src/lib/filters.ts     URL <-> filter state
src/lib/views.ts       saved views, active-view matching, page headings
src/app/actions.ts     server actions (save, delete, bulk status, paste)
src/components/        rail, palette, search, sort, chips, table, notes, charts
src/app/@modal/        the intercepted route that makes "new record" a modal
scripts/               seed, backup, check, db:push
scripts/ui/            browser suites + the runner that isolates them
```

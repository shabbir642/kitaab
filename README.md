# Kitaab

*Kitaab* — the book you keep the records in.

A dashboard for survey assessment records: create, edit and delete records,
scan them in a dense filterable list, and see the numbers behind them. Sign-in
is required, and a record belongs to the person who created it.

Runs on your own machine against a single SQLite file, or deployed against
Turso — same engine, same SQL, one environment variable apart.

## Running it

```bash
pnpm install
pnpm seed        # 420 sample records, and the development account
pnpm dev         # http://127.0.0.1:3000
```

No database setup: with `KITAAB_DB_URL` unset the app uses a local SQLite file
at `data/app.db` and creates it on first query.

The app is closed behind a sign-in, so `pnpm seed` also creates a development
account — **`dev@kitaab.test` / `kitaab-dev`**, an admin, local file only and
never on `--remote`. Without it the first `pnpm dev` after a fresh clone is a
login screen nobody can get past. Anywhere a published password is not
acceptable — the deployment, in particular — use `pnpm user:add` instead.

For day-to-day use:

```bash
pnpm build && pnpm start
```

Both `dev` and `start` bind to `127.0.0.1` only, and that stays true now that
there are accounts: these records describe real people, and one boundary is
worth more than none. Don't change the host binding.

| Command | What it does |
|---|---|
| `pnpm dev` | dev server with hot reload |
| `pnpm build` / `pnpm start` | production build and serve |
| `pnpm seed [n] [--reset]` | insert sample records and the development account (`--reset` clears records first) |
| `pnpm user:add <email> "<name>" [--admin]` | create an account; prints a generated password once |
| `pnpm db:push` | apply the schema to whatever `KITAAB_DB_URL` points at |
| `pnpm trim [--keep N] [--yes]` | shrink to a small representative set; dry run without `--yes` |
| `pnpm copy-up [--yes] [--replace]` | copy the local database up to the configured remote |
| `pnpm smoke [--url <base>]` | read/write smoke test, safe against production — creates one record and removes it; with `--url` also checks the app turns strangers away |
| `pnpm db:push:remote` / `pnpm smoke:remote` | the same, aimed at the deployment's database |
| `pnpm backup` | consistent snapshot into `backups/` (local file only) |
| `pnpm export:sql` / `pnpm export:sql:remote` | replayable `.sql` dump — works against Turso, no CLI needed |
| `pnpm restore:sql <file> --into <url>` | replay a dump; dry-runs without `--yes` |
| `pnpm check` | verifies the validation, query and analytics layers |
| `pnpm e2e [url]` | drives a real headless browser through create / edit / paste / bulk delete |
| `pnpm test:ui` | boots a server on a throwaway database and runs every browser suite against it |
| `pnpm typecheck` / `pnpm lint` | types and lint |

## What's in it

**Accounts**
- Email and password sign-in. Passwords are scrypt-hashed; the session is an
  opaque token whose SHA-256 is all the database keeps.
- Two roles. An **admin** sees every record; a **maintainer** sees only the ones
  they created — the list, the counts in the rail, the facets, analytics, the
  CSV export and the search API are all scoped the same way.
- **Sign-up is open** (`/signup`) and always produces a maintainer. That is safe
  because of what a new account can see: somebody who finds the page gets an
  empty app, not a copy of the data.
- **Your account** (`/account`) — change your own password, which signs out
  every *other* browser you were signed in on.
- **People** (`/admin/users`, admin only) — add someone, reset a password,
  deactivate an account. Generated passwords are shown exactly once; the admin
  role is granted here or with `pnpm user:add --admin`, never by signing up.
- There is **no reset email** — a forgotten password is reset by an admin. That
  wants a mail provider the app does not have.
- Every write is attributed and logged (see **The audit trail** below).

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
| Passwords | `node:crypto` scrypt | every good argon2 is a native module, and `serverExternalPackages` already carries one |
| Sessions | opaque token in a `sessions` table | a JWT cannot be revoked without a deny-list, which is a sessions table with extra steps |
| Enforcement | `requireUser()` inside every page, action and route handler | middleware is a redirect for humans, not a boundary — Next has had bypasses (CVE-2025-29927) |

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
- **The actor is a required argument** on every function that touches
  assessments (`src/lib/queries.ts`). It carries both the visibility clause and
  the id to stamp, so the two cannot drift apart — and a call site that forgets
  it is a compile error rather than a silent leak. Scripts act as
  `{ id: null, role: "admin" }`.
- **Rows created before accounts existed have `created_by` NULL**, which matches
  no maintainer, so they are admin-only. They are not backfilled to a synthetic
  user: inventing an actor who did not act is worse than admitting the gap. This
  is also why `pnpm seed` creates an *admin* — script-inserted rows are
  ownerless, and a seeded maintainer would sign in to an empty app.
- **`assessmentIdExists` is deliberately not scoped.** IDs are unique across the
  whole table, so a maintainer has to be told about a collision with a record
  they cannot see.
- **The audit trail** (`src/lib/activity.ts`) is written from inside the query
  layer rather than from the actions, so a new call site cannot forget it. Only
  writes that actually changed a row are recorded — a maintainer aiming at a
  record they cannot see leaves no trail. It is written but not yet read back in
  the app; `pnpm check` is its only reader today.
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

On the accounts side, deliberately left out rather than missed: self-service
password reset by email (needs a mail provider and a token table), two-factor,
SSO, a signed-in-devices screen — the `sessions` table already carries the
columns for it — per-record or per-location permissions, and an in-app activity
feed. `AUTH_PLAN.md` §8 is the standing list.

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
pnpm db:push:remote                # create the tables and the FTS index there
pnpm copy-up --yes                 # move the local records up (dry runs without --yes)
```

**Create the admin before the deployment that closes the app**, or nobody can
get in — sign-up only makes maintainers, and a maintainer sees nothing that was
copied up:

```bash
KITAAB_USE_REMOTE=1 pnpm user:add you@example.com "Your Name" --admin
```

There is no session secret to configure: sessions are rows, and the token is
random rather than signed. No new environment variable either way.

Put the database and the functions in the same region — Turso has
`aws-ap-south-1` (Mumbai), and Vercel functions can be pinned to `bom1`.
Split across continents, every query pays the round trip twice.

`vercel env pull` writes those variables into `.env.local`, which Next loads
for `pnpm dev` as well — so honouring them unconditionally would point local
development at live data. They therefore apply only when `NODE_ENV=production`
(a deployment) or when something opts in with `KITAAB_USE_REMOTE=1`, which is
what the `:remote` scripts do. `KITAAB_DB_URL` remains an explicit override
that wins everywhere, for pointing a single command at a scratch file.

Two more guards, since the cost of getting this wrong is other people's data:
the app prints a warning on start whenever it is not using the local file
(naming the host, never the token), and `pnpm seed` refuses a remote target
outright unless passed `--remote`.

`pnpm smoke` is the one suite meant to be pointed at production: it checks
reads, a write, the FTS triggers behind that write, and notes, using a single
record it creates and then removes outright. It asserts nothing about how much
data exists, so it is as meaningful against ten records as ten thousand.
`pnpm check` and `pnpm test:ui` are not production-safe and say so.

Smoke goes through the data layer rather than HTTP, which is what lets it run
with no server — but it also means a green run says nothing about whether the
app in front of that data is closed. Give it the deployment's URL and it checks
that too:

```bash
pnpm smoke:remote --url https://kitaab.example.com
```

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
- `pnpm backup` only snapshots a local file. For a hosted database use
  `pnpm export:sql:remote`, which writes a replayable `.sql` dump through the
  same client the app uses — schema, rows, then the FTS index rebuilt from them.
  `pnpm restore:sql` replays one, and restoring into a scratch file is how you
  check a dump is good.

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

The tunnel is public, but the app behind it is not: whoever follows the link
gets a sign-in screen. Give them an account with `pnpm user:add` rather than the
development one, and remember that sign-up is open — anyone with the link can
create a maintainer account, which starts empty. `pnpm smoke --url <tunnel>`
checks the closed part is actually closed.

## Layout

```
src/lib/db.ts          libSQL client, schema, FTS triggers, query helpers
src/lib/schema.ts      phases, status vocabulary, zod validation, warnings
src/lib/queries.ts     filtering, CRUD, facets, analytics aggregates — all actor-scoped
src/lib/filters.ts     URL <-> filter state
src/lib/views.ts       saved views, active-view matching, page headings
src/lib/auth.ts        hashing, users, sessions, throttling, signIn()
src/lib/session.ts     the cookie half: currentUser, requireUser, requireAdmin
src/lib/activity.ts    the audit trail
src/app/actions.ts     server actions (save, delete, bulk status, paste)
src/app/auth-actions.ts  sign in/out, sign up, change password, admin user actions
src/app/login|signup/  the way in
src/app/account/       your own password
src/app/admin/users/   admin-only people management
src/components/        rail, palette, search, sort, chips, table, notes, charts
src/app/@modal/        the intercepted route that makes "new record" a modal
scripts/               seed, backup, check, db:push, user:add
scripts/ui/            browser suites + the runner that isolates them
```

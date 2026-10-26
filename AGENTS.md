# Kitaab

A dashboard for survey assessment records. See `README.md` for what the app
does and the full command table — this file is only the things that are easy to
get wrong.

Authentication is in: accounts, sessions, per-user visibility and an audit
trail. `AUTH_PLAN.md` is the design and the reasoning; what is left of it is
section 8 and the deployment, which has not happened — `main` is still the
pre-auth app.

## Traps

**Know which database you are talking to.** Precedence, highest first:
`KITAAB_DB_URL` → (`NODE_ENV=production` or `KITAAB_USE_REMOTE=1`) with
`TURSO_DATABASE_URL` → local file `data/app.db`. `vercel env pull` writes the
Turso variables into `.env.local`, and Next loads that for `pnpm dev` too, which
is why they are opt-in. Never add a database URL to `.env.local` casually. On
start the app prints `⚠ Kitaab is using a remote <host>` whenever it is not on
the local file — during `pnpm dev` that means stop and fix it, not carry on.

**Never make the app reachable from the network.** `dev` and `start` bind to
`127.0.0.1` deliberately: these records describe real people. There are
accounts now, but that does not buy back the binding — one boundary is worth
more than none. Do not change the host binding.

**The actor argument is the safety property.** Every function in
`src/lib/queries.ts` that touches assessments takes an `Actor` as a *required*
argument, carrying both the visibility clause and the id to stamp. Do not make
it optional, and do not add a query that reaches `assessments` without it: a
missed call site has to be a compile error rather than a silent leak. Scripts
act as `{ id: null, role: "admin" }`. The one deliberate exception is
`assessmentIdExists`, because IDs are unique table-wide and a collision must be
reported even against a record you cannot see.

**`requireUser()` is the boundary, and it lives in each page, server action and
route handler.** There is no middleware and there should not be: the layout has
to resolve the user anyway, and Next has had middleware-bypass vulnerabilities.
A new page without it is simply unprotected. The two API routes return 401
rather than redirecting, because they answer machines.

**Sign-up is open and always makes a maintainer.** The role is never read from
a form. Admin comes from `pnpm user:add --admin` or from an existing admin on
`/admin/users`.

**Destructive scripts need to be asked for.** `trim`, `copy-up --replace`,
`restore:sql`, `seed --reset`, and anything `:remote` can destroy live data.
Dry-run first; never point one at the remote without being told to explicitly.

**Native modules must be listed in `serverExternalPackages`** in
`next.config.ts`, or the bundler traces them into the server bundle and they
break at runtime. `@libsql/client` is there for this reason.

## Conventions

- **pnpm, never npm.** The lockfile and `packageManager` pin are authoritative.
- **Hand-written SQL, no ORM.** The schema is one idempotent `SCHEMA` string in
  `src/lib/db.ts`, built entirely from `IF NOT EXISTS`. Don't introduce a
  migration library. Note that SQLite's `ALTER TABLE` has no `IF NOT EXISTS`, so
  added columns need a `PRAGMA table_info` check.
- **Soft delete everywhere** — `deleted_at`, with unique indexes scoped to live
  rows (`WHERE deleted_at IS NULL`) so a deleted ID can be reused.
- **The FTS5 triggers mirror the `assessments` column list.** Changing that
  table means updating `assessments_ai` / `_ad` / `_au` to match.
- **Timestamps are ISO strings in `TEXT` columns.** `intMode: "number"` is
  pinned so row shapes are identical on the local file and on Turso.
- **Filter state lives in the URL.** That is what makes every view bookmarkable
  and shareable; keep new filters there rather than in component state.
- Charts use the validated dataviz palette — see the `dataviz` skill.

## Before saying it's done

```bash
pnpm typecheck && pnpm lint && pnpm check
pnpm test:ui      # anything touching the UI
```

`test:ui` boots its own server on a throwaway database and needs its own build
directory (`KITAAB_DIST_DIR`), because two dev servers fight over `.next`.

## Style

Comments explain **why**, not what — usually a short prose block above a
section, in the voice of `src/lib/db.ts` and `src/lib/schema.ts`. Match the
surrounding code rather than adding a new dialect.

Commit messages are sentence-case and describe intent, not mechanics:
"Make the records list usable on a phone", not "update DataTable.tsx".

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

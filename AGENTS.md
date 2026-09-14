# Kitaab

A dashboard for survey assessment records. See `README.md` for what the app
does and the full command table — this file is only the things that are easy to
get wrong.

Current work in flight: `AUTH_PLAN.md`. There is no authentication yet.

## Traps

**Know which database you are talking to.** Precedence, highest first:
`KITAAB_DB_URL` → (`NODE_ENV=production` or `KITAAB_USE_REMOTE=1`) with
`TURSO_DATABASE_URL` → local file `data/app.db`. `vercel env pull` writes the
Turso variables into `.env.local`, and Next loads that for `pnpm dev` too, which
is why they are opt-in. Never add a database URL to `.env.local` casually. On
start the app prints `⚠ Kitaab is using a remote <host>` whenever it is not on
the local file — during `pnpm dev` that means stop and fix it, not carry on.

**Never make the app reachable from the network.** `dev` and `start` bind to
`127.0.0.1` deliberately: these records describe real people and there is no
authentication yet. Do not change the host binding.

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

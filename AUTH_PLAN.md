# Kitaab — authentication plan

Status: **built** - closed, per-user, audited, with the screens and the tests.
What is left is the deployment (section 6), which has not happened: `main` is
still the pre-auth app and the live site is still publicly readable. Everything
else outstanding is section 8, which is deferred work rather than unfinished
work. Written 14 September 2026, last revised 26 October 2026.

Kitaab holds assessment records describing real people. Locally the app binds to
`127.0.0.1` precisely so it is unreachable, and the README says in as many words
that this must not change without authentication first. The Vercel deployment is
a public URL, so that promise currently holds on the laptop and not on the
internet. This document is the plan for closing that gap.

Scope: email and password sign-in, a real users table, and records that belong
to the person who created them.

---

## 1. Decisions, and what was turned down

| Decision | Choice | Why not the alternative |
|---|---|---|
| Identity | email + password | Asked for. A shared passphrase cannot attribute an edit to anyone. |
| Roles | **admin, maintainer** | An admin sees the whole table; a maintainer sees only what they created. Carried by one `Actor` value through the query layer, required at every call site so a missing scope is a type error rather than a leak. |
| Password hashing | **`node:crypto` scrypt** | `argon2` is a better KDF, but every good implementation is a native module. `@libsql/client` already forced `serverExternalPackages` in `next.config.ts`; a second prebuilt binary in the bundle path is a known cost for a marginal gain at this scale. scrypt is in Node, tuned by parameters, and has no build story. |
| Session | **opaque token in a `sessions` table** | A signed JWT is stateless and cannot be revoked without inventing a deny-list — which is a sessions table with extra steps. There is already a database one query away. |
| Signup | **open, and always produces a maintainer** | Open registration was the wrong call while every account saw every record. It is sound now that visibility is per-user: someone who finds the page gets an empty app, not a copy of the data. The admin role stays CLI-only. |
| Password reset | **admin-triggered, not self-service email** | Self-service needs a mail provider (Resend/Postmark) and a reset-token table. Deferred, not designed out — §8. |
| Sessions store | same libSQL database as everything else | Same engine local and remote, so sign-in behaves identically in both homes. No Redis, no second dependency. |

---

## 2. Architecture

### The shape of a request

```
  request
     │
     ▼
  root layout ── currentUser() ─ cookie ─▶ sessions ─ join ─▶ users
     │              (React per-request cache: resolved once, reused)
     │
     ├─ nobody?  draw no shell, skip the rail's two reads
     ▼
  page / server action / route handler
     │
     ├─ requireUser()  ◀── the enforcement, server-side, every time
     │                     page  -> redirect /login
     │                     route -> 401
     ▼
  queries.ts ──▶ writes stamped with user id ──▶ activity log
```

**One boundary, not two.** The original plan had a proxy-level redirect in
front of this for speed. It was dropped: the layout has to resolve the user
anyway, so the coarse gate saved nothing and added a second place to be wrong.
Next has had middleware-bypass vulnerabilities before (CVE-2025-29927), so a
request-level gate could never have been the boundary regardless. The boundary
is `requireUser()`, inside each page, server action and route handler.

Every page redirects itself, which is why the layout does not redirect - and
therefore cannot loop with `/login`, which renders through the same layout.

### Where the session lives

The cookie carries 32 random bytes. The database stores **only the SHA-256 of
that token**. A leaked database dump therefore contains no usable sessions —
which matters here, because `pnpm export:sql:remote` exists specifically to write
database dumps to disk.

Cookie flags: `httpOnly`, `secure` in production, `sameSite=lax`, `path=/`,
30-day rolling expiry refreshed on use.

### New files

| File | Holds |
|---|---|
| `src/lib/auth.ts` | hashing, users, session create/verify/revoke, throttling, `signIn()` |
| `src/lib/session.ts` | the cookie half: `currentUser()`, `requireUser()`, `requireAdmin()` |
| `src/lib/activity.ts` | the audit trail |
| `src/app/login/page.tsx` | the sign-in screen |
| `src/app/signup/page.tsx` | open registration, maintainers only |
| `src/app/account/page.tsx` | change your own password |
| `src/app/admin/users/page.tsx` | admin-only user management |
| `src/app/auth-actions.ts` | sign in, sign out, sign up, change password, admin user actions |
| `scripts/user-add.ts` | CLI to create the first admin |
| `src/components/LoginForm.tsx` | the form; `SignupForm` and `PasswordForm` are its siblings, `FormField.tsx` the shapes all three share, `SignOut.tsx` the rail's control |
| `src/components/UserAdmin.tsx` | the people screen's three buttons, behind one action |
| `scripts/ui/auth.mjs` | browser suite for the whole sign-in flow |
| `scripts/ui/people.mjs` | browser suite for `/account` and `/admin/users` |

---

## 3. Schema

Added to `SCHEMA` in `src/lib/db.ts`, so `pushSchema()` stays the single
idempotent source of truth and `pnpm db:push` keeps working unchanged.

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL,          -- stored lowercased
  password_hash TEXT    NOT NULL,          -- scrypt: salt + params + digest
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'maintainer',  -- 'admin' | 'maintainer'
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  last_login_at TEXT,
  deleted_at    TEXT
);

-- Unique among live users only, matching the assessments pattern: a
-- deactivated account never blocks reusing the address.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_live
  ON users (email) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  token_hash   TEXT    NOT NULL,
  created_at   TEXT    NOT NULL,
  expires_at   TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL,
  revoked_at   TEXT,
  user_agent   TEXT,
  ip           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),   -- null = before auth existed
  action     TEXT    NOT NULL,               -- 'create' | 'update' | 'delete' | 'sign-in' | ...
  entity     TEXT    NOT NULL,               -- 'assessment' | 'note' | 'user'
  entity_id  INTEGER,
  detail     TEXT    NOT NULL DEFAULT '{}',  -- JSON, same convention as extras
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity (entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user   ON activity (user_id, created_at DESC);

-- Failed sign-ins, for throttling. Pruned on write.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts (email, ip, created_at DESC);
```

Plus nullable attribution columns on existing tables:

```sql
ALTER TABLE assessments ADD COLUMN created_by INTEGER REFERENCES users(id);
ALTER TABLE assessments ADD COLUMN updated_by INTEGER REFERENCES users(id);
ALTER TABLE notes       ADD COLUMN author_id  INTEGER REFERENCES users(id);
```

`ALTER TABLE` has no `IF NOT EXISTS` in SQLite, so these cannot sit in `SCHEMA`
alongside the rest — see §7.

**Attribution is two things, not one.** The FK columns answer "who last touched
this record"; the `activity` table answers "who deleted the one that is no
longer here". Columns alone cannot reconstruct history, and a log alone makes
"show me the author" a scan. Both, cheaply.

Existing rows keep `NULL`, read as *before we had accounts*. They are not
backfilled to a synthetic user — inventing an actor who did not act is worse
than admitting the gap.

---

## 4. Phases

### Phase 1 — Schema and migration path — **done**
Tables above plus `addMissingColumns()`, both driven by `pushSchema()`, so
`pnpm db:push` covers the whole migration and nothing new had to be wired up.
Nothing is enforced yet; the app behaves exactly as before.

Verified: applied twice to a scratch database (idempotent); `pnpm check` failure
set unchanged from baseline; FTS5 index correct across insert, update, inline
edit and delete after the two new `assessments` columns; and an upgrade of a
database already holding records under the old schema, which kept its data and
read `NULL` attribution.

*Tech:* libSQL, existing `scripts/register.mjs` runner.

### Phase 2 — Session core — **done**
Split across two files rather than the one originally planned, because
`scripts/user-add.ts` in Phase 5 needs `hashPassword` and a CLI cannot import a
request-scoped API:

- **`src/lib/auth.ts`** — no `next/headers`. Hashing, users, sessions,
  throttling, and `signIn()` as the single place a password is checked.
- **`src/lib/session.ts`** — the cookie half. `currentUser()` (React
  per-request cache), `requireUser()`, `requireAdmin()`, `startSession()`,
  `endSession()`.

Hashes are stored as `scrypt$N$r$p$salt$digest`, self-describing so the cost
can be raised later without invalidating existing passwords. Note that scrypt
at `N=2^15, r=8` needs exactly 32 MiB, and Node's default `maxmem` check is
`>` rather than `>=`, so the parameters are rejected unless `maxmem` is raised.

Session expiry rolls only when less than a day of life remains — extending it on
every request would mean a write, and a round trip to Mumbai, per page load.

Verified: 46 new assertions in `pnpm check` (93 passing overall, the 6 failures
unchanged from baseline), covering hashing, salting, malformed-hash handling,
email normalisation, sign-in, session resolve/revoke/expire, the raw token
never being stored, deactivation killing live sessions, and throttling.
Production build clean.

*Tech:* `node:crypto` (`scrypt`, `randomBytes`, `createHash`, `timingSafeEqual`),
React request-level cache, Next cookie API.

### Phase 3 — Enforcement — **done**
The app is now closed. `requireUser()` guards every page, all nine server
actions, and both route handlers; the two API routes answer 401 rather than
redirecting, because they answer machines.

Pulled forward from Phase 5, because a gate needs somewhere to send people and
an account to let in: `scripts/user-add.ts` (`pnpm user:add`), `/login`, the
sign-in and sign-out actions, and a sign-out control in the rail's footer.

**No proxy or middleware file.** The coarse redirect turned out to be
unnecessary: the root layout resolves the user once, and skips the rail's two
database reads when there is nobody to draw them for, so a signed-out request
costs one session lookup. Each page redirects itself, which is also why the
layout does not redirect and cannot loop with `/login`. Less to get wrong, and
the boundary stays in one kind of place.

Closed in passing: `generateMetadata` on the record and edit pages was reading
a record to build the page title, which would have named a record to a
stranger. It now declines to look.

Verified over HTTP against a built server: signed out, every page 307s to
`/login` and both APIs return 401; with a valid session cookie every page is
200 and the export returns all rows; a forged cookie is refused. Then in a real
browser via the new `scripts/ui/auth.mjs`: the redirect, the form, a wrong
password and an unknown address producing byte-identical errors, signing in,
the session carrying across pages, signing out, and the app being closed again.

### Phase 4 — Attribution and visibility — **done**
`created_by` / `updated_by` are stamped on every write, and they are now load
bearing: they *are* the visibility rule. One `Actor` (`{ id, role }`) threads
through the query layer carrying both the WHERE clause and the id to stamp, so
the two cannot drift apart.

The actor is a **required** argument on every function touching assessments.
That is the whole safety property: a missed call site is a compile error, not a
silent leak. Making it optional on `createAssessment` immediately let the paste
importer through unscoped - caught only because the omission was looked for.

Scoped: the list, every facet and flag count, the rail's absolute counts, the
location menu, analytics, CSV export, quick search, and notes - which join back
to their record rather than trusting the id they were handed. A count of records
you cannot open is still a disclosure.

Deliberately **not** scoped: `assessmentIdExists`. IDs are unique across the
whole table, so a maintainer must be told about a collision with a record they
cannot see.

Foreign keys are enforced by this driver, so an actor id must be a real user or
NULL - a placeholder id is a constraint violation. Scripts act as
`{ id: null, role: "admin" }`.

Rows created before accounts existed have `created_by` NULL, which matches no
maintainer: they are admin-only. Still not backfilled.

The `activity` table is written by `src/lib/activity.ts`, called from inside the query
layer rather than from the actions, so a new call site cannot forget it. Only
writes that actually changed a row are recorded - a maintainer aiming at a
record they cannot see leaves no trail. Successful sign-ins and sign-ups are
recorded; failed sign-ins are not, since `login_attempts` already counts those
and the trail should not fill with noise an attacker controls.

Note that the foreign key from `activity.user_id` means a user with history
cannot be hard-deleted. The app soft-deletes users, so this only bites test
fixtures - but it is the constraint doing its job: a trail must not lose its
actor.

Verified: 33 assertions in `pnpm check` covering list, direct-id read, update,
delete, inline edits, extras, notes, aggregates, rail counts, filter menus,
export and search; plus ownerless rows and global ID uniqueness. Then over HTTP
with three real sessions: two maintainers see only their own record in the list
and the CSV, a direct URL to another's record is a 404, the search API returns
nothing, and the admin sees both.

### Phase 5 — Screens and flows — **done** (begun in Phase 3)
- `/login` — server action, **deliberately vague errors** ("Email or password is
  incorrect"), so the form is not a user-enumeration oracle.
- Sign out — POST that revokes the session *row*, not merely the cookie.
- `/account` — change own password; revokes all **other** sessions on success.
  The current password is required even though the session already proves who
  you are: a borrowed, unlocked browser should not be able to lock its owner
  out. The screen also says in as many words that there is no reset email,
  which beats letting somebody hunt for the link.
- `/admin/users` — add, deactivate, reset password. Admin only, enforced
  server-side by `requireAdmin()`; the rail hides the link, which is tidiness,
  not the gate. Three buttons behind **one** server action, so there is a single
  place to report what happened - and so a generated password can be handed
  back through the same reply that renders it, exactly once. Passwords for
  other people are always generated, never typed by the admin: a typed one
  exists in two heads and probably in a chat log. Deactivation takes two
  clicks, because it signs somebody out mid-sentence and the way back is a CLI;
  the rest of the app deletes on one click, but the rest of the app soft-deletes
  rows rather than people. You cannot deactivate yourself - you might be the
  only admin.
- `pnpm user:add` — creates the first admin, following the existing `scripts/`
  and `--env-file-if-exists` pattern.
- Throttling — backoff on repeated failures per email and per IP.

*Tech:* server actions with the existing `FormState` shape and Zod schemas in
`src/lib/schema.ts`, so the auth forms behave like every other form in the app.

### Phase 6 — Tests, then deployment — **tests done**
All seven browser suites pass against a throwaway database. `pnpm test:ui`
creates an account and a session and hands each suite the token; `auth.mjs`
covers the sign-in flow itself and deliberately does not arrive with a cookie,
and `people.mjs` covers `/account` and `/admin/users` - the two screens worth
driving a browser for, since what matters about them (a generated password
shown once and never again, a wrong current password refused, no way to
deactivate yourself) is not something the data layer can answer. The mobile
suite walks both new screens too.

`pnpm check` passes against the local database. The failures noted here earlier
were assertions that assume a populated one, and `pagination page 2` was the
worst of them: it was testing the clamp rather than paging on a database too
small to have a second page, so it now brings its own rows. Five remain - three
analytics assertions, `byLocation` and one filter count - and they still fail on
an *empty* scratch database, which is how the file's own header says to run it.
They predate all of this work and have nothing to do with auth, but the fix is
the same one paging just had: bring the rows you are asserting about.

`pnpm smoke` gained the missing piece: given `--url`, it checks over real HTTP
that a signed-out page is sent to `/login` and that both API routes answer 401.
Without a URL it says so rather than letting a green run imply it.

**Deployment has not happened.** The branch is unpushed and `main` is untouched,
so the live site is still the pre-auth, publicly-readable version. The order in
section 6 matters: dump, push schema, create the admin on the remote, *then*
deploy. Creating the admin after deploying locks everyone out.

---

## 5. Pitfalls

Collected in one place because most of these are the kind that pass review and
fail in production.

**Middleware is not the boundary.** Covered above; repeated because it is the
single most common way an app like this ends up effectively open.

**Local development must not be gated into uselessness.** *Handled:* `pnpm seed`
creates `dev@kitaab.test` / `kitaab-dev`, local file only and never on
`--remote`. It is an **admin** on purpose - seeded rows are inserted by a script
and so have no `created_by`, which makes them invisible to a maintainer. A
seeded maintainer would sign in successfully to an empty app and look like a
bug.

**There is no session secret, in the end.** The plan assumed one and both
pitfalls here were about handling it. Sessions became rows with random opaque
tokens rather than signed ones, so there is nothing to pull into `.env.local`,
nothing to rotate, and no new environment variable. The `.env.local` discipline
still applies to the *database* URL, which `src/lib/db.ts` documents at length.

**`ALTER TABLE` is not idempotent in SQLite.** `SCHEMA` is built entirely from
`IF NOT EXISTS` statements and is re-run freely. The three attribution columns
cannot follow that pattern and need a migration that checks `PRAGMA table_info`
first — otherwise the second `pnpm db:push` fails.

**The FTS5 triggers are tied to the `assessments` column list.** Adding columns
is safe because the triggers name their columns explicitly, but this is worth
re-reading before touching that table; a careless `SELECT *` in a trigger would
break the index.

**Scrypt is deliberately slow, and serverless functions are billed by time.** Sign-in
will be noticeably slower than any other request. That is the point of a KDF.
Tune the cost parameters once, on the deployment's actual hardware — not on the
laptop, where they will look cheap.

**Timing.** Compare digests with `timingSafeEqual`, and run the hash even when
the email does not exist, so a missing account and a wrong password take the
same time. Otherwise the vague error message in §4 is undone by a stopwatch.

**Serverless has no shared memory.** Any throttling counter must live in the
database; an in-process map resets on every cold start and counts nothing.

**Turso is in Mumbai and so are the functions** — deliberately, per the
deployment runbook. Auth adds a session lookup to *every* request, so keep the
`currentUser()` request-cache honest: an accidental second call is a second
round trip on every page.

**Soft delete is the house convention.** Deactivating a user sets `deleted_at`
and must also revoke their live sessions, or they stay signed in until the
cookie expires.

---

## 6. Test and deployment impact

**Tests.** *Done.* `pnpm e2e` and `pnpm test:ui` drove a real browser from an
unauthenticated start and all failed the moment Phase 3 landed, exactly as
budgeted. `scripts/ui/make-session.ts` now creates the account and the session
and hands every suite the token.

`pnpm smoke` and `pnpm smoke:remote` go through the data layer rather than HTTP,
so they kept passing — which is its own hazard, since a green smoke test would
no longer tell you the app rejects anonymous traffic. *Closed:* pass `--url` and
it checks over HTTP that a signed-out page is redirected to `/login` and that
`/api/search` and `/api/export` answer 401. With no URL it prints a line saying
that nothing checked it, rather than staying quiet.

**Deployment order.**

1. `pnpm export:sql:remote` first. The changes are additive and safe; take the
   rollback anyway.
2. `pnpm db:push:remote`. It carries the `ALTER` migration with it —
   `addMissingColumns()` runs inside `pushSchema()`, so this is one command
   rather than two.
3. `KITAAB_USE_REMOTE=1 pnpm user:add you@example.com "Your Name" --admin`, to
   create the first admin — **before** the deployment that closes the app, or
   nobody can get in. Sign-up would only make a maintainer, and a maintainer
   sees none of the records that were copied up.
4. Deploy.
5. `pnpm smoke:remote --url https://<the deployment>`, which now covers both
   halves: the data layer, and a signed-out request being turned away.

Remote schema is never pushed implicitly — `ensureSchema()` skips non-file
targets by design — so steps 2 and 3 are deliberate and manual.

**No new environment variable.** The plan assumed a session secret; sessions
ended up as rows with random tokens, so there is nothing to add to `.env.example`
or to Vercel. No configuration changes at all.

---

## 7. Open questions

These are settled now; kept because the answers are the reasoning.

**Next 16 API mechanics.** *Answered by building it.* No request-interception
file exists at all — the boundary is `requireUser()` per page, action and route
handler. The cookie API is async (`await cookies()`), and route handlers are
dynamic by the act of reading one.

**Roles.** Resolved as `admin` and **`maintainer`**, not `member` — the word
changed with the meaning. Role does not only gate user management: it *is* the
visibility rule, carried by `Actor` through the whole query layer. Rows written
under the old name are renamed by `pushSchema()`, since a role matching neither
branch of the union would be worse than either.

**Session lifetime.** 30 days rolling, as assumed, refreshed only inside the
last day so a page load is not a write. Still one constant
(`SESSION_TTL_DAYS`) if this data wants shorter.

---

## 8. Explicitly out of scope

Not refusals — later work, listed so the boundary is on paper:

- self-service password reset by email (needs a mail provider and token table)
- two-factor authentication
- SSO / OAuth
- a signed-in-devices screen (the `sessions` columns are there for it)
- per-record or per-location permissions
- an in-app activity feed — Phase 4 writes the log; reading it back is separate

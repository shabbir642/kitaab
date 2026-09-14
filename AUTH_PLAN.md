# Kitaab — authentication plan

Status: **Phases 1-3 done** - the app is closed. Written 14 September 2026.

Kitaab holds assessment records describing real people. Locally the app binds to
`127.0.0.1` precisely so it is unreachable, and the README says in as many words
that this must not change without authentication first. The Vercel deployment is
a public URL, so that promise currently holds on the laptop and not on the
internet. This document is the plan for closing that gap.

Scope: email and password sign-in, a real users table, and activity attributed
to the person who caused it.

---

## 1. Decisions, and what was turned down

| Decision | Choice | Why not the alternative |
|---|---|---|
| Identity | email + password | Asked for. A shared passphrase cannot attribute an edit to anyone. |
| Password hashing | **`node:crypto` scrypt** | `argon2` is a better KDF, but every good implementation is a native module. `@libsql/client` already forced `serverExternalPackages` in `next.config.ts`; a second prebuilt binary in the bundle path is a known cost for a marginal gain at this scale. scrypt is in Node, tuned by parameters, and has no build story. |
| Session | **opaque token in a `sessions` table** | A signed JWT is stateless and cannot be revoked without inventing a deny-list — which is a sessions table with extra steps. There is already a database one query away. |
| Signup | **closed; users are created by an admin** | Open registration on a public URL means anyone who finds the link reads every record. Invite-by-admin is the correct shape for a small known team. |
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
| `src/app/login/page.tsx` | the sign-in screen |
| `src/app/account/page.tsx` | change your own password |
| `src/app/admin/users/page.tsx` | admin-only user management |
| `src/app/auth-actions.ts` | sign in, sign out, change password, admin user actions |
| `scripts/user-add.ts` | CLI to create the first admin |
| `src/components/LoginForm.tsx` | the form; `SignOut.tsx` is the rail's control |
| `scripts/ui/auth.mjs` | browser suite for the whole sign-in flow |

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
  role          TEXT    NOT NULL DEFAULT 'member',   -- 'admin' | 'member'
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

### Phase 4 — Attribution
Thread the current user into the mutating helpers in `src/lib/queries.ts`; write
`activity` rows. Surface the author on notes first, since notes are already
presented as a running commentary and have an obvious place to put a name.

### Phase 5 — Screens and flows (partly done in Phase 3)
- `/login` — server action, **deliberately vague errors** ("Email or password is
  incorrect"), so the form is not a user-enumeration oracle.
- Sign out — POST that revokes the session *row*, not merely the cookie.
- `/account` — change own password; revokes all **other** sessions on success.
- `/admin/users` — add, deactivate, reset password. Admin only, enforced
  server-side, not by hiding the link.
- `pnpm user:add` — creates the first admin, following the existing `scripts/`
  and `--env-file-if-exists` pattern.
- Throttling — backoff on repeated failures per email and per IP.

*Tech:* server actions with the existing `FormState` shape and Zod schemas in
`src/lib/schema.ts`, so the auth forms behave like every other form in the app.

### Phase 6 — Tests, then deployment
See §6.

**Sequencing.** 1 and 2 are independent groundwork and can land quietly. 3 is the
one-way door. 4 and 5 can proceed in parallel. Rough size: 1–3 is the core day,
4–5 a second, 6 half a day of unglamorous repair.

---

## 5. Pitfalls

Collected in one place because most of these are the kind that pass review and
fail in production.

**Middleware is not the boundary.** Covered above; repeated because it is the
single most common way an app like this ends up effectively open.

**Local development must not be gated into uselessness.** Sign-in needs a user,
and `data/app.db` is untracked and recreated on demand. `pnpm seed` must create a
known development user, or the first `pnpm dev` after this lands is a login
screen nobody can get past.

**The `.env.local` trap applies to the session secret too.** `src/lib/db.ts`
documents at length how `vercel env pull` nearly pointed local development at
live data. A session secret pulled the same way is less dangerous but wants the
same discipline: separate values local and deployed, never the production secret
in a dev shell.

**Rotating the session secret signs everybody out.** Fine, but it should be a
decision rather than a surprise during an unrelated deployment.

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

**Tests.** `pnpm e2e` and `pnpm test:ui` drive a real browser from an
unauthenticated start and will **all fail** the moment Phase 3 lands. They need a
seeded test user and a programmatic sign-in helper before the flows they actually
exercise. Budget this as part of Phase 3, not as cleanup.

`pnpm smoke` and `pnpm smoke:remote` go through the data layer rather than HTTP,
so they keep passing — which is its own hazard, since a green smoke test would no
longer tell you the app rejects anonymous traffic. Add an assertion that an
unauthenticated HTTP request is turned away.

**Deployment order.**

1. `pnpm export:sql:remote` first. The changes are additive and safe; take the
   rollback anyway.
2. Add the session secret to Vercel's environment.
3. `pnpm db:push:remote`, then the `ALTER` migration against the remote.
4. `pnpm user:add` against the remote to create the first admin — before the
   deployment that closes the app, or nobody can get in.
5. Deploy.
6. `pnpm smoke:remote`, and confirm by hand that a signed-out browser is
   redirected.

Remote schema is never pushed implicitly — `ensureSchema()` skips non-file
targets by design — so steps 3 and 4 are deliberate and manual.

New environment variable: a session secret, added to `.env.example` and to
Vercel. No other configuration changes.

---

## 7. Open questions

**Next 16 API mechanics.** Auth lands squarely on the APIs this version changed:
the request-interception file's name and runtime, the cookie API's shape, and
route-handler defaults. The architecture above does not depend on the answers,
but the implementation does, so confirm each against the existing code or the
published docs rather than assuming the older conventions.

**Roles.** `admin` and `member` are assumed. If every member may edit everything,
`role` only gates user management — which is fine, and leaves room later.

**Session lifetime.** 30 days rolling is assumed. Shorter is safer for data this
sensitive; it is one constant.

---

## 8. Explicitly out of scope

Not refusals — later work, listed so the boundary is on paper:

- self-service password reset by email (needs a mail provider and token table)
- two-factor authentication
- SSO / OAuth
- a signed-in-devices screen (the `sessions` columns are there for it)
- per-record or per-location permissions
- an in-app activity feed — Phase 4 writes the log; reading it back is separate

import { createClient, type Client, type InValue, type ResultSet } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

/* ---------------------------------------------------------------------------
   Data store.

   One client, two homes:
     local dev  -> no database URL set, so a plain SQLite file under data/
     deployed   -> a libsql:// URL plus a token (Turso)

   Turso is libSQL, which is SQLite, so every statement in queries.ts is the
   same in both places - including the FTS5 index.

   TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are what Turso's Vercel integration
   injects, and they are read directly rather than copied into our own names:
   duplicated secrets go stale the first time the integration rotates one.

   But `vercel env pull` writes those same names into .env.local, which Next
   loads for `pnpm dev` too - so simply honouring them would silently point
   local development at live data. They therefore only apply in production, or
   when something asks for them on purpose:

     KITAAB_DB_URL=...          an explicit target, always wins
     KITAAB_USE_REMOTE=1        opt in to the injected Turso vars locally
     NODE_ENV=production        a deployment, where they are the point
--------------------------------------------------------------------------- */

const LOCAL_FILE = path.join(process.cwd(), "data", "app.db");

const IS_DEPLOYED = process.env.NODE_ENV === "production";
const WANTS_REMOTE = IS_DEPLOYED || process.env.KITAAB_USE_REMOTE === "1";

const REMOTE_URL =
  process.env.KITAAB_DB_URL ?? (WANTS_REMOTE ? process.env.TURSO_DATABASE_URL : undefined);
const AUTH_TOKEN = process.env.KITAAB_DB_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

export const DB_URL = REMOTE_URL ?? `file:${LOCAL_FILE}`;
export const IS_LOCAL_FILE = DB_URL.startsWith("file:");

/** Short, safe description of the target - never includes the token. */
export function describeTarget(): string {
  if (IS_LOCAL_FILE) return `local file ${DB_URL.slice("file:".length)}`;
  try {
    return `remote ${new URL(DB_URL).host}`;
  } catch {
    return "remote database";
  }
}

function open(): Client {
  if (IS_LOCAL_FILE) {
    fs.mkdirSync(path.dirname(DB_URL.slice("file:".length)), { recursive: true });
  } else if (process.env.NODE_ENV !== "production") {
    // Pulling Vercel's env down for local work silently repoints dev at live
    // data, so say so rather than letting it pass unnoticed.
    console.warn(`\n  ⚠ Kitaab is using a ${describeTarget()} — not your local file.\n`);
  }
  return createClient({
    url: DB_URL,
    authToken: AUTH_TOKEN,
    // Pin integers to JS numbers so row shapes are the same in both homes.
    intMode: "number",
  });
}

// Survive dev-server hot reloads without leaking connections.
const globalForDb = globalThis as unknown as {
  __kitaabClient?: Client;
  __kitaabSchema?: Promise<void>;
};

export const db: Client = globalForDb.__kitaabClient ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__kitaabClient = db;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS assessments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id     TEXT    NOT NULL,
  name              TEXT    NOT NULL,
  location          TEXT,
  assessor          TEXT,
  survey_date       TEXT,
  survey_status     TEXT,
  completion_date   TEXT,
  completion_status TEXT,
  remarks           TEXT,
  origin            TEXT    NOT NULL DEFAULT 'manual',
  extras            TEXT    NOT NULL DEFAULT '{}',
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  deleted_at        TEXT
);

-- Assessment IDs are unique among live records only, so a soft-deleted row
-- never blocks re-entering the same ID.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_aid_live
  ON assessments (assessment_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assessments_survey_date     ON assessments (survey_date);
CREATE INDEX IF NOT EXISTS idx_assessments_completion_date ON assessments (completion_date);
CREATE INDEX IF NOT EXISTS idx_assessments_survey_status   ON assessments (survey_status);
CREATE INDEX IF NOT EXISTS idx_assessments_comp_status     ON assessments (completion_status);
CREATE INDEX IF NOT EXISTS idx_assessments_location        ON assessments (location);
CREATE INDEX IF NOT EXISTS idx_assessments_deleted         ON assessments (deleted_at);

-- Notes are the record's running commentary: append-only in spirit, soft
-- deleted like everything else, and always read newest first.
CREATE TABLE IF NOT EXISTS notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  body          TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  deleted_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_notes_assessment
  ON notes (assessment_id, created_at DESC);

/* ---------------------------------------------------------------------------
   Accounts and attribution. See AUTH_PLAN.md.
--------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'member',
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  last_login_at TEXT,
  deleted_at    TEXT
);

-- Live users only, matching the assessments pattern: a deactivated account
-- never blocks reusing the address. Emails are stored lowercased so this index
-- is the uniqueness rule, rather than merely a fast path to it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_live
  ON users (email) WHERE deleted_at IS NULL;

-- Sessions are rows rather than signed tokens so that they can be revoked.
-- token_hash holds the SHA-256 of the cookie's value, never the value itself:
-- export:sql writes this table to a file, and a dump should not be a set of
-- working credentials.
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
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id, expires_at);

-- The audit trail. The created_by/updated_by columns say who a record belongs
-- to now; this says who did what, including to records that no longer exist.
-- user_id is nullable: rows written before accounts existed have no actor, and
-- inventing one would be worse than admitting the gap.
CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT    NOT NULL,
  entity     TEXT    NOT NULL,
  entity_id  INTEGER,
  detail     TEXT    NOT NULL DEFAULT '{}',
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_entity
  ON activity (entity, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user
  ON activity (user_id, created_at DESC);

-- Failed sign-ins, for throttling. A serverless deployment has no shared
-- memory, so the counter has to live here or it counts nothing.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts
  ON login_attempts (email, ip, created_at DESC);

-- Keyword search. External-content FTS5 index: no duplicated storage, kept in
-- sync by the triggers below.
CREATE VIRTUAL TABLE IF NOT EXISTS assessments_fts USING fts5(
  assessment_id, name, location, assessor, remarks,
  content='assessments', content_rowid='id', tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS assessments_ai AFTER INSERT ON assessments BEGIN
  INSERT INTO assessments_fts(rowid, assessment_id, name, location, assessor, remarks)
  VALUES (new.id, new.assessment_id, new.name, new.location, new.assessor, new.remarks);
END;

CREATE TRIGGER IF NOT EXISTS assessments_ad AFTER DELETE ON assessments BEGIN
  INSERT INTO assessments_fts(assessments_fts, rowid, assessment_id, name, location, assessor, remarks)
  VALUES ('delete', old.id, old.assessment_id, old.name, old.location, old.assessor, old.remarks);
END;

CREATE TRIGGER IF NOT EXISTS assessments_au AFTER UPDATE ON assessments BEGIN
  INSERT INTO assessments_fts(assessments_fts, rowid, assessment_id, name, location, assessor, remarks)
  VALUES ('delete', old.id, old.assessment_id, old.name, old.location, old.assessor, old.remarks);
  INSERT INTO assessments_fts(rowid, assessment_id, name, location, assessor, remarks)
  VALUES (new.id, new.assessment_id, new.name, new.location, new.assessor, new.remarks);
END;
`;

/* Columns added to tables that predate them. SQLite has no
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so these cannot live in SCHEMA
   with everything else and are checked against PRAGMA table_info instead.

   All three are nullable on purpose. Records created before there were accounts
   have no author, and NULL says exactly that. */
const ADDED_COLUMNS: ReadonlyArray<{ table: string; column: string; type: string }> = [
  { table: "assessments", column: "created_by", type: "INTEGER REFERENCES users(id)" },
  { table: "assessments", column: "updated_by", type: "INTEGER REFERENCES users(id)" },
  { table: "notes", column: "author_id", type: "INTEGER REFERENCES users(id)" },
];

async function addMissingColumns(): Promise<void> {
  for (const { table, column, type } of ADDED_COLUMNS) {
    // db.execute directly, never all(): all() awaits ensureSchema, which is
    // itself awaiting this function, and the two would deadlock.
    const info = await db.execute(`PRAGMA table_info(${table})`);
    const nameAt = info.columns.indexOf("name");
    if (info.rows.some((row) => row[nameAt] === column)) continue;
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Applies the schema. Idempotent - every CREATE is IF NOT EXISTS, and every
 *  added column is checked for before it is added. */
export async function pushSchema(): Promise<void> {
  await db.executeMultiple(SCHEMA);
  await addMissingColumns();
}

/** A local file is created and migrated on demand, which keeps `pnpm dev`
 *  zero-setup. A remote database is not touched implicitly: run
 *  `pnpm db:push` against it deliberately. */
function ensureSchema(): Promise<void> {
  if (!IS_LOCAL_FILE) return Promise.resolve();
  globalForDb.__kitaabSchema ??= pushSchema();
  return globalForDb.__kitaabSchema;
}

/* ---------------------------------------------------------------------------
   Query helpers

   libSQL hands back a column list plus positional rows; these rebuild plain
   objects from it so the rest of the app never sees the driver's row type.
--------------------------------------------------------------------------- */

function toObjects<T>(rs: ResultSet): T[] {
  return rs.rows.map((row) => {
    const out: Record<string, unknown> = {};
    rs.columns.forEach((column, i) => {
      out[column] = row[i];
    });
    return out as T;
  });
}

export async function all<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  await ensureSchema();
  return toObjects<T>(await db.execute({ sql, args }));
}

export async function first<T>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

export async function run(
  sql: string,
  args: InValue[] = [],
): Promise<{ changes: number; lastInsertRowid: number }> {
  await ensureSchema();
  const rs = await db.execute({ sql, args });
  return {
    changes: Number(rs.rowsAffected ?? 0),
    lastInsertRowid: Number(rs.lastInsertRowid ?? 0),
  };
}

export type { InValue };

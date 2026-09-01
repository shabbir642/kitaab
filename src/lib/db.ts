import { createClient, type Client, type InValue, type ResultSet } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

/* ---------------------------------------------------------------------------
   Data store.

   One client, two homes:
     local dev  -> KITAAB_DB_URL unset, so a plain SQLite file under data/
     deployed   -> KITAAB_DB_URL=libsql://... plus KITAAB_DB_TOKEN (Turso)

   Turso is libSQL, which is SQLite, so every statement in queries.ts is the
   same in both places - including the FTS5 index.
--------------------------------------------------------------------------- */

const LOCAL_FILE = path.join(process.cwd(), "data", "app.db");

export const DB_URL = process.env.KITAAB_DB_URL ?? `file:${LOCAL_FILE}`;
export const IS_LOCAL_FILE = DB_URL.startsWith("file:");

function open(): Client {
  if (IS_LOCAL_FILE) {
    fs.mkdirSync(path.dirname(DB_URL.slice("file:".length)), { recursive: true });
  }
  return createClient({
    url: DB_URL,
    authToken: process.env.KITAAB_DB_TOKEN,
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

/** Applies the schema. Idempotent - every statement is IF NOT EXISTS. */
export async function pushSchema(): Promise<void> {
  await db.executeMultiple(SCHEMA);
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

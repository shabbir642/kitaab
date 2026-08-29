import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue, StatementSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/* ---------------------------------------------------------------------------
   Local SQLite store.

   Uses Node's built-in `node:sqlite` - no native build step, no daemon, no
   Docker. The whole dataset is one file you can copy to back up.
--------------------------------------------------------------------------- */

export const DB_PATH =
  process.env.KITAAB_DB_PATH ?? path.join(process.cwd(), "data", "app.db");

const SCHEMA = `
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

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

// Survive dev-server hot reloads without leaking connections.
const globalForDb = globalThis as unknown as { __kitaabDb?: DatabaseSync };

export const db: DatabaseSync = globalForDb.__kitaabDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__kitaabDb = db;

/** node:sqlite returns null-prototype objects; spread them so React/JSON and
 *  property access behave normally. */
export function rows<T>(stmt: StatementSync, ...args: SQLInputValue[]): T[] {
  return stmt.all(...args).map((r) => ({ ...r })) as T[];
}

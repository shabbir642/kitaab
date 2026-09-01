/**
 * Copies the local database up to whatever the environment points at.
 *
 *   pnpm copy-up            # dry run: says what it would copy where
 *   pnpm copy-up --yes
 *   pnpm copy-up --yes --replace     # wipe the destination first
 *
 * Reads the destination from TURSO_DATABASE_URL / TURSO_AUTH_TOKEN (what
 * Turso's Vercel integration injects) or KITAAB_DB_URL / KITAAB_DB_TOKEN.
 * Row ids are preserved so existing links to a record keep working.
 */
import { createClient } from "@libsql/client";
import path from "node:path";
import { SCHEMA } from "../src/lib/db.ts";

const args = process.argv.slice(2);
const CONFIRMED = args.includes("--yes");
const REPLACE = args.includes("--replace");

const SOURCE_URL = `file:${path.join(process.cwd(), "data", "app.db")}`;
const DEST_URL = process.env.KITAAB_DB_URL ?? process.env.TURSO_DATABASE_URL;

if (!DEST_URL) {
  console.error(
    "No destination set. Point TURSO_DATABASE_URL (or KITAAB_DB_URL) at the\n" +
      "database to copy into - a .env.local file is the usual place.\n",
  );
  process.exit(1);
}
if (DEST_URL === SOURCE_URL) {
  console.error("Source and destination are the same database.\n");
  process.exit(1);
}

/** Safe to print - never the token. */
const describeDest = () => {
  if (DEST_URL.startsWith("file:")) return `local file ${DEST_URL.slice("file:".length)}`;
  try {
    return `remote ${new URL(DEST_URL).host}`;
  } catch {
    return "remote database";
  }
};

const source = createClient({ url: SOURCE_URL, intMode: "number" });
const dest = createClient({
  url: DEST_URL,
  authToken: process.env.KITAAB_DB_TOKEN ?? process.env.TURSO_AUTH_TOKEN,
  intMode: "number",
});

const count = async (c: typeof source, table: string) =>
  Number((await c.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);

await dest.executeMultiple(SCHEMA);

const srcAssessments = await count(source, "assessments");
const srcNotes = await count(source, "notes");
const dstAssessments = await count(dest, "assessments");
const dstNotes = await count(dest, "notes");

console.log(`from  local file  ${srcAssessments} assessments, ${srcNotes} notes`);
console.log(`to    ${describeDest()}  ${dstAssessments} assessments, ${dstNotes} notes`);

if (dstAssessments > 0 && !REPLACE) {
  console.error(
    `\nThe destination already holds ${dstAssessments} records. Pass --replace to\n` +
      `overwrite them, or clear it yourself first.\n`,
  );
  process.exit(1);
}

if (!CONFIRMED) {
  console.log("\ndry run - nothing written. Re-run with --yes to copy.");
  process.exit(0);
}

if (REPLACE) {
  await dest.execute("DELETE FROM notes");
  await dest.execute("DELETE FROM assessments");
}

const CHUNK = 50;
const copy = async (table: string, columns: string[]) => {
  const rows = (await source.execute(`SELECT ${columns.join(", ")} FROM ${table}`)).rows;
  const sql =
    `INSERT INTO ${table} (${columns.join(", ")}) ` +
    `VALUES (${columns.map(() => "?").join(", ")})`;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await dest.batch(
      rows.slice(i, i + CHUNK).map((row) => ({
        sql,
        args: columns.map((_, c) => row[c]),
      })),
      "write",
    );
  }
  return rows.length;
};

const assessments = await copy("assessments", [
  "id", "assessment_id", "name", "location", "assessor", "survey_date",
  "survey_status", "completion_date", "completion_status", "remarks", "origin",
  "extras", "created_at", "updated_at", "deleted_at",
]);
const notes = await copy("notes", ["id", "assessment_id", "body", "created_at", "deleted_at"]);

// The triggers keep FTS in step for live writes, but rows inserted here arrive
// with their ids already set, so rebuild rather than trust the trigger output.
await dest.execute("INSERT INTO assessments_fts(assessments_fts) VALUES ('rebuild')");

console.log(`\ncopied ${assessments} assessments and ${notes} notes`);
console.log(`destination now holds ${await count(dest, "assessments")} assessments`);
console.log(`fts rows: ${await count(dest, "assessments_fts")}`);

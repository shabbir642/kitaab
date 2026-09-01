/**
 * Dumps a database to a replayable .sql file. Works against Turso without the
 * Turso CLI, because it goes through the same client the app uses.
 *
 *   pnpm export:sql            # whatever the environment resolves to
 *   pnpm export:sql:remote     # the deployment's database
 *   pnpm export:sql --out backups/before-migration.sql
 *
 * The output is ordinary SQL: schema, then data, then the FTS index rebuilt
 * from it. Replay it with `pnpm restore:sql`, the sqlite3 CLI, or
 * `turso db shell <db> < file.sql`.
 */
import fs from "node:fs";
import path from "node:path";
import { all, db, describeTarget, IS_LOCAL_FILE } from "../src/lib/db.ts";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");

type Obj = { type: string; name: string; sql: string | null };

const objects = await all<Obj>(
  `SELECT type, name, sql FROM sqlite_master
   WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
   ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`,
);

// FTS5 keeps its own shadow tables (…_data, …_idx, …_docsize, …_config). They
// are recreated by CREATE VIRTUAL TABLE, so dumping them would both bloat the
// file and conflict on replay.
const virtualTables = objects
  .filter((o) => o.sql?.toUpperCase().startsWith("CREATE VIRTUAL TABLE"))
  .map((o) => o.name);
const isShadow = (name: string) => virtualTables.some((vt) => name.startsWith(`${vt}_`));

const realTables = objects.filter(
  (o) => o.type === "table" && !virtualTables.includes(o.name) && !isShadow(o.name),
);
const indexes = objects.filter((o) => o.type === "index" && !isShadow(o.name));
const triggers = objects.filter((o) => o.type === "trigger");

/** SQL literal for a value the driver handed back. */
function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
    const bytes = v instanceof Uint8Array ? v : new Uint8Array(v);
    return `X'${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

const lines: string[] = [
  `-- Kitaab dump`,
  `-- source: ${describeTarget()}`,
  `-- taken:  ${new Date().toISOString()}`,
  ``,
  `PRAGMA foreign_keys = OFF;`,
  `BEGIN TRANSACTION;`,
  ``,
];

// 1. real tables
for (const t of realTables) lines.push(`${t.sql};`);
lines.push("");

// 2. their rows
let rowTotal = 0;
for (const t of realTables) {
  const rs = await db.execute(`SELECT * FROM "${t.name}"`);
  if (rs.rows.length === 0) continue;
  const cols = rs.columns.map((c) => `"${c}"`).join(", ");
  lines.push(`-- ${t.name}: ${rs.rows.length} rows`);
  for (const row of rs.rows) {
    const values = rs.columns.map((_, i) => literal(row[i])).join(", ");
    lines.push(`INSERT INTO "${t.name}" (${cols}) VALUES (${values});`);
  }
  lines.push("");
  rowTotal += rs.rows.length;
}

// 3. the FTS table, then indexes, then triggers — triggers last so the inserts
//    above do not fire them and double-populate the index.
for (const v of objects.filter((o) => virtualTables.includes(o.name))) lines.push(`${v.sql};`);
for (const i of indexes) lines.push(`${i.sql};`);
for (const t of triggers) lines.push(`${t.sql};`);
lines.push("");

for (const vt of virtualTables) {
  lines.push(`INSERT INTO ${vt}(${vt}) VALUES ('rebuild');`);
}

lines.push("", `COMMIT;`, `PRAGMA foreign_keys = ON;`, "");

const dir = process.env.KITAAB_BACKUP_DIR ?? path.join(process.cwd(), "backups");
fs.mkdirSync(dir, { recursive: true });

const label = IS_LOCAL_FILE ? "local" : "turso";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out =
  outIdx >= 0 && args[outIdx + 1]
    ? args[outIdx + 1]
    : path.join(dir, `kitaab-${label}-${stamp}.sql`);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join("\n"));

const size = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`dumped ${describeTarget()}`);
console.log(`  ${realTables.length} tables, ${rowTotal} rows, ${indexes.length} indexes, ${triggers.length} triggers`);
console.log(`  -> ${out} (${size} KB)`);

/**
 * Replays a dump from `pnpm export:sql` into a database.
 *
 *   pnpm restore:sql backups/kitaab-turso-….sql --into file:/tmp/check.db
 *   KITAAB_DB_URL=libsql://… KITAAB_DB_TOKEN=… pnpm restore:sql <file> --yes
 *
 * Dry-runs unless passed --yes, and refuses a destination that already holds
 * tables unless passed --replace. There is no undo, so the destination has to
 * be named explicitly - it is never inferred from NODE_ENV.
 */
import fs from "node:fs";
import { createClient } from "@libsql/client";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const CONFIRMED = args.includes("--yes");
const REPLACE = args.includes("--replace");
const intoIdx = args.indexOf("--into");

const target =
  (intoIdx >= 0 ? args[intoIdx + 1] : undefined) ??
  process.env.KITAAB_DB_URL ??
  process.env.TURSO_DATABASE_URL;

if (!file || !fs.existsSync(file)) {
  console.error(`Usage: pnpm restore:sql <dump.sql> --into <url> [--yes] [--replace]\n`);
  process.exit(1);
}
if (!target) {
  console.error(
    "No destination. Pass --into <url>, or set KITAAB_DB_URL.\n" +
      "It is never taken from NODE_ENV: a restore is not something to do by accident.\n",
  );
  process.exit(1);
}

const describe = target.startsWith("file:")
  ? `local file ${target.slice("file:".length)}`
  : `remote ${new URL(target).host}`;

const client = createClient({
  url: target,
  authToken: process.env.KITAAB_DB_TOKEN ?? process.env.TURSO_AUTH_TOKEN,
  intMode: "number",
});

const existing = await client.execute(
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
);

const sql = fs.readFileSync(file, "utf8");
const inserts = (sql.match(/^INSERT INTO/gm) ?? []).length;
const source = sql.match(/^-- source: (.*)$/m)?.[1] ?? "unknown";
const taken = sql.match(/^-- taken:\s+(.*)$/m)?.[1] ?? "unknown";

console.log(`dump   ${file}`);
console.log(`       from ${source}, taken ${taken}`);
console.log(`       ${inserts} rows`);
console.log(`into   ${describe} (${existing.rows.length} tables present)`);

if (existing.rows.length > 0 && !REPLACE) {
  console.error(
    `\nThe destination already has tables. Pass --replace to drop them first.\n`,
  );
  process.exit(1);
}

if (!CONFIRMED) {
  console.log("\ndry run - nothing written. Re-run with --yes to restore.");
  process.exit(0);
}

if (REPLACE) {
  // Triggers first, then virtual tables (which take their shadow tables with
  // them), then whatever is left.
  for (const t of (await client.execute(`SELECT name FROM sqlite_master WHERE type='trigger'`)).rows) {
    await client.execute(`DROP TRIGGER IF EXISTS "${t.name}"`);
  }
  const tables = (
    await client.execute(
      `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )
  ).rows;
  for (const t of tables.filter((r) => String(r.sql ?? "").toUpperCase().includes("VIRTUAL TABLE"))) {
    await client.execute(`DROP TABLE IF EXISTS "${t.name}"`);
  }
  for (const t of (
    await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )
  ).rows) {
    await client.execute(`DROP TABLE IF EXISTS "${t.name}"`);
  }
}

await client.executeMultiple(sql);

const after = await client.execute(`SELECT COUNT(*) AS n FROM assessments`);
console.log(`\nrestored - ${after.rows[0].n} assessments in ${describe}`);

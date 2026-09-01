/**
 * Snapshots the database into backups/.
 *
 *   pnpm backup
 *
 * A local file is snapshotted with VACUUM INTO, which runs inside a
 * transaction and is therefore safe while the app is serving - unlike copying
 * the file by hand with WAL enabled.
 *
 * A hosted (Turso) database is not something this script can pull down: use
 * Turso's own tooling, which knows how to stream it.
 *
 *   turso db shell <database> .dump > backups/kitaab-$(date +%F).sql
 */
import fs from "node:fs";
import path from "node:path";
import { DB_URL, IS_LOCAL_FILE, run } from "../src/lib/db.ts";

if (!IS_LOCAL_FILE) {
  console.error(
    `KITAAB_DB_URL points at ${DB_URL}, which this script cannot snapshot.\n` +
      `Use Turso's own dump instead:\n\n` +
      `  turso db shell <database> .dump > backups/kitaab-$(date +%F).sql\n`,
  );
  process.exit(1);
}

const dir = process.env.KITAAB_BACKUP_DIR ?? path.join(process.cwd(), "backups");
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = path.join(dir, `app-${stamp}.db`);

await run("VACUUM INTO ?", [out]);

const size = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`backed up ${DB_URL}\n        -> ${out} (${size} KB)`);

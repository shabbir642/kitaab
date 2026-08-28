/**
 * Writes a consistent snapshot of the database to backups/.
 *
 *   pnpm backup
 *
 * VACUUM INTO takes the snapshot inside a transaction, so it is safe to run
 * while the app is serving - unlike copying the file by hand with WAL enabled.
 */
import fs from "node:fs";
import path from "node:path";
import { db, DB_PATH } from "../src/lib/db.ts";

const dir = process.env.FDK_BACKUP_DIR ?? path.join(process.cwd(), "backups");
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = path.join(dir, `app-${stamp}.db`);

db.prepare("VACUUM INTO ?").run(out);

const size = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`backed up ${DB_PATH}\n        -> ${out} (${size} KB)`);

/**
 * Applies the schema to whatever KITAAB_DB_URL points at.
 *
 *   pnpm db:push                                   # the local file
 *   KITAAB_DB_URL=libsql://... KITAAB_DB_TOKEN=... pnpm db:push
 *
 * Every statement is CREATE ... IF NOT EXISTS, so this is safe to re-run.
 * A local file migrates itself on first query; a hosted database does not,
 * deliberately - you point this at production on purpose.
 */
import { DB_URL, pushSchema } from "../src/lib/db.ts";

await pushSchema();
console.log(`schema applied to ${DB_URL}`);

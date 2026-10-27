/**
 * Applies the schema to a deployment's database, as part of its build.
 *
 * Chained into `pnpm build`, so Vercel runs it before the new code ever serves
 * a request. Locally it does nothing: a local file migrates itself on demand,
 * so `pnpm build` on a laptop is unchanged.
 *
 *   pnpm build                       migrates only on a production deployment
 *   KITAAB_MIGRATE=1 pnpm build      force it - a preview, or by hand
 *
 * Exits non-zero if the migration fails or leaves anything missing, which
 * fails the build. That is the point of it: a deployment that cannot get its
 * schema right must not replace a working one. The alternative is what
 * happened before this existed - a green deploy serving 500s on every page,
 * because the code expected tables nobody had created.
 *
 * See `shouldMigrateOnBuild` in src/lib/db.ts for why this is build time and
 * not request time.
 *
 * ---------------------------------------------------------------------------
 * This script deliberately does NOT load .env.local. Do not add
 * `--env-file-if-exists` to it.
 *
 * `vercel env pull` writes VERCEL=1 and VERCEL_ENV=production into that file,
 * next to the Turso credentials. Loading it would make every laptop claim to
 * be a production deployment, and `pnpm build` on any developer's machine
 * would migrate the live database. It is the same trap src/lib/db.ts
 * documents for the database URL, wearing a different hat.
 *
 * On Vercel the real environment carries everything this needs. Off Vercel
 * there are no Turso variables, so the target is the local file and this
 * exits having done nothing. Migrating a remote by hand is still
 * `pnpm db:push:remote`, which loads .env.local on purpose, because a person
 * typed `:remote`.
 * ---------------------------------------------------------------------------
 */
import { describeTarget, pushSchema, shouldMigrateOnBuild, verifySchema } from "../src/lib/db.ts";

const { run, why } = shouldMigrateOnBuild();

if (!run) {
  console.log(`migrate: skipped - ${why}`);
  process.exit(0);
}

console.log(`migrate: applying the schema to ${describeTarget()} (${why})`);

try {
  await pushSchema();
} catch (err) {
  console.error(`migrate: FAILED - ${(err as Error).message}`);
  process.exit(1);
}

// Applying it is not the same as it being right. A CREATE that silently did
// nothing, or an ALTER that was skipped because PRAGMA was read from a stale
// connection, both look like success from the statement's side.
const missing = await verifySchema();

if (missing.length) {
  console.error(`migrate: FAILED - ${missing.length} object(s) still missing:`);
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log("migrate: schema is complete");

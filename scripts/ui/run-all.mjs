/**
 * Boots a dev server against a throwaway database, runs every browser suite
 * against it, then tears it down.
 *
 *   pnpm test:ui
 *
 * The point of the scratch database is that these suites create and delete
 * records. Pointed at the real one, a suite that dies halfway through leaves
 * its fixtures behind in data you care about.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.TEST_PORT ?? 3123);
const BASE = `http://127.0.0.1:${PORT}`;
const SUITES = [
  "scripts/e2e.mjs",
  "scripts/ui/shell.mjs",
  "scripts/ui/list.mjs",
  "scripts/ui/palette.mjs",
  "scripts/ui/record.mjs",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const workdir = mkdtempSync(join(tmpdir(), "kitaab-test-"));
const dbUrl = `file:${join(workdir, "test.db")}`;

const sh = (cmd, args, env = {}) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => resolve(code ?? 1));
  });

console.log(`seeding a throwaway database at ${dbUrl}\n`);
await sh("node", ["--import", "./scripts/register.mjs", "scripts/db-push.ts"], { KITAAB_DB_URL: dbUrl });
await sh("node", ["--import", "./scripts/register.mjs", "scripts/seed.ts", "120"], { KITAAB_DB_URL: dbUrl });

const logPath = join(workdir, "server.log");
const log = openSync(logPath, "w");
const server = spawn("pnpm", ["exec", "next", "dev", "--hostname", "127.0.0.1", "--port", String(PORT)], {
  stdio: ["ignore", log, log],
  env: {
    ...process.env,
    KITAAB_DB_URL: dbUrl,
    // its own build directory, so it does not fight the dev server you are using
    KITAAB_DIST_DIR: ".next-test",
  },
});

let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${BASE}/assessments`);
    if (res.ok) { up = true; break; }
  } catch { /* not listening yet */ }
  await sleep(500);
}

let failed = 0;
try {
  if (!up) {
    console.log("FAIL  test server never came up. Its log said:\n");
    console.log(readFileSync(logPath, "utf8").trim().split("\n").slice(-25).join("\n"));
    failed = 1;
  } else {
    console.log(`server up on ${BASE}\n`);
    for (const suite of SUITES) {
      console.log(`\n──── ${suite} ────`);
      const code = await sh("node", [suite, BASE]);
      if (code !== 0) failed++;
    }
  }
} finally {
  server.kill();
  await sleep(500);
  rmSync(workdir, { recursive: true, force: true });
}

console.log(failed === 0 ? "\n✓ every suite passed" : `\n✗ ${failed} suite(s) failed`);
process.exit(failed === 0 ? 0 : 1);

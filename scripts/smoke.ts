/**
 * Read/write smoke test, safe to run against any target including production.
 *
 *   pnpm smoke
 *
 * It exercises the paths that break when a deployment is misconfigured -
 * reads, the FTS index, a write, the triggers that keep FTS in step, notes -
 * using one record it creates and then removes completely. Unlike `pnpm check`
 * it asserts nothing about how much data exists, so it is meaningful against a
 * database holding ten records or ten thousand.
 *
 * Everything above goes through the data layer, which is deliberate - it works
 * without a server running - but it means a green run says nothing about
 * whether the app in front of that data is actually closed. Give it a URL and
 * it checks that too:
 *
 *   pnpm smoke --url https://kitaab.example.com
 */
import {
  addNote, assessmentIdExists, createAssessment, getAssessment, listAssessments,
  listNotes, railCounts, summary,
} from "../src/lib/queries.ts";
import { assessmentInput } from "../src/lib/schema.ts";
import { parseFilters } from "../src/lib/filters.ts";
import { describeTarget, first, run } from "../src/lib/db.ts";

/* No request, no signed-in user: these run as an admin so every read sees the
   whole table, and create rows owned by nobody. */
const ADMIN = { id: null, role: "admin" as const };


const FIXTURE = `SMOKE-${Date.now()}`;

/** Optional, because smoke has to work with no server running - but when it is
 *  missing, say so rather than letting a green run imply more than it checked. */
const BASE = (() => {
  const i = process.argv.indexOf("--url");
  const given = i === -1 ? process.env.KITAAB_SMOKE_URL : process.argv[i + 1];
  return given ? given.replace(/\/$/, "") : null;
})();

let fails = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => {
  if (!cond) { fails++; console.log(`FAIL  ${name}`, extra ?? ""); }
  else console.log(`ok    ${name}`);
};

/** Removes the fixture outright - no tombstone left in real data. */
const cleanup = async () => {
  await run(
    `DELETE FROM notes WHERE assessment_id IN
       (SELECT id FROM assessments WHERE assessment_id = ?)`,
    [FIXTURE],
  );
  await run(`DELETE FROM assessments WHERE assessment_id = ?`, [FIXTURE]);
};

console.log(`smoke testing ${describeTarget()}`);
console.log(
  BASE
    ? `and the app at ${BASE}\n`
    : "no --url given, so nothing here checks that the app turns strangers away\n",
);

try {
  await cleanup();

  /* ---- reads ---- */
  const before = await listAssessments(parseFilters({}), ADMIN);
  ok("list reads", before.total >= 0 && Array.isArray(before.items), before.total);
  ok("page size honoured", before.items.length <= before.perPage);
  const counts = await railCounts(ADMIN);
  ok("rail counts read", Object.values(counts).every((n) => Number.isInteger(n)), counts);
  const agg = await summary(parseFilters({}), ADMIN);
  ok("aggregates read", agg.total === before.total, { agg: agg.total, list: before.total });

  /* ---- write, and the FTS triggers behind it ---- */
  ok("fixture is not already present", !(await assessmentIdExists(FIXTURE)));
  const id = await createAssessment(
    assessmentInput.parse({
      assessmentId: FIXTURE,
      name: "Smoke test record",
      location: "Smokeville",
      surveyDate: "2026-01-05",
      surveyStatus: "Completed",
      completionDate: "2026-01-20",
      completionStatus: "Completed",
    }),
    "manual",
    null,
  );
  ok("write returns an id", id > 0, id);

  const read = await getAssessment(id, ADMIN);
  ok("write is readable", read?.assessmentId === FIXTURE && read?.location === "Smokeville");

  const found = await listAssessments(parseFilters({ q: "Smokeville" }), ADMIN);
  ok("FTS index picked the write up", found.items.some((r) => r.id === id),
     found.items.map((r) => r.assessmentId));

  const grew = await listAssessments(parseFilters({}), ADMIN);
  ok("total moved by exactly one", grew.total === before.total + 1,
     { before: before.total, after: grew.total });

  /* ---- notes ---- */
  const noteId = await addNote(id, "written by pnpm smoke", ADMIN);
  ok("note written", noteId > 0);
  const notes = await listNotes(id, ADMIN);
  ok("note readable", notes.length === 1 && notes[0].body === "written by pnpm smoke");

  /* ---- the app in front of it, if we were given one ---- */
  if (BASE) {
    // No cookie is sent, so this is what a stranger with the URL sees.
    const page = await fetch(`${BASE}/assessments`, { redirect: "manual" });
    const to = page.headers.get("location") ?? "";
    ok(
      "a signed-out page is sent to sign in",
      page.status >= 300 && page.status < 400 && to.includes("/login"),
      { status: page.status, location: to },
    );

    // The APIs answer machines, so they refuse rather than redirect.
    const api = await fetch(`${BASE}/api/search?q=a`, { redirect: "manual" });
    ok("a signed-out API call is refused", api.status === 401, api.status);

    const csv = await fetch(`${BASE}/api/export`, { redirect: "manual" });
    ok("a signed-out export is refused", csv.status === 401, csv.status);
  }
} catch (err) {
  fails++;
  console.log(`\nERROR ${(err as Error).message}`);
} finally {
  await cleanup();
  const left = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM assessments WHERE assessment_id = ?`,
    [FIXTURE],
  );
  ok("fixture removed", (left?.n ?? -1) === 0);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

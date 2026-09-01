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
 */
import {
  addNote, assessmentIdExists, createAssessment, getAssessment, listAssessments,
  listNotes, railCounts, summary,
} from "../src/lib/queries.ts";
import { assessmentInput } from "../src/lib/schema.ts";
import { parseFilters } from "../src/lib/filters.ts";
import { describeTarget, first, run } from "../src/lib/db.ts";

const FIXTURE = `SMOKE-${Date.now()}`;

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

console.log(`smoke testing ${describeTarget()}\n`);

try {
  await cleanup();

  /* ---- reads ---- */
  const before = await listAssessments(parseFilters({}));
  ok("list reads", before.total >= 0 && Array.isArray(before.items), before.total);
  ok("page size honoured", before.items.length <= before.perPage);
  const counts = await railCounts();
  ok("rail counts read", Object.values(counts).every((n) => Number.isInteger(n)), counts);
  const agg = await summary(parseFilters({}));
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
  );
  ok("write returns an id", id > 0, id);

  const read = await getAssessment(id);
  ok("write is readable", read?.assessmentId === FIXTURE && read?.location === "Smokeville");

  const found = await listAssessments(parseFilters({ q: "Smokeville" }));
  ok("FTS index picked the write up", found.items.some((r) => r.id === id),
     found.items.map((r) => r.assessmentId));

  const grew = await listAssessments(parseFilters({}));
  ok("total moved by exactly one", grew.total === before.total + 1,
     { before: before.total, after: grew.total });

  /* ---- notes ---- */
  const noteId = await addNote(id, "written by pnpm smoke");
  ok("note written", noteId > 0);
  const notes = await listNotes(id);
  ok("note readable", notes.length === 1 && notes[0].body === "written by pnpm smoke");
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

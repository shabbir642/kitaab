/**
 * Shrinks the database down to a small representative set - for handing the
 * app to someone, or for starting a deployment without 400 sample rows.
 *
 *   pnpm trim              # dry run: prints what it would keep and remove
 *   pnpm trim --yes        # actually do it
 *   pnpm trim --keep 25 --yes
 *
 * It keeps every hand-entered record plus, from whatever is left, one record
 * per interesting state - closed, overdue, in review, on hold, rejected,
 * cancelled, unscheduled, contradictory - so the list, the filters and the
 * analytics all still have something to show. Already-deleted notes are
 * purged too: they are tombstones, and trimming is when you want them gone.
 *
 * Take a backup first. `pnpm backup` does it in one command.
 */
import { all, first, run } from "../src/lib/db.ts";

const args = process.argv.slice(2);
const CONFIRMED = args.includes("--yes");
const keepIdx = args.indexOf("--keep");
const KEEP = keepIdx >= 0 ? Number(args[keepIdx + 1]) : 10;

if (!Number.isInteger(KEEP) || KEEP < 1) {
  console.error("--keep needs a positive whole number");
  process.exit(1);
}

type Candidate = {
  id: number;
  assessment_id: string;
  location: string | null;
  survey_status: string | null;
  completion_status: string | null;
};

const COLS = `id, assessment_id, location, survey_status, completion_status`;

/** One record per state worth keeping, in priority order. */
const WANTED: [string, string][] = [
  ["hand-entered", `origin = 'manual'`],
  ["closed with a turnaround", `survey_status = 'Completed' AND completion_status = 'Completed' AND completion_date IS NOT NULL`],
  ["overdue", `survey_status = 'Completed' AND completion_status NOT IN ('Completed','Rejected') AND julianday('now') - julianday(survey_date) > 120`],
  ["in review", `completion_status = 'In Review'`],
  ["on hold", `completion_status = 'On Hold'`],
  ["rejected", `completion_status = 'Rejected'`],
  ["survey cancelled", `survey_status = 'Cancelled'`],
  ["no survey date", `survey_date IS NULL`],
  ["scheduled", `survey_status = 'Scheduled' AND survey_date IS NOT NULL`],
  ["contradictory dates", `completion_status = 'Completed' AND completion_date IS NULL`],
];

const keep: (Candidate & { why: string })[] = [];
const taken = () => (keep.length ? keep.map((k) => k.id).join(",") : "0");

// Every hand-entered record is kept, however many there are: it is the only
// data here nobody can regenerate.
for (const r of await all<Candidate>(
  `SELECT ${COLS} FROM assessments WHERE deleted_at IS NULL AND origin = 'manual' ORDER BY id`,
)) {
  keep.push({ ...r, why: "hand-entered" });
}

for (const [why, where] of WANTED.slice(1)) {
  if (keep.length >= KEEP) break;
  const r = await first<Candidate>(
    `SELECT ${COLS} FROM assessments
     WHERE deleted_at IS NULL AND id NOT IN (${taken()}) AND ${where}
     ORDER BY id LIMIT 1`,
  );
  if (r) keep.push({ ...r, why });
}

// Top up with anything at all, so --keep is honoured even on thin data.
if (keep.length < KEEP) {
  for (const r of await all<Candidate>(
    `SELECT ${COLS} FROM assessments
     WHERE deleted_at IS NULL AND id NOT IN (${taken()})
     ORDER BY id LIMIT ${KEEP - keep.length}`,
  )) {
    keep.push({ ...r, why: "filler" });
  }
}

const total = (await first<{ n: number }>(`SELECT COUNT(*) AS n FROM assessments`))!.n;
const notes = (await first<{ n: number }>(`SELECT COUNT(*) AS n FROM notes`))!.n;

console.log(`keeping ${keep.length} of ${total} records:\n`);
for (const k of keep) {
  console.log(
    `  ${k.why.padEnd(24)} ${k.assessment_id.padEnd(18)} ` +
      `${(k.location ?? "—").padEnd(12)} ${k.survey_status} / ${k.completion_status}`,
  );
}
console.log(`\nwould remove ${total - keep.length} records and any notes attached to them`);

if (!CONFIRMED) {
  console.log("\ndry run - nothing changed. Re-run with --yes to apply.");
  process.exit(0);
}

const list = keep.map((k) => k.id).join(",");
await run(`DELETE FROM notes WHERE assessment_id NOT IN (${list})`);
await run(`DELETE FROM notes WHERE deleted_at IS NOT NULL`);
await run(`DELETE FROM assessments WHERE id NOT IN (${list})`);
// The FTS index is external-content, so it has to be rebuilt against what is
// left rather than left pointing at rows that no longer exist.
await run(`INSERT INTO assessments_fts(assessments_fts) VALUES ('rebuild')`);
await run(`VACUUM`);

const after = (await first<{ n: number }>(`SELECT COUNT(*) AS n FROM assessments`))!.n;
const afterFts = (await first<{ n: number }>(`SELECT COUNT(*) AS n FROM assessments_fts`))!.n;
const afterNotes = (await first<{ n: number }>(`SELECT COUNT(*) AS n FROM notes`))!.n;

console.log(`\nassessments ${total} -> ${after}`);
console.log(`notes       ${notes} -> ${afterNotes}`);
console.log(`fts rows    ${afterFts} (should equal ${after})`);

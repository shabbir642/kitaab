/**
 * Seeds the local database with sample assessment records.
 *
 *   pnpm seed          # add sample rows
 *   pnpm seed --reset  # wipe the table first
 *
 * Deliberately includes messy rows (blank dates, statuses that contradict the
 * dates, an unspecified location) so the filters, warnings and analytics have
 * something real to chew on.
 */
import { db } from "../src/lib/db.ts";

const RESET = process.argv.includes("--reset");
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 420);

// Deterministic PRNG so repeated seeds produce the same dataset.
let seed = 20260828;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const LOCATIONS = [
  "Pune", "Bengaluru", "Mumbai", "Hyderabad", "Delhi NCR",
  "Chennai", "Kolkata", "Ahmedabad", "Jaipur", "Kochi",
];
const PROGRAMS = [
  "Campus Readiness Survey", "Manufacturing Safety Audit", "Retail Footfall Study",
  "Health Camp Intake", "Water Quality Baseline", "Vendor Compliance Check",
  "Skill Gap Assessment", "Logistics Turnaround Review", "Branch Service Audit",
  "Solar Site Feasibility",
];
const ASSESSORS = [
  "R. Iyer", "S. Kulkarni", "A. Banerjee", "M. Fernandes", "T. Nair",
  "P. Chauhan", "D. Sethi", "K. Rao", null,
];
const REMARKS = [
  "Site access delayed by monsoon.", "Respondent list incomplete; partial coverage.",
  "Re-verified with the local coordinator.", "Awaiting signed consent forms.",
  "Two sections skipped - equipment unavailable.", "Escalated to regional lead.",
  null, null, null,
];
const SURVEY_STATUSES = ["Pending", "Scheduled", "In Progress", "Completed", "Cancelled"] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

const TODAY = new Date("2026-08-28T00:00:00Z");

function makeRow(i: number) {
  const program = pick(PROGRAMS);
  const location = rnd() < 0.05 ? null : pick(LOCATIONS);
  const prefix = program.split(" ").map((w) => w[0]).join("").toUpperCase();
  const assessmentId = `${prefix}-${2026}-${String(i + 1).padStart(4, "0")}${rnd() < 0.08 ? "/R2" : ""}`;

  // survey date spread over the last ~14 months
  const surveyDate = rnd() < 0.06 ? null : iso(addDays(TODAY, -int(0, 430)));

  let surveyStatus: string;
  if (surveyDate === null) surveyStatus = pick(["Pending", "Scheduled"] as const);
  else {
    const age = Math.round((TODAY.getTime() - new Date(surveyDate).getTime()) / 86400000);
    surveyStatus = age > 30
      ? pick(["Completed", "Completed", "Completed", "Cancelled"] as const)
      : pick(SURVEY_STATUSES);
  }

  let completionStatus: string = "Not Started";
  let completionDate: string | null = null;

  if (surveyStatus === "Completed" && surveyDate) {
    const roll = rnd();
    if (roll < 0.55) {
      completionStatus = "Completed";
      completionDate = iso(addDays(new Date(surveyDate), int(2, 45)));
      if (new Date(completionDate) > TODAY) completionDate = iso(TODAY);
    } else if (roll < 0.72) completionStatus = "In Review";
    else if (roll < 0.82) completionStatus = "On Hold";
    else if (roll < 0.9) completionStatus = "Rejected";
    else completionStatus = "Not Started";
  }

  // A few intentionally contradictory rows, so "Has data issues" is not empty.
  if (rnd() < 0.03) { completionStatus = "Completed"; completionDate = null; }
  if (rnd() < 0.02 && surveyStatus === "Completed") { /* keep */ }
  if (rnd() < 0.02) { surveyStatus = "Completed"; }

  return {
    assessmentId,
    name: `${program} - ${location ?? "Unassigned"} ${int(1, 24)}`,
    location,
    assessor: pick(ASSESSORS),
    surveyDate,
    surveyStatus,
    completionDate,
    completionStatus,
    remarks: pick(REMARKS),
  };
}

if (RESET) {
  db.exec("DELETE FROM assessments");
  db.exec("INSERT INTO assessments_fts(assessments_fts) VALUES ('rebuild')");
  console.log("cleared existing rows");
}

const insert = db.prepare(
  `INSERT OR IGNORE INTO assessments
    (assessment_id, name, location, assessor, survey_date, survey_status,
     completion_date, completion_status, remarks, origin, extras, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', '{}', ?, ?)`,
);

let inserted = 0;
db.exec("BEGIN");
for (let i = 0; i < COUNT; i++) {
  const r = makeRow(i);
  const stamp = new Date(TODAY.getTime() - int(0, 60) * 86400000).toISOString();
  const info = insert.run(
    r.assessmentId, r.name, r.location, r.assessor, r.surveyDate, r.surveyStatus,
    r.completionDate, r.completionStatus, r.remarks, stamp, stamp,
  );
  inserted += Number(info.changes);
}
db.exec("COMMIT");

const total = (db.prepare("SELECT COUNT(*) AS n FROM assessments WHERE deleted_at IS NULL").get() as { n: number }).n;
console.log(`inserted ${inserted} rows - ${total} live records total`);

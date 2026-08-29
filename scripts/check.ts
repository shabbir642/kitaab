/** Ad-hoc verification of the validation + query layers against a scratch DB.
 *  Run with: KITAAB_DB_PATH=/tmp/check.db node scripts/check.ts */
import { assessmentInput, warningsFor } from "../src/lib/schema.ts";
import { FLAGS, parseFilters } from "../src/lib/filters.ts";
import { VIEWS, headerFor, matchLocation, matchView } from "../src/lib/views.ts";
import { locationCounts, railCounts } from "../src/lib/queries.ts";
import {
  assessmentIdExists, byLocation, createAssessment, deleteAssessments,
  facetCounts, flagCounts, getAssessment, listAssessments, monthlyActivity,
  statusBreakdown, summary, updateAssessment,
} from "../src/lib/queries.ts";
import { db } from "../src/lib/db.ts";

// Leave no trace, and tolerate a scratch database that a previous run died
// halfway through: the fixture ID is cleared before and after.
const clearFixture = () =>
  db.prepare("DELETE FROM assessments WHERE assessment_id = 'CHK-001'").run();
clearFixture();

let fails = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => {
  if (!cond) { fails++; console.log(`FAIL  ${name}`, extra ?? ""); }
  else console.log(`ok    ${name}`);
};

/* ---- validation ---- */
const bad = assessmentInput.safeParse({ assessmentId: "  ", name: "x" });
ok("blank assessment ID rejected", !bad.success);

const notReal = assessmentInput.safeParse({ assessmentId: "A", name: "x", surveyDate: "2026-02-31" });
ok("2026-02-31 rejected as not a real date", !notReal.success);

const backwards = assessmentInput.safeParse({
  assessmentId: "A", name: "x", surveyDate: "2026-05-10", completionDate: "2026-05-01",
});
ok("completion before survey rejected", !backwards.success);

const spaces = assessmentInput.safeParse({ assessmentId: " AB-1​ ", name: " Trimmed " });
ok("invisible chars stripped from ID", spaces.success && spaces.data.assessmentId === "AB-1",
   spaces.success ? spaces.data.assessmentId : spaces.error.issues);
ok("name trimmed", spaces.success && spaces.data.name === "Trimmed");

const blanks = assessmentInput.safeParse({ assessmentId: "B", name: "y", surveyDate: "", location: "  " });
ok("empty strings become null", blanks.success && blanks.data.surveyDate === null && blanks.data.location === null);

ok("warning: completed with no date",
   warningsFor({ surveyDate: null, surveyStatus: "Completed", completionDate: null, completionStatus: null }).length === 1);

/* ---- CRUD ---- */
const input = assessmentInput.parse({
  assessmentId: "CHK-001", name: "Check record", location: "Testville",
  assessor: "QA", surveyDate: "2026-06-01", surveyStatus: "Completed",
  completionDate: "2026-06-20", completionStatus: "Completed", remarks: "hello, \"world\"",
});
const id = createAssessment(input, "manual");
ok("created", id > 0);
ok("duplicate ID detected", assessmentIdExists("CHK-001"));
ok("duplicate ID ignores self", !assessmentIdExists("CHK-001", id));

const got = getAssessment(id)!;
ok("round-trips fields", got.assessmentId === "CHK-001" && got.surveyDate === "2026-06-01" && got.origin === "manual", got);

updateAssessment(id, assessmentInput.parse({ ...input, name: "Renamed", completionStatus: "On Hold" }));
ok("updated", getAssessment(id)!.name === "Renamed");

/* ---- search / filters ---- */
const f = (q: Record<string, string | string[]>) => parseFilters(q);
ok("FTS finds by name token", listAssessments(f({ q: "renamed" })).items.some((r) => r.id === id));
ok("FTS survives symbol-heavy input", listAssessments(f({ q: "CHK-001" })).items.some((r) => r.id === id));
ok("FTS does not crash on quote/paren junk", listAssessments(f({ q: '") OR 1=1 --' })).total >= 0);
ok("status facet filters", listAssessments(f({ completionStatus: "On Hold" })).items.some((r) => r.id === id));
ok("bogus status value ignored", listAssessments(f({ completionStatus: "Nonsense" })).total > 1);
ok("date range filters", listAssessments(f({ surveyFrom: "2026-06-01", surveyTo: "2026-06-01" })).items.some((r) => r.id === id));
ok("origin filter", listAssessments(f({ origin: "manual" })).items.every((r) => r.origin === "manual"));
ok("sort whitelist falls back", parseFilters({ sort: "; DROP TABLE" }).sort === "updatedAt");
ok("perPage clamped to options", parseFilters({ perPage: "99999" }).perPage === 50);

const paged = listAssessments(f({ perPage: "25", page: "2" }));
ok("pagination page 2", paged.page === 2 && paged.items.length <= 25);
ok("page beyond end clamps", listAssessments(f({ page: "99999", perPage: "25" })).page === paged.pageCount);

ok("facet counts non-empty", facetCounts(f({}), "surveyStatus").size > 0);
ok("every flag is counted", Object.keys(flagCounts(f({}))).length === FLAGS.length);
ok("awaiting flag narrows to open completions",
   listAssessments(f({ flags: "awaiting" })).items.every(
     (r) => r.surveyStatus === "Completed" && !["Completed", "Rejected"].includes(r.completionStatus ?? ""),
   ));

/* ---- saved views ---- */
const rc = railCounts();
ok("rail counts are absolute, not filtered",
   rc.all === listAssessments(f({})).total && rc.overdue === flagCounts(f({})).overdue, rc);
ok("every view resolves to itself",
   VIEWS.every((v) => matchView(parseFilters(Object.fromEntries(new URLSearchParams(v.query)))) === v.key));
ok("a view plus an extra filter is no longer that view",
   matchView(f({ flags: "overdue", location: "Pune" })) === null);
ok("a single location reads as a location view", matchLocation(f({ location: "Pune" })) === "Pune");
ok("two locations do not", matchLocation(f({ location: ["Pune", "Kochi"] })) === null);
ok("header names the view", headerFor(f({ flags: "overdue" })).title === "Overdue");
ok("header names a bare location", headerFor(f({ location: "Pune" })).title === "Pune");
ok("header falls back for a compound filter",
   headerFor(f({ flags: "overdue", location: "Pune" })).title === "Filtered records");
ok("location counts are ordered and carry the total",
   locationCounts(3).length === 3 && locationCounts(3)[0].total >= 3);

/* ---- analytics ---- */
const s = summary(f({}));
ok("summary totals consistent", s.total > 0 && s.surveysDone <= s.total && s.completionsDone <= s.total, s);
ok("median turnaround computed", s.medianDaysToComplete !== null);
const sb = statusBreakdown(f({}), "survey");
ok("status breakdown keeps pipeline order", sb[0].status === "Pending" && sb.length >= 5);
ok("status breakdown sums to total",
   statusBreakdown(f({}), "completion").reduce((a, b) => a + b.count, 0) === s.total);
const ma = monthlyActivity(f({}), 12);
ok("monthly axis is 12 contiguous months", ma.length === 12 && ma.every((m) => /^\d{4}-\d{2}$/.test(m.month)));
const bl = byLocation(f({}), 3);
ok("byLocation folds tail into Other", bl.length <= 4 && bl.some((r) => r.location.startsWith("Other")), bl.map((r) => r.location));
ok("filtered analytics narrows", summary(f({ location: "Testville" })).total < s.total);

/* ---- delete ---- */
ok("soft delete", deleteAssessments([id]) === 1);
ok("gone from reads", getAssessment(id) === null);
ok("ID reusable after delete", !assessmentIdExists("CHK-001"));

clearFixture();

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

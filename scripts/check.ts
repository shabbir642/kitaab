/** Ad-hoc verification of the validation + query layers against a scratch
 *  database. Run with: KITAAB_DB_URL=file:/tmp/check.db pnpm check */
import { assessmentInput, warningsFor } from "../src/lib/schema.ts";
import { FLAGS, parseFilters } from "../src/lib/filters.ts";
import { VIEWS, headerFor, matchLocation, matchView } from "../src/lib/views.ts";
import {
  addNote, assessmentIdExists, byLocation, createAssessment, deleteAssessments,
  deleteNote, facetCounts, flagCounts, getAssessment, listAssessments, listNotes,
  locationCounts, monthlyActivity, railCounts, removeExtra, setExtra,
  statusBreakdown, summary, updateAssessment, updateInlineField,
} from "../src/lib/queries.ts";
import { first, pushSchema, run } from "../src/lib/db.ts";
import {
  MAX_ATTEMPTS, clearAttempts, createSession, createUser, deactivateUser, emailTaken,
  findUserByEmail, findUserById, hashPassword, hashToken, revokeOtherSessions,
  revokeSession, signIn, userForToken, verifyPassword,
} from "../src/lib/auth.ts";

await pushSchema();

// Leave no trace, and tolerate a scratch database that a previous run died
// halfway through: the fixture ID is cleared before and after.
const clearFixture = async () => {
  await run(
    "DELETE FROM notes WHERE assessment_id IN (SELECT id FROM assessments WHERE assessment_id = 'CHK-001')",
  );
  await run("DELETE FROM assessments WHERE assessment_id = 'CHK-001'");
};
await clearFixture();

let fails = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => {
  if (!cond) { fails++; console.log(`FAIL  ${name}`, extra ?? ""); }
  else console.log(`ok    ${name}`);
};

/* ---- validation ---- */
ok("blank assessment ID rejected", !assessmentInput.safeParse({ assessmentId: "  ", name: "x" }).success);
ok("2026-02-31 rejected as not a real date",
   !assessmentInput.safeParse({ assessmentId: "A", name: "x", surveyDate: "2026-02-31" }).success);
ok("completion before survey rejected",
   !assessmentInput.safeParse({ assessmentId: "A", name: "x", surveyDate: "2026-05-10", completionDate: "2026-05-01" }).success);

const spaces = assessmentInput.safeParse({ assessmentId: " AB-1​ ", name: " Trimmed " });
ok("invisible chars stripped from ID", spaces.success && spaces.data.assessmentId === "AB-1");
ok("name trimmed", spaces.success && spaces.data.name === "Trimmed");

const blanks = assessmentInput.safeParse({ assessmentId: "B", name: "y", surveyDate: "", location: "  " });
ok("empty strings become null", blanks.success && blanks.data.surveyDate === null && blanks.data.location === null);
ok("optional fields may be omitted entirely",
   assessmentInput.safeParse({ assessmentId: "C", name: "z" }).success);
ok("warning: completed with no date",
   warningsFor({ surveyDate: null, surveyStatus: "Completed", completionDate: null, completionStatus: null }).length === 1);

/* ---- CRUD ---- */
const input = assessmentInput.parse({
  assessmentId: "CHK-001", name: "Check record", location: "Testville",
  assessor: "QA", surveyDate: "2026-06-01", surveyStatus: "Completed",
  completionDate: "2026-06-20", completionStatus: "Completed", remarks: 'hello, "world"',
});
const id = await createAssessment(input, "manual");
ok("created", id > 0);
ok("duplicate ID detected", await assessmentIdExists("CHK-001"));
ok("duplicate ID ignores self", !(await assessmentIdExists("CHK-001", id)));

const got = (await getAssessment(id))!;
ok("round-trips fields",
   got.assessmentId === "CHK-001" && got.surveyDate === "2026-06-01" && got.origin === "manual", got);

await updateAssessment(id, assessmentInput.parse({ ...input, name: "Renamed", completionStatus: "On Hold" }));
ok("updated", (await getAssessment(id))!.name === "Renamed");

/* ---- search / filters ---- */
const f = (q: Record<string, string | string[]>) => parseFilters(q);
ok("FTS finds by name token", (await listAssessments(f({ q: "renamed" }))).items.some((r) => r.id === id));
ok("FTS survives symbol-heavy input", (await listAssessments(f({ q: "CHK-001" }))).items.some((r) => r.id === id));
ok("FTS does not crash on quote/paren junk", (await listAssessments(f({ q: '") OR 1=1 --' }))).total >= 0);
ok("status facet filters", (await listAssessments(f({ completionStatus: "On Hold" }))).items.some((r) => r.id === id));
ok("bogus status value ignored", (await listAssessments(f({ completionStatus: "Nonsense" }))).total > 1);
ok("date range filters",
   (await listAssessments(f({ surveyFrom: "2026-06-01", surveyTo: "2026-06-01" }))).items.some((r) => r.id === id));
ok("origin filter", (await listAssessments(f({ origin: "manual" }))).items.every((r) => r.origin === "manual"));

ok("sort whitelist falls back", parseFilters({ sort: "; DROP TABLE" }).sorts[0].key === "updatedAt");
const twoLevel = parseFilters({ sort: "location:asc,surveyDate:desc" }).sorts;
ok("multi-level sort parses in order",
   twoLevel.length === 2 && twoLevel[0].key === "location" && twoLevel[0].dir === "asc" && twoLevel[1].key === "surveyDate");
ok("duplicate sort levels are dropped", parseFilters({ sort: "name:asc,name:desc" }).sorts.length === 1);
ok("sort levels are capped",
   parseFilters({ sort: "name:asc,location:asc,assessor:asc,surveyDate:asc,updatedAt:asc" }).sorts.length === 4);
ok("multi-level sort actually orders", await (async () => {
  const items = (await listAssessments(f({ sort: "location:asc,name:asc", perPage: "100" }))).items;
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1], b = items[i];
    if (a.location === null || b.location === null) continue;
    if (a.location > b.location) return false;
    if (a.location === b.location && a.name > b.name) return false;
  }
  return true;
})());
ok("default page size is 10", parseFilters({}).perPage === 10);
ok("perPage clamped to options", parseFilters({ perPage: "99999" }).perPage === 10);

const paged = await listAssessments(f({ perPage: "25", page: "2" }));
ok("pagination page 2", paged.page === 2 && paged.items.length <= 25);
ok("page beyond end clamps", (await listAssessments(f({ page: "99999", perPage: "25" }))).page === paged.pageCount);

ok("facet counts non-empty", (await facetCounts(f({}), "surveyStatus")).size > 0);
ok("every flag is counted", Object.keys(await flagCounts(f({}))).length === FLAGS.length);
ok("awaiting flag narrows to open completions",
   (await listAssessments(f({ flags: "awaiting" }))).items.every(
     (r) => r.surveyStatus === "Completed" && !["Completed", "Rejected"].includes(r.completionStatus ?? ""),
   ));

/* ---- saved views ---- */
const rc = await railCounts();
ok("rail counts are absolute, not filtered",
   rc.all === (await listAssessments(f({}))).total && rc.overdue === (await flagCounts(f({}))).overdue, rc);
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
const lc = await locationCounts(3);
ok("location counts are ordered and carry the total", lc.length === 3 && lc[0].total >= 3);

/* ---- analytics ---- */
const s = await summary(f({}));
ok("summary totals consistent", s.total > 0 && s.surveysDone <= s.total && s.completionsDone <= s.total, s);
ok("median turnaround computed", s.medianDaysToComplete !== null);
const sb = await statusBreakdown(f({}), "survey");
ok("status breakdown keeps pipeline order", sb[0].status === "Pending" && sb.length >= 5);
ok("status breakdown sums to total",
   (await statusBreakdown(f({}), "completion")).reduce((a, b) => a + b.count, 0) === s.total);
const ma = await monthlyActivity(f({}), 12);
ok("monthly axis is 12 contiguous months", ma.length === 12 && ma.every((m) => /^\d{4}-\d{2}$/.test(m.month)));
const bl = await byLocation(f({}), 3);
ok("byLocation folds tail into Other",
   bl.length <= 4 && bl.some((r) => r.location.startsWith("Other")), bl.map((r) => r.location));
ok("filtered analytics narrows", (await summary(f({ location: "Testville" }))).total < s.total);

/* ---- notes ---- */
ok("no notes to start", (await listNotes(id)).length === 0);
const n1 = await addNote(id, "first note");
const n2 = await addNote(id, "second note");
ok("notes added", (await listNotes(id)).length === 2);
ok("newest note first", (await listNotes(id))[0].id === n2);
ok("note carries its record", (await listNotes(id)).every((n) => n.assessmentId === id));
ok("note soft delete removes it from reads",
   (await deleteNote(n1, id)) === 1 && (await listNotes(id)).length === 1);
ok("a note cannot be deleted through the wrong record", (await deleteNote(n2, id + 99999)) === 0);
ok("notes belong to one record only", (await listNotes(id + 99999)).length === 0);

/* ---- single-field and custom-field edits ---- */
await updateInlineField(id, "remarks", "edited in place");
ok("inline field edit persists", (await getAssessment(id))!.remarks === "edited in place");
await updateInlineField(id, "remarks", null);
ok("inline field clears to null", (await getAssessment(id))!.remarks === null);

await setExtra(id, "Batch", "B-12");
await setExtra(id, "Vendor", "Acme");
const withExtras = (await getAssessment(id))!.extras;
ok("custom fields stored", withExtras.Batch === "B-12" && withExtras.Vendor === "Acme");
await setExtra(id, "Batch", "B-13");
const overwritten = (await getAssessment(id))!.extras;
ok("custom field overwritten, not duplicated",
   overwritten.Batch === "B-13" && Object.keys(overwritten).length === 2);
await removeExtra(id, "Batch");
const trimmed = (await getAssessment(id))!.extras;
ok("custom field removed leaves the others", trimmed.Batch === undefined && trimmed.Vendor === "Acme");
await updateAssessment(id, assessmentInput.parse({ ...input, name: "Renamed again" }));
ok("extras survive a core-field save", (await getAssessment(id))!.extras.Vendor === "Acme");

/* ---- delete ---- */
ok("soft delete", (await deleteAssessments([id])) === 1);
ok("gone from reads", (await getAssessment(id)) === null);
ok("ID reusable after delete", !(await assessmentIdExists("CHK-001")));

await clearFixture();

/* ---- auth ---- */
const clearAuthFixture = async () => {
  await run("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'chk-%')");
  await run("DELETE FROM login_attempts WHERE email LIKE 'chk-%'");
  await run("DELETE FROM users WHERE email LIKE 'chk-%'");
};
await clearAuthFixture();

const hash = await hashPassword("correct horse battery staple");
ok("hash is self-describing scrypt", hash.startsWith("scrypt$") && hash.split("$").length === 6);
ok("password verifies", await verifyPassword("correct horse battery staple", hash));
ok("wrong password rejected", !(await verifyPassword("Correct horse battery staple", hash)));
ok("salted: same password hashes differently",
   hash !== (await hashPassword("correct horse battery staple")));
ok("malformed hash rejected, not thrown", !(await verifyPassword("x", "not-a-hash")));
ok("unknown algorithm rejected", !(await verifyPassword("x", "bcrypt$1$2$3$4$5")));

const uid = await createUser({ email: "  CHK-User@Example.COM ", password: "pw-one", name: "Check User" });
ok("user created", uid > 0);
ok("email normalised on write and read", (await findUserByEmail("chk-user@example.com"))?.id === uid);
ok("lookup is case-insensitive", (await findUserByEmail("CHK-USER@EXAMPLE.com"))?.id === uid);
ok("user defaults to member", (await findUserById(uid))?.role === "member");
ok("email taken", await emailTaken("chk-user@example.com"));
ok("email taken ignores self", !(await emailTaken("chk-user@example.com", uid)));
ok("User carries no password hash", !("passwordHash" in (await findUserById(uid))!));

ok("sign-in rejects a wrong password", !(await signIn("chk-user@example.com", "nope")).ok);
ok("sign-in rejects an unknown address", !(await signIn("chk-nobody@example.com", "pw-one")).ok);
const good = await signIn("chk-user@example.com", "pw-one");
ok("sign-in accepts the right password", good.ok && good.user.id === uid);
ok("last_login_at unset before a session", (await findUserById(uid))?.lastLoginAt === null);

const { token } = await createSession(uid);
ok("session resolves to its user", (await userForToken(token))?.id === uid);
ok("last_login_at stamped", (await findUserById(uid))?.lastLoginAt !== null);
ok("raw token is not stored", !(await first("SELECT id FROM sessions WHERE token_hash = ?", [token])));
ok("token hash is stored", !!(await first("SELECT id FROM sessions WHERE token_hash = ?", [hashToken(token)])));
ok("a garbage token resolves to nobody", (await userForToken("garbage")) === undefined);
ok("an empty token resolves to nobody", (await userForToken("")) === undefined);

const { token: second } = await createSession(uid);
await revokeSession(token);
ok("revoked session is dead", (await userForToken(token)) === undefined);
ok("the other session is untouched", (await userForToken(second))?.id === uid);

const { token: third } = await createSession(uid);
await revokeOtherSessions(uid, third);
ok("revokeOthers keeps the caller", (await userForToken(third))?.id === uid);
ok("revokeOthers drops the rest", (await userForToken(second)) === undefined);

await run("UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
          [new Date(Date.now() - 1000).toISOString(), hashToken(third)]);
ok("expired session is dead", (await userForToken(third)) === undefined);

const throttleIp = "203.0.113.7";
for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await signIn("chk-user@example.com", "wrong", throttleIp);
const under = await signIn("chk-user@example.com", "wrong", throttleIp);
ok("under the limit, still just invalid", !under.ok && under.reason === "invalid");
const locked = await signIn("chk-user@example.com", "pw-one", throttleIp);
ok("over the limit, throttled even with the right password",
   !locked.ok && locked.reason === "throttled");
const elsewhere = await signIn("chk-other@example.com", "pw-one", "198.51.100.2");
ok("a different IP and address is unaffected", !elsewhere.ok && elsewhere.reason === "invalid");
await clearAttempts("chk-user@example.com", throttleIp);
ok("cleared attempts let the user back in", (await signIn("chk-user@example.com", "pw-one", throttleIp)).ok);

const { token: live } = await createSession(uid);
await deactivateUser(uid);
ok("deactivated user cannot be found", (await findUserById(uid)) === undefined);
ok("deactivating kills live sessions", (await userForToken(live)) === undefined);
ok("address is reusable after deactivation", !(await emailTaken("chk-user@example.com")));

await clearAuthFixture();

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

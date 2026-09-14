import { all, first, run, type InValue } from "./db";
import { DEFAULT_SORTS, SORTABLE, type Filters } from "./filters";
import type { Role } from "./auth";
import { logActivity } from "./activity";
import {
  OVERDUE_DAYS,
  PHASES,
  type Assessment,
  type AssessmentInput,
} from "./schema";

/* ---------------------------------------------------------------------------
   Row mapping
--------------------------------------------------------------------------- */

type Row = {
  id: number;
  assessment_id: string;
  name: string;
  location: string | null;
  assessor: string | null;
  survey_date: string | null;
  survey_status: string | null;
  completion_date: string | null;
  completion_status: string | null;
  remarks: string | null;
  origin: string;
  extras: string;
  created_at: string;
  updated_at: string;
};

function toAssessment(r: Row): Assessment {
  let extras: Record<string, unknown> = {};
  try {
    extras = JSON.parse(r.extras || "{}") as Record<string, unknown>;
  } catch {
    extras = {};
  }
  return {
    id: r.id,
    assessmentId: r.assessment_id,
    name: r.name,
    location: r.location,
    assessor: r.assessor,
    surveyDate: r.survey_date,
    surveyStatus: r.survey_status,
    completionDate: r.completion_date,
    completionStatus: r.completion_status,
    remarks: r.remarks,
    origin: r.origin === "import" ? "import" : "manual",
    extras,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT_COLS = `id, assessment_id, name, location, assessor, survey_date,
  survey_status, completion_date, completion_status, remarks, origin, extras,
  created_at, updated_at`;

const now = () => new Date().toISOString();

/* ---------------------------------------------------------------------------
   Derived SQL expressions - single source of truth so the list, the filter
   facets and the analytics page can never disagree about what "overdue" means.
--------------------------------------------------------------------------- */

export const SQL_OVERDUE = `(
  survey_status = 'Completed'
  AND survey_date IS NOT NULL
  AND (completion_status IS NULL OR completion_status NOT IN ('Completed', 'Rejected'))
  AND julianday('now') - julianday(survey_date) > ${OVERDUE_DAYS}
)`;

export const SQL_HAS_ISSUES = `(
  (survey_status = 'Completed' AND survey_date IS NULL)
  OR (completion_status = 'Completed' AND completion_date IS NULL)
  OR (completion_date IS NOT NULL AND survey_status <> 'Completed')
)`;

const SQL_COMPLETION_OPEN = `(completion_status IS NULL OR completion_status NOT IN ('Completed', 'Rejected'))`;

/** Survey finished, completion still running - the live workload. */
export const SQL_AWAITING = `(survey_status = 'Completed' AND ${SQL_COMPLETION_OPEN})`;

/* ---------------------------------------------------------------------------
   WHERE builder
--------------------------------------------------------------------------- */

/** FTS5 accepts a query language, so raw user input can be a syntax error
 *  (`ABC-123`, an unbalanced quote). Tokenise to word/number runs and rebuild
 *  as quoted prefix terms - robust for any input, and matches the way
 *  unicode61 tokenised the stored text. */
function ftsQuery(q: string): string | null {
  const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) return null;
  return tokens.slice(0, 12).map((t) => `"${t}"*`).join(" ");
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

/* ---------------------------------------------------------------------------
   Who is asking.

   An admin sees every record; a maintainer sees only the ones they created.
   The actor carries both facts - the visibility rule and the id to stamp on a
   write - so the two cannot drift apart.

   Every function that touches assessments takes one, deliberately: a missing
   scope is then a type error at the call site rather than a silent leak.

   Note that `created_by = ?` also excludes the rows that predate accounts,
   whose created_by is NULL. Records imported before there were users belong to
   nobody, so only an admin sees them. That is the safe reading.
--------------------------------------------------------------------------- */

/* id is nullable so that a script - which has no signed-in user - can still
   act as an admin without inventing a user id. Foreign keys are enforced here,
   so a made-up id is a constraint violation, not a harmless placeholder. A
   maintainer always has a real one. */
export type Actor = { id: number | null; role: Role };

function visibleTo(a: Actor): { sql: string; params: InValue[] } {
  return a.role === "admin"
    ? { sql: "1=1", params: [] }
    : { sql: "created_by = ?", params: [a.id] };
}

export function buildWhere(f: Filters, actor: Actor): { sql: string; params: InValue[] } {
  const scope = visibleTo(actor);
  const clauses: string[] = ["deleted_at IS NULL", scope.sql];
  const params: InValue[] = [...scope.params];

  const match = f.q ? ftsQuery(f.q) : null;
  if (match) {
    clauses.push(`id IN (SELECT rowid FROM assessments_fts WHERE assessments_fts MATCH ?)`);
    params.push(match);
  }

  if (f.surveyStatus.length) {
    clauses.push(`survey_status IN (${placeholders(f.surveyStatus.length)})`);
    params.push(...f.surveyStatus);
  }
  if (f.completionStatus.length) {
    clauses.push(`completion_status IN (${placeholders(f.completionStatus.length)})`);
    params.push(...f.completionStatus);
  }
  if (f.anyStatus.length) {
    const ph = placeholders(f.anyStatus.length);
    clauses.push(`(survey_status IN (${ph}) OR completion_status IN (${ph}))`);
    params.push(...f.anyStatus, ...f.anyStatus);
  }
  if (f.location.length) {
    clauses.push(`location IN (${placeholders(f.location.length)})`);
    params.push(...f.location);
  }

  if (f.surveyFrom) { clauses.push("survey_date >= ?"); params.push(f.surveyFrom); }
  if (f.surveyTo) { clauses.push("survey_date <= ?"); params.push(f.surveyTo); }
  if (f.completionFrom) { clauses.push("completion_date >= ?"); params.push(f.completionFrom); }
  if (f.completionTo) { clauses.push("completion_date <= ?"); params.push(f.completionTo); }

  for (const flag of f.flags) {
    if (flag === "overdue") clauses.push(SQL_OVERDUE);
    if (flag === "awaiting") clauses.push(SQL_AWAITING);
    if (flag === "issues") clauses.push(SQL_HAS_ISSUES);
    if (flag === "no-completion-date") clauses.push("completion_date IS NULL");
    if (flag === "unscheduled") clauses.push("survey_date IS NULL");
  }

  if (f.origin) { clauses.push("origin = ?"); params.push(f.origin); }

  return { sql: clauses.join("\n  AND "), params };
}

/** ORDER BY for a multi-level sort. NULLS LAST at every level regardless of
 *  direction: an empty date is "unknown", not "oldest". */
function orderBy(f: Filters): string {
  const levels = (f.sorts.length ? f.sorts : DEFAULT_SORTS).map((s) => {
    const col = SORTABLE[s.key];
    return `(${col} IS NULL) ASC, ${col} ${s.dir === "asc" ? "ASC" : "DESC"}`;
  });
  return [...levels, "id DESC"].join(", ");
}

/* ---------------------------------------------------------------------------
   Listing
--------------------------------------------------------------------------- */

export type ListResult = {
  items: Assessment[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
};

export async function listAssessments(f: Filters, actor: Actor): Promise<ListResult> {
  const { sql: where, params } = buildWhere(f, actor);

  const counted = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM assessments WHERE ${where}`,
    params,
  );
  const total = Number(counted?.n ?? 0);

  const pageCount = Math.max(1, Math.ceil(total / f.perPage));
  const page = Math.min(f.page, pageCount);
  const offset = (page - 1) * f.perPage;

  const items = (
    await all<Row>(
      `SELECT ${SELECT_COLS} FROM assessments
       WHERE ${where}
       ORDER BY ${orderBy(f)}
       LIMIT ? OFFSET ?`,
      [...params, f.perPage, offset],
    )
  ).map(toAssessment);

  return { items, total, page, perPage: f.perPage, pageCount };
}

/** Facet counts for the filter bar. Computed against every *other* facet but
 *  not against the facet's own selection, so a chip never shows "0" for the
 *  value you just picked. */
export async function facetCounts(
  f: Filters,
  facet: "surveyStatus" | "completionStatus" | "location",
  actor: Actor,
): Promise<Map<string, number>> {
  const cleared: Filters = { ...f, [facet]: [] } as Filters;
  const { sql: where, params } = buildWhere(cleared, actor);
  const col =
    facet === "surveyStatus" ? "survey_status"
    : facet === "completionStatus" ? "completion_status"
    : "location";

  const out = new Map<string, number>();
  for (const r of await all<{ v: string | null; n: number }>(
    `SELECT ${col} AS v, COUNT(*) AS n FROM assessments
     WHERE ${where} AND ${col} IS NOT NULL
     GROUP BY ${col} ORDER BY n DESC`,
    params,
  )) {
    if (r.v != null) out.set(r.v, Number(r.n));
  }
  return out;
}

export async function flagCounts(f: Filters, actor: Actor): Promise<Record<string, number>> {
  const { sql: where, params } = buildWhere({ ...f, flags: [] }, actor);
  const r = await first<Record<string, number | null>>(
    `SELECT
       SUM(CASE WHEN ${SQL_OVERDUE} THEN 1 ELSE 0 END)            AS overdue,
       SUM(CASE WHEN ${SQL_AWAITING} THEN 1 ELSE 0 END)            AS awaiting,
       SUM(CASE WHEN ${SQL_HAS_ISSUES} THEN 1 ELSE 0 END)          AS issues,
       SUM(CASE WHEN completion_date IS NULL THEN 1 ELSE 0 END)    AS noCompletionDate,
       SUM(CASE WHEN survey_date IS NULL THEN 1 ELSE 0 END)        AS unscheduled
     FROM assessments WHERE ${where}`,
    params,
  );
  return {
    overdue: Number(r?.overdue ?? 0),
    awaiting: Number(r?.awaiting ?? 0),
    issues: Number(r?.issues ?? 0),
    "no-completion-date": Number(r?.noCompletionDate ?? 0),
    unscheduled: Number(r?.unscheduled ?? 0),
  };
}

/** Every location on record - the filter dropdown needs the full list, not
 *  just the ones surviving the current filter. */
export async function allLocations(actor: Actor): Promise<string[]> {
  const scope = visibleTo(actor);
  return (
    await all<{ location: string }>(
      `SELECT DISTINCT location FROM assessments
       WHERE deleted_at IS NULL AND ${scope.sql}
         AND location IS NOT NULL AND location <> ''
       ORDER BY location COLLATE NOCASE`,
      scope.params,
    )
  ).map((r) => r.location);
}

export async function allAssessors(actor: Actor): Promise<string[]> {
  const scope = visibleTo(actor);
  return (
    await all<{ assessor: string }>(
      `SELECT DISTINCT assessor FROM assessments
       WHERE deleted_at IS NULL AND ${scope.sql}
         AND assessor IS NOT NULL AND assessor <> ''
       ORDER BY assessor COLLATE NOCASE`,
      scope.params,
    )
  ).map((r) => r.assessor);
}

/* ---------------------------------------------------------------------------
   CRUD
--------------------------------------------------------------------------- */

export async function getAssessment(id: number, actor: Actor): Promise<Assessment | null> {
  const scope = visibleTo(actor);
  const r = await first<Row>(
    `SELECT ${SELECT_COLS} FROM assessments
     WHERE id = ? AND deleted_at IS NULL AND ${scope.sql}`,
    [id, ...scope.params],
  );
  return r ? toAssessment(r) : null;
}

export async function assessmentIdExists(
  assessmentId: string,
  exceptId?: number,
): Promise<boolean> {
  // Unscoped on purpose: the ID is unique across the whole table, so a
  // maintainer must collide with a record they cannot see.
  const r = await first<{ id: number }>(
    `SELECT id FROM assessments
     WHERE assessment_id = ? AND deleted_at IS NULL AND id <> ?`,
    [assessmentId, exceptId ?? -1],
  );
  return !!r;
}

/* actor is required and nullable rather than optional: a script seeding rows
   has no owner to name, but an app call site must not be able to forget one by
   leaving the argument off. Explicit null says "belongs to nobody". */
export async function createAssessment(
  input: AssessmentInput,
  origin: "manual" | "import",
  actor: Actor | null,
): Promise<number> {
  const stamp = now();
  const info = await run(
    `INSERT INTO assessments
      (assessment_id, name, location, assessor, survey_date, survey_status,
       completion_date, completion_status, remarks, origin, extras, created_at, updated_at,
       created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?)`,
    [
      input.assessmentId, input.name, input.location, input.assessor,
      input.surveyDate, input.surveyStatus ?? null,
      input.completionDate, input.completionStatus ?? null,
      input.remarks, origin, stamp, stamp,
      actor?.id ?? null, actor?.id ?? null,
    ],
  );
  await logActivity(actor?.id ?? null, "create", "assessment", info.lastInsertRowid, {
    assessmentId: input.assessmentId,
    origin,
  });
  return info.lastInsertRowid;
}

export async function updateAssessment(
  id: number,
  input: AssessmentInput,
  actor: Actor,
): Promise<void> {
  const scope = visibleTo(actor);
  const changed = await run(
    `UPDATE assessments SET
       assessment_id = ?, name = ?, location = ?, assessor = ?,
       survey_date = ?, survey_status = ?, completion_date = ?,
       completion_status = ?, remarks = ?, updated_at = ?, updated_by = ?
     WHERE id = ? AND deleted_at IS NULL AND ${scope.sql}`,
    [
      input.assessmentId, input.name, input.location, input.assessor,
      input.surveyDate, input.surveyStatus ?? null,
      input.completionDate, input.completionStatus ?? null,
      input.remarks, now(), actor.id, id, ...scope.params,
    ],
  );
  // Only if a row actually moved: a maintainer aiming at a record they cannot
  // see changes nothing, and must not leave a trail saying otherwise.
  if (changed.changes > 0) {
    await logActivity(actor.id, "update", "assessment", id, { assessmentId: input.assessmentId });
  }
}

/** Soft delete - rows stay recoverable straight from the database. */
export async function deleteAssessments(ids: number[], actor: Actor): Promise<number> {
  if (!ids.length) return 0;
  const scope = visibleTo(actor);
  const stamp = now();
  const info = await run(
    `UPDATE assessments SET deleted_at = ?, updated_at = ?, updated_by = ?
     WHERE id IN (${placeholders(ids.length)}) AND deleted_at IS NULL AND ${scope.sql}`,
    [stamp, stamp, actor.id, ...ids, ...scope.params],
  );
  if (info.changes > 0) {
    await logActivity(actor.id, "delete", "assessment", null, { ids, deleted: info.changes });
  }
  return info.changes;
}

export async function bulkSetStatus(
  ids: number[],
  field: "survey_status" | "completion_status",
  value: string,
  actor: Actor,
): Promise<number> {
  if (!ids.length) return 0;
  const scope = visibleTo(actor);
  const info = await run(
    `UPDATE assessments SET ${field} = ?, updated_at = ?, updated_by = ?
     WHERE id IN (${placeholders(ids.length)}) AND deleted_at IS NULL AND ${scope.sql}`,
    [value, now(), actor.id, ...ids, ...scope.params],
  );
  if (info.changes > 0) {
    await logActivity(actor.id, "status", "assessment", null, { ids, field, value });
  }
  return info.changes;
}

/* ---------------------------------------------------------------------------
   Analytics - all scoped by the same Filters the list uses
--------------------------------------------------------------------------- */

export type Summary = {
  total: number;
  surveysDone: number;
  completionsDone: number;
  inFlight: number;
  overdue: number;
  issues: number;
  medianDaysToComplete: number | null;
};

export async function summary(f: Filters, actor: Actor): Promise<Summary> {
  const { sql: where, params } = buildWhere(f, actor);

  // Independent queries, so they go together rather than one after the other.
  const [r, durationRows] = await Promise.all([
    first<Record<string, number | null>>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN survey_status = 'Completed' THEN 1 ELSE 0 END)     AS surveysDone,
         SUM(CASE WHEN completion_status = 'Completed' THEN 1 ELSE 0 END) AS completionsDone,
         SUM(CASE WHEN survey_status = 'Completed' AND ${SQL_COMPLETION_OPEN} THEN 1 ELSE 0 END) AS inFlight,
         SUM(CASE WHEN ${SQL_OVERDUE} THEN 1 ELSE 0 END)                  AS overdue,
         SUM(CASE WHEN ${SQL_HAS_ISSUES} THEN 1 ELSE 0 END)               AS issues
       FROM assessments WHERE ${where}`,
      params,
    ),
    all<{ d: number }>(
      `SELECT julianday(completion_date) - julianday(survey_date) AS d
       FROM assessments
       WHERE ${where} AND survey_date IS NOT NULL AND completion_date IS NOT NULL
         AND completion_status = 'Completed'
       ORDER BY d`,
      params,
    ),
  ]);

  const durations = durationRows.map((x) => Number(x.d));
  const median =
    durations.length === 0
      ? null
      : durations.length % 2
        ? durations[(durations.length - 1) / 2]
        : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2;

  return {
    total: Number(r?.total ?? 0),
    surveysDone: Number(r?.surveysDone ?? 0),
    completionsDone: Number(r?.completionsDone ?? 0),
    inFlight: Number(r?.inFlight ?? 0),
    overdue: Number(r?.overdue ?? 0),
    issues: Number(r?.issues ?? 0),
    medianDaysToComplete: median == null ? null : Math.round(median),
  };
}

export type StatusSlice = { status: string; count: number };

export async function statusBreakdown(
  f: Filters,
  phase: "survey" | "completion",
  actor: Actor,
): Promise<StatusSlice[]> {
  const def = PHASES.find((p) => p.key === phase)!;
  const col = def.statusField === "surveyStatus" ? "survey_status" : "completion_status";
  const { sql: where, params } = buildWhere(f, actor);

  const counts = new Map<string, number>();
  for (const r of await all<{ v: string | null; n: number }>(
    `SELECT ${col} AS v, COUNT(*) AS n FROM assessments WHERE ${where} GROUP BY ${col}`,
    params,
  )) {
    counts.set(r.v ?? "(blank)", Number(r.n));
  }

  const ordered: StatusSlice[] = def.statuses.map((s) => ({
    status: s,
    count: counts.get(s) ?? 0,
  }));
  const blank = counts.get("(blank)");
  if (blank) ordered.push({ status: "(blank)", count: blank });
  return ordered;
}

export type MonthPoint = { month: string; surveys: number; completions: number };

/** Monthly survey vs completion counts over a contiguous month axis (gaps are
 *  filled with zeros, so a quiet month reads as a dip rather than vanishing). */
export async function monthlyActivity(f: Filters, actor: Actor, months = 12): Promise<MonthPoint[]> {
  const { sql: where, params } = buildWhere(f, actor);

  const grab = async (col: string) => {
    const m = new Map<string, number>();
    for (const r of await all<{ m: string; n: number }>(
      `SELECT strftime('%Y-%m', ${col}) AS m, COUNT(*) AS n FROM assessments
       WHERE ${where} AND ${col} IS NOT NULL GROUP BY m`,
      params,
    )) {
      if (r.m) m.set(r.m, Number(r.n));
    }
    return m;
  };

  const [surveys, completions] = await Promise.all([
    grab("survey_date"),
    grab("completion_date"),
  ]);

  const keys = [...new Set([...surveys.keys(), ...completions.keys()])].sort();
  if (keys.length === 0) return [];

  const last = keys[keys.length - 1];
  const [ly, lm] = last.split("-").map(Number);
  const axis: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ly, lm - 1 - i, 1));
    axis.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return axis.map((month) => ({
    month,
    surveys: surveys.get(month) ?? 0,
    completions: completions.get(month) ?? 0,
  }));
}

export type LocationRow = { location: string; total: number; completed: number };

export async function byLocation(f: Filters, actor: Actor, top = 8): Promise<LocationRow[]> {
  const { sql: where, params } = buildWhere(f, actor);
  const rows = (
    await all<{ location: string | null; total: number; completed: number }>(
      `SELECT COALESCE(NULLIF(location, ''), '(unspecified)') AS location,
              COUNT(*) AS total,
              SUM(CASE WHEN completion_status = 'Completed' THEN 1 ELSE 0 END) AS completed
       FROM assessments WHERE ${where}
       GROUP BY location ORDER BY total DESC`,
      params,
    )
  ).map((r) => ({
    location: r.location ?? "(unspecified)",
    total: Number(r.total),
    completed: Number(r.completed),
  }));

  if (rows.length <= top) return rows;
  const head = rows.slice(0, top);
  const tail = rows.slice(top);
  head.push({
    location: `Other (${tail.length})`,
    total: tail.reduce((a, b) => a + b.total, 0),
    completed: tail.reduce((a, b) => a + b.completed, 0),
  });
  return head;
}

/** Full filtered set, unpaginated - used by CSV export. */
export async function exportRows(f: Filters, actor: Actor): Promise<Assessment[]> {
  const { sql: where, params } = buildWhere(f, actor);
  return (
    await all<Row>(
      `SELECT ${SELECT_COLS} FROM assessments WHERE ${where}
       ORDER BY ${orderBy(f)}`,
      params,
    )
  ).map(toAssessment);
}

/* ---------------------------------------------------------------------------
   Rail counts.

   Deliberately NOT scoped by the current filters: a saved view's count has to
   mean the same thing wherever you are standing, otherwise the rail lies.
--------------------------------------------------------------------------- */

export type RailCounts = {
  all: number;
  overdue: number;
  awaiting: number;
  issues: number;
  unscheduled: number;
};

export async function railCounts(actor: Actor): Promise<RailCounts> {
  const scope = visibleTo(actor);
  const r = await first<Record<string, number | null>>(
    `SELECT
       COUNT(*)                                                  AS all_,
       SUM(CASE WHEN ${SQL_OVERDUE} THEN 1 ELSE 0 END)           AS overdue,
       SUM(CASE WHEN ${SQL_AWAITING} THEN 1 ELSE 0 END)          AS awaiting,
       SUM(CASE WHEN ${SQL_HAS_ISSUES} THEN 1 ELSE 0 END)        AS issues,
       SUM(CASE WHEN survey_date IS NULL THEN 1 ELSE 0 END)      AS unscheduled
     FROM assessments WHERE deleted_at IS NULL AND ${scope.sql}`,
    scope.params,
  );
  return {
    all: Number(r?.all_ ?? 0),
    overdue: Number(r?.overdue ?? 0),
    awaiting: Number(r?.awaiting ?? 0),
    issues: Number(r?.issues ?? 0),
    unscheduled: Number(r?.unscheduled ?? 0),
  };
}

export async function locationCounts(
  actor: Actor,
  limit = 4,
): Promise<{ location: string; count: number; total: number }[]> {
  const scope = visibleTo(actor);
  const rows = await all<{ location: string; n: number }>(
    `SELECT location, COUNT(*) AS n FROM assessments
     WHERE deleted_at IS NULL AND ${scope.sql}
       AND location IS NOT NULL AND location <> ''
     GROUP BY location ORDER BY n DESC, location COLLATE NOCASE`,
    scope.params,
  );
  return rows.slice(0, limit).map((r) => ({
    location: r.location,
    count: Number(r.n),
    total: rows.length,
  }));
}

/** Small, fast lookup for the command palette. */
export async function quickSearch(q: string, actor: Actor, limit = 6): Promise<Assessment[]> {
  const { sql: where, params } = buildWhere({ ...EMPTY_FILTERS, q }, actor);
  return (
    await all<Row>(
      `SELECT ${SELECT_COLS} FROM assessments WHERE ${where}
       ORDER BY updated_at DESC LIMIT ?`,
      [...params, limit],
    )
  ).map(toAssessment);
}

const EMPTY_FILTERS: Filters = {
  q: "", surveyStatus: [], completionStatus: [], anyStatus: [], location: [],
  surveyFrom: "", surveyTo: "", completionFrom: "", completionTo: "",
  flags: [], origin: "", sorts: DEFAULT_SORTS, page: 1, perPage: 10,
};

/* ---------------------------------------------------------------------------
   Notes

   A record's running commentary. Kept separate from `remarks` on purpose:
   remarks is one field that came from the spreadsheet and gets overwritten,
   notes accumulate and are dated.
--------------------------------------------------------------------------- */

export type Note = {
  id: number;
  assessmentId: number;
  body: string;
  createdAt: string;
};

export async function listNotes(assessmentId: number, actor: Actor): Promise<Note[]> {
  const scope = visibleTo(actor);
  return (
    await all<{ id: number; assessment_id: number; body: string; created_at: string }>(
      `SELECT n.id, n.assessment_id, n.body, n.created_at FROM notes n
       JOIN assessments a ON a.id = n.assessment_id
       WHERE n.assessment_id = ? AND n.deleted_at IS NULL
         AND a.deleted_at IS NULL AND ${scope.sql.replace("created_by", "a.created_by")}
       ORDER BY n.created_at DESC, n.id DESC`,
      [assessmentId, ...scope.params],
    )
  ).map((r) => ({
    id: r.id,
    assessmentId: r.assessment_id,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addNote(assessmentId: number, body: string, actor: Actor): Promise<number> {
  const scope = visibleTo(actor);
  const info = await run(
    `INSERT INTO notes (assessment_id, body, created_at, author_id)
     SELECT a.id, ?, ?, ?
       FROM assessments a
      WHERE a.id = ? AND a.deleted_at IS NULL
        AND ${scope.sql.replace("created_by", "a.created_by")}`,
    [body, now(), actor.id, assessmentId, ...scope.params],
  );
  if (info.changes > 0) {
    await logActivity(actor.id, "create", "note", info.lastInsertRowid, { assessmentId });
  }
  return info.lastInsertRowid;
}

export async function deleteNote(
  noteId: number,
  assessmentId: number,
  actor: Actor,
): Promise<number> {
  const scope = visibleTo(actor);
  const info = await run(
    `UPDATE notes SET deleted_at = ?
     WHERE id = ? AND assessment_id = ? AND deleted_at IS NULL
       AND assessment_id IN (
         SELECT id FROM assessments WHERE deleted_at IS NULL AND ${scope.sql}
       )`,
    [now(), noteId, assessmentId, ...scope.params],
  );
  if (info.changes > 0) await logActivity(actor.id, "delete", "note", noteId, { assessmentId });
  return info.changes;
}

/* ---------------------------------------------------------------------------
   Single-field and custom-field edits

   The core fields go through the full form; everything else is edited one
   field at a time, so a typo in a note never blocks fixing a date.
--------------------------------------------------------------------------- */

/** Columns editable one at a time, outside the main form. */
export const INLINE_FIELDS = { remarks: "remarks" } as const;
export type InlineField = keyof typeof INLINE_FIELDS;

export async function updateInlineField(
  id: number,
  field: InlineField,
  value: string | null,
  actor: Actor,
): Promise<void> {
  const scope = visibleTo(actor);
  const changed = await run(
    `UPDATE assessments SET ${INLINE_FIELDS[field]} = ?, updated_at = ?, updated_by = ?
     WHERE id = ? AND deleted_at IS NULL AND ${scope.sql}`,
    [value, now(), actor.id, id, ...scope.params],
  );
  if (changed.changes > 0) await logActivity(actor.id, "update", "assessment", id, { field });
}

/** Custom fields live in the `extras` JSON blob - the room a record has to
 *  carry information this app never modelled. */
export async function setExtra(
  id: number,
  key: string,
  value: string,
  actor: Actor,
): Promise<void> {
  const current = await getAssessment(id, actor);
  if (!current) return;
  const next = { ...current.extras, [key]: value };
  const scope = visibleTo(actor);
  await run(
    `UPDATE assessments SET extras = ?, updated_at = ?, updated_by = ?
     WHERE id = ? AND ${scope.sql}`,
    [JSON.stringify(next), now(), actor.id, id, ...scope.params],
  );
  await logActivity(actor.id, "update", "assessment", id, { extra: key });
}

export async function removeExtra(id: number, key: string, actor: Actor): Promise<void> {
  const current = await getAssessment(id, actor);
  if (!current) return;
  const next = { ...current.extras };
  delete next[key];
  const scope = visibleTo(actor);
  await run(
    `UPDATE assessments SET extras = ?, updated_at = ?, updated_by = ?
     WHERE id = ? AND ${scope.sql}`,
    [JSON.stringify(next), now(), actor.id, id, ...scope.params],
  );
  await logActivity(actor.id, "update", "assessment", id, { removedExtra: key });
}

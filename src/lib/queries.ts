import { db, rows } from "./db";
import type { SQLInputValue } from "node:sqlite";
import type { Filters } from "./filters";
import { DEFAULT_SORTS, SORTABLE } from "./filters";
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

export function buildWhere(f: Filters): { sql: string; params: SQLInputValue[] } {
  const clauses: string[] = ["deleted_at IS NULL"];
  const params: SQLInputValue[] = [];

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

/** ORDER BY for a multi-level sort. NULLS LAST at every level regardless of
 *  direction: an empty date is "unknown", not "oldest". */
function orderBy(f: Filters): string {
  const levels = (f.sorts.length ? f.sorts : DEFAULT_SORTS).map((s) => {
    const col = SORTABLE[s.key];
    return `(${col} IS NULL) ASC, ${col} ${s.dir === "asc" ? "ASC" : "DESC"}`;
  });
  return [...levels, "id DESC"].join(", ");
}

export function listAssessments(f: Filters): ListResult {
  const { sql: where, params } = buildWhere(f);

  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS n FROM assessments WHERE ${where}`).get(...params) as { n: number }).n,
  );

  const pageCount = Math.max(1, Math.ceil(total / f.perPage));
  const page = Math.min(f.page, pageCount);
  const offset = (page - 1) * f.perPage;

  const items = rows<Row>(
    db.prepare(
      `SELECT ${SELECT_COLS} FROM assessments
       WHERE ${where}
       ORDER BY ${orderBy(f)}
       LIMIT ? OFFSET ?`,
    ),
    ...params,
    f.perPage,
    offset,
  ).map(toAssessment);

  return { items, total, page, perPage: f.perPage, pageCount };
}

/** Facet counts for the filter bar. Computed against every *other* facet but
 *  not against the facet's own selection, so a chip never shows "0" for the
 *  value you just picked. */
export function facetCounts(
  f: Filters,
  facet: "surveyStatus" | "completionStatus" | "location",
): Map<string, number> {
  const cleared: Filters = { ...f, [facet]: [] } as Filters;
  const { sql: where, params } = buildWhere(cleared);
  const col =
    facet === "surveyStatus" ? "survey_status"
    : facet === "completionStatus" ? "completion_status"
    : "location";

  const out = new Map<string, number>();
  for (const r of rows<{ v: string | null; n: number }>(
    db.prepare(
      `SELECT ${col} AS v, COUNT(*) AS n FROM assessments
       WHERE ${where} AND ${col} IS NOT NULL
       GROUP BY ${col} ORDER BY n DESC`,
    ),
    ...params,
  )) {
    if (r.v != null) out.set(r.v, Number(r.n));
  }
  return out;
}

export function flagCounts(f: Filters): Record<string, number> {
  const { sql: where, params } = buildWhere({ ...f, flags: [] });
  const r = db
    .prepare(
      `SELECT
         SUM(CASE WHEN ${SQL_OVERDUE} THEN 1 ELSE 0 END)            AS overdue,
         SUM(CASE WHEN ${SQL_AWAITING} THEN 1 ELSE 0 END)           AS awaiting,
         SUM(CASE WHEN ${SQL_HAS_ISSUES} THEN 1 ELSE 0 END)         AS issues,
         SUM(CASE WHEN completion_date IS NULL THEN 1 ELSE 0 END)   AS noCompletionDate,
         SUM(CASE WHEN survey_date IS NULL THEN 1 ELSE 0 END)       AS unscheduled
       FROM assessments WHERE ${where}`,
    )
    .get(...params) as Record<string, number | null>;
  return {
    overdue: Number(r.overdue ?? 0),
    awaiting: Number(r.awaiting ?? 0),
    issues: Number(r.issues ?? 0),
    "no-completion-date": Number(r.noCompletionDate ?? 0),
    unscheduled: Number(r.unscheduled ?? 0),
  };
}

/** Every location on record - the filter dropdown needs the full list, not
 *  just the ones surviving the current filter. */
export function allLocations(): string[] {
  return rows<{ location: string }>(
    db.prepare(
      `SELECT DISTINCT location FROM assessments
       WHERE deleted_at IS NULL AND location IS NOT NULL AND location <> ''
       ORDER BY location COLLATE NOCASE`,
    ),
  ).map((r) => r.location);
}

/* ---------------------------------------------------------------------------
   CRUD
--------------------------------------------------------------------------- */

export function getAssessment(id: number): Assessment | null {
  const r = db
    .prepare(`SELECT ${SELECT_COLS} FROM assessments WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as Row | undefined;
  return r ? toAssessment({ ...r }) : null;
}

export function assessmentIdExists(assessmentId: string, exceptId?: number): boolean {
  const r = db
    .prepare(
      `SELECT id FROM assessments
       WHERE assessment_id = ? AND deleted_at IS NULL AND id <> ?`,
    )
    .get(assessmentId, exceptId ?? -1) as { id: number } | undefined;
  return !!r;
}

export function createAssessment(input: AssessmentInput, origin: "manual" | "import" = "manual"): number {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO assessments
        (assessment_id, name, location, assessor, survey_date, survey_status,
         completion_date, completion_status, remarks, origin, extras, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
    )
    .run(
      input.assessmentId, input.name, input.location, input.assessor,
      input.surveyDate, input.surveyStatus ?? null,
      input.completionDate, input.completionStatus ?? null,
      input.remarks, origin, now, now,
    );
  return Number(info.lastInsertRowid);
}

export function updateAssessment(id: number, input: AssessmentInput): void {
  db.prepare(
    `UPDATE assessments SET
       assessment_id = ?, name = ?, location = ?, assessor = ?,
       survey_date = ?, survey_status = ?, completion_date = ?,
       completion_status = ?, remarks = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
  ).run(
    input.assessmentId, input.name, input.location, input.assessor,
    input.surveyDate, input.surveyStatus ?? null,
    input.completionDate, input.completionStatus ?? null,
    input.remarks, new Date().toISOString(), id,
  );
}

/** Soft delete - rows stay recoverable straight from the DB file. */
export function deleteAssessments(ids: number[]): number {
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `UPDATE assessments SET deleted_at = ?, updated_at = ?
       WHERE id IN (${placeholders(ids.length)}) AND deleted_at IS NULL`,
    )
    .run(now, now, ...ids);
  return Number(info.changes);
}

export function bulkSetStatus(
  ids: number[],
  field: "survey_status" | "completion_status",
  value: string,
): number {
  if (!ids.length) return 0;
  const info = db
    .prepare(
      `UPDATE assessments SET ${field} = ?, updated_at = ?
       WHERE id IN (${placeholders(ids.length)}) AND deleted_at IS NULL`,
    )
    .run(value, new Date().toISOString(), ...ids);
  return Number(info.changes);
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

export function summary(f: Filters): Summary {
  const { sql: where, params } = buildWhere(f);
  const r = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN survey_status = 'Completed' THEN 1 ELSE 0 END)     AS surveysDone,
         SUM(CASE WHEN completion_status = 'Completed' THEN 1 ELSE 0 END) AS completionsDone,
         SUM(CASE WHEN survey_status = 'Completed' AND ${SQL_COMPLETION_OPEN} THEN 1 ELSE 0 END) AS inFlight,
         SUM(CASE WHEN ${SQL_OVERDUE} THEN 1 ELSE 0 END)                  AS overdue,
         SUM(CASE WHEN ${SQL_HAS_ISSUES} THEN 1 ELSE 0 END)               AS issues
       FROM assessments WHERE ${where}`,
    )
    .get(...params) as Record<string, number | null>;

  const durations = rows<{ d: number }>(
    db.prepare(
      `SELECT julianday(completion_date) - julianday(survey_date) AS d
       FROM assessments
       WHERE ${where} AND survey_date IS NOT NULL AND completion_date IS NOT NULL
         AND completion_status = 'Completed'
       ORDER BY d`,
    ),
    ...params,
  ).map((x) => Number(x.d));

  const median =
    durations.length === 0
      ? null
      : durations.length % 2
        ? durations[(durations.length - 1) / 2]
        : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2;

  return {
    total: Number(r.total ?? 0),
    surveysDone: Number(r.surveysDone ?? 0),
    completionsDone: Number(r.completionsDone ?? 0),
    inFlight: Number(r.inFlight ?? 0),
    overdue: Number(r.overdue ?? 0),
    issues: Number(r.issues ?? 0),
    medianDaysToComplete: median == null ? null : Math.round(median),
  };
}

export type StatusSlice = { status: string; count: number };

export function statusBreakdown(f: Filters, phase: "survey" | "completion"): StatusSlice[] {
  const def = PHASES.find((p) => p.key === phase)!;
  const col = def.statusField === "surveyStatus" ? "survey_status" : "completion_status";
  const { sql: where, params } = buildWhere(f);
  const counts = new Map<string, number>();
  for (const r of rows<{ v: string | null; n: number }>(
    db.prepare(
      `SELECT ${col} AS v, COUNT(*) AS n FROM assessments WHERE ${where} GROUP BY ${col}`,
    ),
    ...params,
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
export function monthlyActivity(f: Filters, months = 12): MonthPoint[] {
  const { sql: where, params } = buildWhere(f);
  const grab = (col: string) => {
    const m = new Map<string, number>();
    for (const r of rows<{ m: string; n: number }>(
      db.prepare(
        `SELECT strftime('%Y-%m', ${col}) AS m, COUNT(*) AS n FROM assessments
         WHERE ${where} AND ${col} IS NOT NULL GROUP BY m`,
      ),
      ...params,
    )) {
      if (r.m) m.set(r.m, Number(r.n));
    }
    return m;
  };
  const surveys = grab("survey_date");
  const completions = grab("completion_date");

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

export function byLocation(f: Filters, top = 8): LocationRow[] {
  const { sql: where, params } = buildWhere(f);
  const all = rows<{ location: string | null; total: number; completed: number }>(
    db.prepare(
      `SELECT COALESCE(NULLIF(location, ''), '(unspecified)') AS location,
              COUNT(*) AS total,
              SUM(CASE WHEN completion_status = 'Completed' THEN 1 ELSE 0 END) AS completed
       FROM assessments WHERE ${where}
       GROUP BY location ORDER BY total DESC`,
    ),
    ...params,
  ).map((r) => ({
    location: r.location ?? "(unspecified)",
    total: Number(r.total),
    completed: Number(r.completed),
  }));

  if (all.length <= top) return all;
  const head = all.slice(0, top);
  const tail = all.slice(top);
  head.push({
    location: `Other (${tail.length})`,
    total: tail.reduce((a, b) => a + b.total, 0),
    completed: tail.reduce((a, b) => a + b.completed, 0),
  });
  return head;
}

/** Full filtered set, unpaginated - used by CSV export. */
export function exportRows(f: Filters): Assessment[] {
  const { sql: where, params } = buildWhere(f);
  return rows<Row>(
    db.prepare(
      `SELECT ${SELECT_COLS} FROM assessments WHERE ${where}
       ORDER BY ${orderBy(f)}`,
    ),
    ...params,
  ).map(toAssessment);
}

export function allAssessors(): string[] {
  return rows<{ assessor: string }>(
    db.prepare(
      `SELECT DISTINCT assessor FROM assessments
       WHERE deleted_at IS NULL AND assessor IS NOT NULL AND assessor <> ''
       ORDER BY assessor COLLATE NOCASE`,
    ),
  ).map((r) => r.assessor);
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

export function railCounts(): RailCounts {
  const r = db
    .prepare(
      `SELECT
         COUNT(*)                                                  AS all_,
         SUM(CASE WHEN ${SQL_OVERDUE} THEN 1 ELSE 0 END)           AS overdue,
         SUM(CASE WHEN ${SQL_AWAITING} THEN 1 ELSE 0 END)          AS awaiting,
         SUM(CASE WHEN ${SQL_HAS_ISSUES} THEN 1 ELSE 0 END)        AS issues,
         SUM(CASE WHEN survey_date IS NULL THEN 1 ELSE 0 END)      AS unscheduled
       FROM assessments WHERE deleted_at IS NULL`,
    )
    .get() as Record<string, number | null>;
  return {
    all: Number(r.all_ ?? 0),
    overdue: Number(r.overdue ?? 0),
    awaiting: Number(r.awaiting ?? 0),
    issues: Number(r.issues ?? 0),
    unscheduled: Number(r.unscheduled ?? 0),
  };
}

export function locationCounts(limit = 4): { location: string; count: number; total: number }[] {
  const all = rows<{ location: string; n: number }>(
    db.prepare(
      `SELECT location, COUNT(*) AS n FROM assessments
       WHERE deleted_at IS NULL AND location IS NOT NULL AND location <> ''
       GROUP BY location ORDER BY n DESC, location COLLATE NOCASE`,
    ),
  );
  return all.slice(0, limit).map((r) => ({
    location: r.location,
    count: Number(r.n),
    total: all.length,
  }));
}

/** Small, fast lookup for the command palette. */
export function quickSearch(q: string, limit = 6): Assessment[] {
  const f = { ...EMPTY_FILTERS, q };
  const { sql: where, params } = buildWhere(f as Filters);
  return rows<Row>(
    db.prepare(
      `SELECT ${SELECT_COLS} FROM assessments WHERE ${where}
       ORDER BY updated_at DESC LIMIT ?`,
    ),
    ...params,
    limit,
  ).map(toAssessment);
}

const EMPTY_FILTERS: Filters = {
  q: "", surveyStatus: [], completionStatus: [], anyStatus: [], location: [],
  surveyFrom: "", surveyTo: "", completionFrom: "", completionTo: "",
  flags: [], origin: "", sorts: DEFAULT_SORTS, page: 1, perPage: 10,
};

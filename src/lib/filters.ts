import { COMPLETION_STATUSES, SURVEY_STATUSES } from "./schema";

export const FLAGS = [
  { key: "overdue", label: "Overdue" },
  { key: "awaiting", label: "Awaiting completion" },
  { key: "issues", label: "Has data issues" },
  { key: "no-completion-date", label: "Missing completion date" },
  { key: "unscheduled", label: "No survey date" },
] as const;

export type FlagKey = (typeof FLAGS)[number]["key"];

export const SORTABLE = {
  assessmentId: "assessment_id",
  name: "name",
  location: "location",
  assessor: "assessor",
  surveyDate: "survey_date",
  surveyStatus: "survey_status",
  completionDate: "completion_date",
  completionStatus: "completion_status",
  updatedAt: "updated_at",
} as const;

export type SortKey = keyof typeof SORTABLE;

export type Filters = {
  q: string;
  surveyStatus: string[];
  completionStatus: string[];
  anyStatus: string[];
  location: string[];
  surveyFrom: string;
  surveyTo: string;
  completionFrom: string;
  completionTo: string;
  flags: FlagKey[];
  origin: "" | "manual" | "import";
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
  perPage: number;
};

export const DEFAULT_PER_PAGE = 50;
export const PER_PAGE_OPTIONS = [25, 50, 100, 200];

const ALL_STATUSES: string[] = [...SURVEY_STATUSES, ...COMPLETION_STATUSES];

/** Next passes searchParams as string | string[] | undefined. */
export type RawParams = Record<string, string | string[] | undefined>;

function list(raw: RawParams, key: string): string[] {
  const v = raw[key];
  if (v == null) return [];
  const parts = Array.isArray(v) ? v : [v];
  return parts.flatMap((p) => p.split(",")).map((p) => p.trim()).filter(Boolean);
}

function one(raw: RawParams, key: string): string {
  const v = raw[key];
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? "").trim();
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const date = (raw: RawParams, key: string) => {
  const v = one(raw, key);
  return ISO.test(v) ? v : "";
};

export function parseFilters(raw: RawParams): Filters {
  const sortRaw = one(raw, "sort") as SortKey;
  const perPage = Number(one(raw, "perPage"));
  const page = Number(one(raw, "page"));

  return {
    q: one(raw, "q").slice(0, 200),
    surveyStatus: list(raw, "surveyStatus").filter((s) =>
      (SURVEY_STATUSES as readonly string[]).includes(s),
    ),
    completionStatus: list(raw, "completionStatus").filter((s) =>
      (COMPLETION_STATUSES as readonly string[]).includes(s),
    ),
    anyStatus: list(raw, "anyStatus").filter((s) => ALL_STATUSES.includes(s)),
    location: list(raw, "location"),
    surveyFrom: date(raw, "surveyFrom"),
    surveyTo: date(raw, "surveyTo"),
    completionFrom: date(raw, "completionFrom"),
    completionTo: date(raw, "completionTo"),
    flags: list(raw, "flags").filter((f): f is FlagKey =>
      FLAGS.some((x) => x.key === f),
    ),
    origin: (["manual", "import"] as const).includes(one(raw, "origin") as never)
      ? (one(raw, "origin") as "manual" | "import")
      : "",
    sort: sortRaw in SORTABLE ? sortRaw : "updatedAt",
    dir: one(raw, "dir") === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    perPage: PER_PAGE_OPTIONS.includes(perPage) ? perPage : DEFAULT_PER_PAGE,
  };
}

/** How many facets are actually narrowing the result set (search excluded). */
export function activeFilterCount(f: Filters): number {
  return (
    f.surveyStatus.length +
    f.completionStatus.length +
    f.anyStatus.length +
    f.location.length +
    f.flags.length +
    (f.origin ? 1 : 0) +
    (f.surveyFrom ? 1 : 0) +
    (f.surveyTo ? 1 : 0) +
    (f.completionFrom ? 1 : 0) +
    (f.completionTo ? 1 : 0)
  );
}

/** Serialise back to a query string, dropping defaults so URLs stay short and
 *  a view is shareable/bookmarkable. */
export function toQueryString(f: Partial<Filters>): string {
  const p = new URLSearchParams();
  const add = (k: string, v: string) => v && p.append(k, v);
  add("q", f.q ?? "");
  for (const k of ["surveyStatus", "completionStatus", "anyStatus", "location", "flags"] as const) {
    for (const v of (f[k] as string[] | undefined) ?? []) p.append(k, v);
  }
  add("surveyFrom", f.surveyFrom ?? "");
  add("surveyTo", f.surveyTo ?? "");
  add("completionFrom", f.completionFrom ?? "");
  add("completionTo", f.completionTo ?? "");
  add("origin", f.origin ?? "");
  if (f.sort && f.sort !== "updatedAt") add("sort", f.sort);
  if (f.dir && f.dir !== "desc") add("dir", f.dir);
  if (f.perPage && f.perPage !== DEFAULT_PER_PAGE) add("perPage", String(f.perPage));
  if (f.page && f.page > 1) add("page", String(f.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

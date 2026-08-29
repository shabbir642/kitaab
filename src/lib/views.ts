import { parseFilters, type Filters, type RawParams } from "./filters";

/* ---------------------------------------------------------------------------
   Saved views.

   The rail replaces the old row of dropdowns: the handful of questions that
   actually get asked become named, counted destinations. Ad-hoc filtering
   still exists on top of whichever view you are standing in.
--------------------------------------------------------------------------- */

export type ViewIcon = "list" | "overdue" | "awaiting" | "issues" | "unscheduled";

export type SavedView = {
  key: string;
  name: string;
  description: string;
  icon: ViewIcon;
  /** query string (without "?") that produces this view */
  query: string;
  /** which railCounts() field carries this view's number */
  countKey: "all" | "overdue" | "awaiting" | "issues" | "unscheduled";
};

export const VIEWS: readonly SavedView[] = [
  {
    key: "all",
    name: "All records",
    description: "Every record in the book",
    icon: "list",
    query: "",
    countKey: "all",
  },
  {
    key: "overdue",
    name: "Overdue",
    description: "Survey completed, completion still open past 14 days",
    icon: "overdue",
    query: "flags=overdue",
    countKey: "overdue",
  },
  {
    key: "awaiting",
    name: "Awaiting completion",
    description: "Survey done, completion phase still running",
    icon: "awaiting",
    query: "flags=awaiting",
    countKey: "awaiting",
  },
  {
    key: "issues",
    name: "Data issues",
    description: "Records whose dates and statuses contradict each other",
    icon: "issues",
    query: "flags=issues",
    countKey: "issues",
  },
  {
    key: "unscheduled",
    name: "No survey date",
    description: "Nothing scheduled yet",
    icon: "unscheduled",
    query: "flags=unscheduled",
    countKey: "unscheduled",
  },
] as const;

export function viewHref(view: SavedView): string {
  return view.query ? `/assessments?${view.query}` : "/assessments";
}

export function locationHref(location: string): string {
  return `/assessments?location=${encodeURIComponent(location)}`;
}

/** Everything that narrows the result set, ignoring sort/page/density. Two
 *  filter states with the same signature show the same records. */
export function facetSignature(f: Filters): string {
  return JSON.stringify([
    f.q,
    [...f.surveyStatus].sort(),
    [...f.completionStatus].sort(),
    [...f.anyStatus].sort(),
    [...f.location].sort(),
    f.surveyFrom,
    f.surveyTo,
    f.completionFrom,
    f.completionTo,
    [...f.flags].sort(),
    f.origin,
  ]);
}

function paramsFromQuery(query: string): RawParams {
  const sp = new URLSearchParams(query);
  const raw: RawParams = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return raw;
}

const SIGNATURES = new Map(
  VIEWS.map((v) => [facetSignature(parseFilters(paramsFromQuery(v.query))), v.key]),
);

/** Which saved view the current filters exactly are, if any. An extra filter
 *  on top of a view means you are no longer "in" it - the rail stops
 *  highlighting rather than pretending. */
export function matchView(f: Filters): string | null {
  return SIGNATURES.get(facetSignature(f)) ?? null;
}

/** Which single-location view the current filters exactly are, if any. */
export function matchLocation(f: Filters): string | null {
  if (f.location.length !== 1) return null;
  const only = facetSignature({ ...f, location: [] } as Filters);
  const bare = facetSignature(parseFilters({}));
  return only === bare ? f.location[0] : null;
}

/** Title and subtitle for the page header, derived from where you are. */
export function headerFor(f: Filters): { title: string; description: string } {
  const view = matchView(f);
  if (view) {
    const v = VIEWS.find((x) => x.key === view)!;
    return { title: v.name, description: v.description };
  }
  const loc = matchLocation(f);
  if (loc) return { title: loc, description: "Every record at this location" };
  if (f.q) return { title: `"${f.q}"`, description: "Search results" };
  return { title: "Filtered records", description: "A view built from the filters below" };
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2, TriangleAlert } from "lucide-react";
import { FacetMenu } from "./FacetMenu";
import { PhaseCell } from "./PhaseCell";
import { bulkStatusAction, deleteRecordsAction } from "@/app/actions";
import { DEFAULT_SORTS, serializeSorts, sortsEqual, type Filters, type SortKey, type SortSpec } from "@/lib/filters";
import { COMPLETION_STATUSES, SURVEY_STATUSES, type Assessment } from "@/lib/schema";
import { cn } from "@/lib/utils";

export type AssessmentRow = Assessment & {
  issues: string[];
  overdueDays: number | null;
  turnaround: number | null;
};

const COLUMNS: {
  key: SortKey | null;
  label: string;
  width: string;
  align?: "right";
}[] = [
  { key: "assessmentId", label: "Assessment", width: "152px" },
  { key: "name", label: "Name", width: "auto" },
  { key: "location", label: "Location", width: "112px" },
  { key: "surveyDate", label: "Progress", width: "254px" },
  { key: "assessor", label: "Assessor", width: "116px" },
  { key: null, label: "Age", width: "68px", align: "right" },
];

export function DataTable({
  rows,
  filters,
  returnTo,
}: {
  rows: AssessmentRow[];
  filters: Filters;
  returnTo: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lastRows, setLastRows] = useState(rows);

  if (lastRows !== rows) {
    setLastRows(rows);
    setSelected(new Set());
  }

  /** Click sorts by that column; shift-click adds it as a tie-breaker under
   *  whatever is already there. */
  const sortBy = (key: SortKey, append: boolean) => {
    const existing = filters.sorts.find((s) => s.key === key);
    const flipped: SortSpec = { key, dir: existing?.dir === "asc" ? "desc" : "asc" };
    const next = append
      ? existing
        ? filters.sorts.map((s) => (s.key === key ? flipped : s))
        : [...filters.sorts, { key, dir: "asc" as const }].slice(0, 4)
      : [flipped];

    const p = new URLSearchParams(searchParams.toString());
    p.delete("page");
    if (sortsEqual(next, DEFAULT_SORTS)) p.delete("sort");
    else p.set("sort", serializeSorts(next));
    const qs = p.toString();
    router.push(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  };

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const ids = [...selected];

  return (
    <div className="relative">
      {ids.length > 0 && (
        <div className="sticky top-0 z-20 mb-2 hidden flex-wrap items-center gap-2 rounded-lg border border-hairline-strong bg-surface-raised px-3 py-2 shadow-sm md:flex">
          <span className="text-xs font-medium tabular-nums">{ids.length} selected</span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-ink-secondary underline-offset-2 hover:underline"
          >
            Clear
          </button>
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
          <BulkStatus ids={ids} field="survey_status" label="Set survey status" options={SURVEY_STATUSES} returnTo={returnTo} />
          <BulkStatus ids={ids} field="completion_status" label="Set completion status" options={COMPLETION_STATUSES} returnTo={returnTo} />
          <form action={deleteRecordsAction} className="ml-auto">
            {ids.map((id) => (
              <input key={id} type="hidden" name="id" value={id} />
            ))}
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              className="flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2 text-xs font-medium hover:bg-surface-sunken"
            >
              <Trash2 size={12} strokeWidth={2} style={{ color: "var(--status-critical)" }} />
              Delete
            </button>
          </form>
        </div>
      )}

      {/* Below md a phone shows two of seven columns, so the same rows are
          rendered as cards instead - nothing important ends up off-screen. */}
      <ul className="divide-y divide-[var(--border)] border-t border-hairline md:hidden">
        {rows.length === 0 && (
          <li className="py-16 text-center">
            <p className="text-sm font-medium">Nothing here</p>
            <p className="mt-1 text-xs text-ink-secondary">
              No records match this view. Try another one, or drop a filter.
            </p>
          </li>
        )}
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/assessments/${r.id}`}
              className="block px-1 py-3 transition-colors active:bg-surface-sunken"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] font-medium">{r.assessmentId}</span>
                {r.origin === "manual" && (
                  <span className="rounded border border-hairline px-1 text-[10px] text-ink-muted">
                    manual
                  </span>
                )}
                {r.overdueDays != null && (
                  <span
                    className="ml-auto text-[11px] font-medium tabular-nums"
                    style={{ color: "var(--status-critical)" }}
                  >
                    {r.overdueDays}d
                  </span>
                )}
              </div>

              <p className="mt-1 flex items-start gap-1.5 text-[13px] font-medium leading-snug">
                {r.issues.length > 0 && (
                  <TriangleAlert
                    size={12}
                    strokeWidth={2.25}
                    style={{ color: "var(--status-warning)" }}
                    className="mt-[3px] shrink-0"
                    aria-label={`${r.issues.length} data issue${r.issues.length === 1 ? "" : "s"}`}
                  />
                )}
                {r.name}
              </p>

              {r.remarks && (
                <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">{r.remarks}</p>
              )}

              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-secondary">
                <span>{r.location ?? "—"}</span>
                <span className="text-ink-muted" aria-hidden>·</span>
                <span className="truncate">{r.assessor ?? "Unassigned"}</span>
              </p>

              <div className="mt-2">
                <PhaseCell
                  surveyStatus={r.surveyStatus}
                  surveyDate={r.surveyDate}
                  completionStatus={r.completionStatus}
                  completionDate={r.completionDate}
                  overdueDays={r.overdueDays}
                  turnaround={r.turnaround}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto thin-scroll md:block">
        <table className="w-full min-w-[1020px] border-collapse text-left">
          <colgroup>
            <col style={{ width: "34px" }} />
            {COLUMNS.map((c) => (
              <col key={c.label} style={c.width === "auto" ? undefined : { width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="py-2 pl-1">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                  aria-label="Select all rows on this page"
                  className="size-4 accent-[var(--accent)]"
                />
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap py-2 pr-4 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-muted",
                    c.align === "right" && "pr-1 text-right",
                  )}
                >
                  {c.key ? (
                    <SortHeader
                      label={c.label}
                      level={filters.sorts.findIndex((x) => x.key === c.key)}
                      dir={filters.sorts.find((x) => x.key === c.key)?.dir}
                      multi={filters.sorts.length > 1}
                      onSort={(append) => sortBy(c.key!, append)}
                    />
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="py-20 text-center">
                  <p className="text-sm font-medium">Nothing here</p>
                  <p className="mt-1 text-xs text-ink-secondary">
                    No records match this view. Try another one, or drop a filter.
                  </p>
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("input,button,a,form,label")) return;
                  router.push(`/assessments/${r.id}`);
                }}
                className={cn(
                  "h-[52px] cursor-pointer border-b border-hairline transition-colors hover:bg-surface-sunken",
                  selected.has(r.id) && "bg-accent-wash",
                )}
              >
                <td className="pl-1">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    aria-label={`Select ${r.assessmentId}`}
                    className="size-4 accent-[var(--accent)]"
                  />
                </td>
                <td className="pr-4">
                  <Link
                    href={`/assessments/${r.id}`}
                    className="font-mono text-[11px] font-medium underline-offset-2 hover:underline"
                  >
                    {r.assessmentId}
                  </Link>
                </td>
                <td className="max-w-0 pr-4">
                  <span className="flex items-center gap-1.5">
                    {r.issues.length > 0 && (
                      <TriangleAlert
                        size={12}
                        strokeWidth={2.25}
                        style={{ color: "var(--status-warning)" }}
                        aria-label={`${r.issues.length} data issue${r.issues.length === 1 ? "" : "s"}`}
                      />
                    )}
                    <span className="truncate text-[12.5px] font-medium" title={r.name}>
                      {r.name}
                    </span>
                    {r.origin === "manual" && (
                      <span className="shrink-0 rounded border border-hairline px-1 text-[10px] text-ink-muted">
                        manual
                      </span>
                    )}
                  </span>
                  {r.remarks && (
                    <span className="mt-0.5 block truncate text-[11px] text-ink-muted" title={r.remarks}>
                      {r.remarks}
                    </span>
                  )}
                </td>
                <td className="pr-4 text-xs text-ink-secondary">
                  {r.location ?? <span className="text-ink-muted">—</span>}
                </td>
                <td className="pr-4">
                  <PhaseCell
                    surveyStatus={r.surveyStatus}
                    surveyDate={r.surveyDate}
                    completionStatus={r.completionStatus}
                    completionDate={r.completionDate}
                    overdueDays={r.overdueDays}
                    turnaround={r.turnaround}
                  />
                </td>
                <td className="pr-4 text-xs text-ink-secondary">
                  {r.assessor ?? <span className="text-ink-muted">—</span>}
                </td>
                <td
                  className="pr-1 text-right text-xs font-medium tabular-nums"
                  style={{ color: r.overdueDays != null ? "var(--status-critical)" : undefined }}
                >
                  {r.overdueDays != null ? `${r.overdueDays}d` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  level,
  dir,
  multi,
  onSort,
}: {
  label: string;
  level: number;
  dir?: "asc" | "desc";
  multi: boolean;
  onSort: (append: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onSort(e.shiftKey)}
      title="Click to sort. Shift-click to add as a tie-breaker."
      className="inline-flex items-center gap-1 uppercase tracking-[0.06em] hover:text-ink"
    >
      {label}
      {dir &&
        (dir === "asc" ? <ArrowUp size={10} strokeWidth={3} /> : <ArrowDown size={10} strokeWidth={3} />)}
      {dir && multi && (
        <span className="text-[9px] tabular-nums text-ink-muted">{level + 1}</span>
      )}
    </button>
  );
}

function BulkStatus({
  ids,
  field,
  label,
  options,
  returnTo,
}: {
  ids: number[];
  field: "survey_status" | "completion_status";
  label: string;
  options: readonly string[];
  returnTo: string;
}) {
  return (
    <FacetMenu label={label} width="w-48">
      {options.map((o) => (
        <form key={o} action={bulkStatusAction}>
          {ids.map((id) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <input type="hidden" name="field" value={field} />
          <input type="hidden" name="value" value={o} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-sunken"
          >
            {o}
          </button>
        </form>
      ))}
    </FacetMenu>
  );
}

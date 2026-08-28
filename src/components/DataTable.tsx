"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Trash2 } from "lucide-react";
import { IssueBadge, OverdueBadge, StatusBadge } from "./StatusBadge";
import { FacetMenu } from "./FacetMenu";
import { bulkStatusAction, deleteRecordsAction } from "@/app/actions";
import type { Filters, SortKey } from "@/lib/filters";
import { COMPLETION_STATUSES, SURVEY_STATUSES, type Assessment } from "@/lib/schema";
import { cn, formatDate } from "@/lib/utils";

export type AssessmentRow = Assessment & {
  issues: string[];
  overdueDays: number | null;
};

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "assessmentId", label: "Assessment ID" },
  { key: "name", label: "Name" },
  { key: "location", label: "Location" },
  { key: "surveyDate", label: "Survey" },
  { key: "completionDate", label: "Completion" },
  { key: null, label: "Flags" },
  { key: "assessor", label: "Assessor" },
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

  // Selection is meaningless once the underlying page changes.
  if (lastRows !== rows) {
    setLastRows(rows);
    setSelected(new Set());
  }

  const sortHref = (key: SortKey) => {
    const p = new URLSearchParams(searchParams.toString());
    const nextDir = filters.sort === key && filters.dir === "asc" ? "desc" : "asc";
    p.set("sort", key);
    p.set("dir", nextDir);
    p.delete("page");
    return `?${p.toString()}`;
  };

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = [...selected];

  return (
    <div className="relative">
      {ids.length > 0 && (
        <div className="sticky top-13 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-hairline-strong bg-surface-raised px-3 py-2 shadow-sm">
          <span className="text-xs font-medium tabular-nums">
            {ids.length} selected
          </span>
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
              className="flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2 text-xs font-medium text-ink hover:bg-surface-sunken"
            >
              <Trash2 size={12} strokeWidth={2} style={{ color: "var(--status-critical)" }} />
              Delete
            </button>
          </form>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-hairline bg-surface thin-scroll">
        <table className="w-full min-w-[980px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-hairline bg-surface-sunken/60">
              <th scope="col" className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all rows on this page"
                  className="size-3.5 accent-[var(--accent)]"
                />
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={cn(
                    "px-3 py-2 font-medium text-ink-secondary whitespace-nowrap",
                    c.className,
                  )}
                >
                  {c.key ? (
                    <Link
                      href={sortHref(c.key)}
                      scroll={false}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      {c.label}
                      {filters.sort === c.key ? (
                        filters.dir === "asc" ? (
                          <ArrowUp size={11} strokeWidth={2.5} />
                        ) : (
                          <ArrowDown size={11} strokeWidth={2.5} />
                        )
                      ) : (
                        <ChevronsUpDown size={11} strokeWidth={2} className="text-ink-muted opacity-0 transition-opacity group-hover/head:opacity-100" />
                      )}
                    </Link>
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
                <td colSpan={COLUMNS.length + 1} className="px-3 py-16 text-center">
                  <p className="text-sm font-medium">No records match these filters</p>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Try clearing a filter, or add a record.
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
                  "cursor-pointer border-b border-hairline last:border-0 transition-colors hover:bg-surface-sunken/70",
                  selected.has(r.id) && "bg-accent-wash",
                )}
              >
                <td className="px-3 py-2 align-top">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Select ${r.assessmentId}`}
                    className="size-3.5 accent-[var(--accent)]"
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <Link
                    href={`/assessments/${r.id}`}
                    className="font-mono text-[11px] font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {r.assessmentId}
                  </Link>
                </td>
                <td className="max-w-[22rem] px-3 py-2 align-top">
                  <span className="block truncate font-medium text-ink" title={r.name}>
                    {r.name}
                  </span>
                  {r.remarks && (
                    <span className="mt-0.5 block truncate text-[11px] text-ink-muted" title={r.remarks}>
                      {r.remarks}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top whitespace-nowrap text-ink-secondary">
                  {r.location ?? <span className="text-ink-muted">&mdash;</span>}
                </td>
                <PhaseCell status={r.surveyStatus} date={r.surveyDate} />
                <PhaseCell status={r.completionStatus} date={r.completionDate} />
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap gap-1">
                    {r.overdueDays != null && <OverdueBadge days={r.overdueDays} />}
                    <IssueBadge count={r.issues.length} title={r.issues.join("\n")} />
                    {r.origin === "manual" && (
                      <span className="rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-secondary">
                        manual
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 align-top whitespace-nowrap text-ink-secondary">
                  {r.assessor ?? <span className="text-ink-muted">&mdash;</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PhaseCell({ status, date }: { status: string | null; date: string | null }) {
  return (
    <td className="px-3 py-2 align-top whitespace-nowrap">
      <StatusBadge status={status} size="sm" />
      <span className="mt-0.5 block text-[11px] tabular-nums text-ink-muted">
        {date ? formatDate(date) : "no date"}
      </span>
    </td>
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

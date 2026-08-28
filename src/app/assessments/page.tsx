import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { DataTable, type AssessmentRow } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { parseFilters, toQueryString, type RawParams } from "@/lib/filters";
import {
  allLocations,
  facetCounts,
  flagCounts,
  listAssessments,
} from "@/lib/queries";
import { OVERDUE_DAYS, warningsFor } from "@/lib/schema";
import { daysBetween, todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const result = listAssessments(filters);

  const facets = {
    surveyStatus: Object.fromEntries(facetCounts(filters, "surveyStatus")),
    completionStatus: Object.fromEntries(facetCounts(filters, "completionStatus")),
    location: Object.fromEntries(facetCounts(filters, "location")),
    flags: flagCounts(filters),
  };

  const today = todayIso();
  const rows: AssessmentRow[] = result.items.map((a) => {
    const open =
      a.completionStatus == null ||
      !["Completed", "Rejected"].includes(a.completionStatus);
    const age = a.surveyDate ? daysBetween(a.surveyDate, today) : null;
    return {
      ...a,
      issues: warningsFor(a),
      overdueDays:
        a.surveyStatus === "Completed" && open && age != null && age > OVERDUE_DAYS
          ? age
          : null,
    };
  });

  const returnTo = `/assessments${toQueryString(filters)}`;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Assessment records</h1>
          <p className="mt-0.5 text-xs text-ink-secondary tabular-nums">
            {result.total.toLocaleString()} matching {result.total === 1 ? "record" : "records"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/api/export${toQueryString(filters)}`}
            prefetch={false}
            className="flex h-8 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-sunken hover:text-ink"
          >
            <Download size={13} strokeWidth={2} />
            Export CSV
          </Link>
          <Link
            href="/assessments/new"
            className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-accent-ink"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={14} strokeWidth={2.5} />
            New record
          </Link>
        </div>
      </div>

      <FilterBar filters={filters} facets={facets} locations={allLocations()} />

      <DataTable rows={rows} filters={filters} returnTo={returnTo} />

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        perPage={result.perPage}
      />
    </div>
  );
}

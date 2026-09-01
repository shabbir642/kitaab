import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { DataTable, type AssessmentRow } from "@/components/DataTable";
import { FilterChips } from "@/components/FilterChips";
import { SearchInput } from "@/components/SearchInput";
import { SortMenu } from "@/components/SortMenu";
import { Pagination } from "@/components/Pagination";
import { parseFilters, toQueryString, type RawParams } from "@/lib/filters";
import {
  allLocations,
  facetCounts,
  flagCounts,
  listAssessments,
} from "@/lib/queries";
import { OVERDUE_DAYS, warningsFor } from "@/lib/schema";
import { headerFor } from "@/lib/views";
import { daysBetween, todayIso } from "@/lib/utils";

export const metadata = { title: "Records" };

export const dynamic = "force-dynamic";

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const { title, description } = headerFor(filters);

  // Six independent reads. Sequentially that is six network round trips on a
  // hosted database, so they go together.
  const [result, surveyFacet, completionFacet, locationFacet, flags, locations] =
    await Promise.all([
      listAssessments(filters),
      facetCounts(filters, "surveyStatus"),
      facetCounts(filters, "completionStatus"),
      facetCounts(filters, "location"),
      flagCounts(filters),
      allLocations(),
    ]);

  const facets = {
    surveyStatus: Object.fromEntries(surveyFacet),
    completionStatus: Object.fromEntries(completionFacet),
    location: Object.fromEntries(locationFacet),
    flags,
  };

  const today = todayIso();
  const rows: AssessmentRow[] = result.items.map((a) => {
    const open =
      a.completionStatus == null || !["Completed", "Rejected"].includes(a.completionStatus);
    const age = a.surveyDate ? daysBetween(a.surveyDate, today) : null;
    return {
      ...a,
      issues: warningsFor(a),
      overdueDays:
        a.surveyStatus === "Completed" && open && age != null && age > OVERDUE_DAYS ? age : null,
      turnaround:
        a.surveyDate && a.completionDate ? daysBetween(a.surveyDate, a.completionDate) : null,
    };
  });

  const returnTo = `/assessments${toQueryString(filters)}`;

  return (
    <div className="flex min-h-full flex-col px-6 pb-5 pt-[18px]">
      <header className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5">
            <h1 className="truncate text-[17px] font-semibold tracking-tight sm:text-[19px]">{title}</h1>
            <span className="text-[13px] tabular-nums text-ink-muted">
              {result.total.toLocaleString()}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
        </div>
        {/* Labels collapse away on a phone so these stay on the title's row
            instead of wrapping onto one of their own. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href={`/api/export${toQueryString(filters)}`}
            prefetch={false}
            title="Export this view to CSV"
            aria-label="Export this view to CSV"
            className="flex h-9 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-sunken hover:text-ink sm:h-[30px]"
          >
            <Download size={13} strokeWidth={2} />
            <span className="hidden sm:inline">Export CSV</span>
          </Link>
          <Link
            href="/assessments/new"
            title="New record"
            aria-label="New record"
            className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-accent-ink sm:h-[30px]"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">New record</span>
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 pb-3">
        <SearchInput value={filters.q} />
        <FilterChips filters={filters} facets={facets} locations={locations} />
        <span className="ml-auto">
          <SortMenu sorts={filters.sorts} />
        </span>
      </div>

      <div className="flex-1 border-t border-hairline">
        <DataTable rows={rows} filters={filters} returnTo={returnTo} />
      </div>

      <div className="border-t border-hairline pt-2.5">
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          perPage={result.perPage}
        />
      </div>
    </div>
  );
}

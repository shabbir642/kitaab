import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ChartCard } from "@/components/ChartCard";
import { FilterChips } from "@/components/FilterChips";
import { SearchInput } from "@/components/SearchInput";
import { StatTile } from "@/components/StatTile";
import { ActivityLine } from "@/components/charts/ActivityLine";
import { LocationBars } from "@/components/charts/LocationBars";
import { StatusBars } from "@/components/charts/StatusBars";
import { parseFilters, toQueryString, type RawParams } from "@/lib/filters";
import {
  allLocations,
  byLocation,
  facetCounts,
  flagCounts,
  monthlyActivity,
  statusBreakdown,
  summary,
} from "@/lib/queries";
import { headerFor } from "@/lib/views";
import { formatMonth, pct } from "@/lib/utils";

export const metadata = { title: "Analytics" };

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const filters = parseFilters(raw);

  const scope = headerFor(filters);
  const s = summary(filters);
  const survey = statusBreakdown(filters, "survey");
  const completion = statusBreakdown(filters, "completion");
  const activity = monthlyActivity(filters, 12);
  const locations = byLocation(filters, 8).map((l) => ({
    location: l.location,
    completed: l.completed,
    open: l.total - l.completed,
  }));

  const facets = {
    surveyStatus: Object.fromEntries(facetCounts(filters, "surveyStatus")),
    completionStatus: Object.fromEntries(facetCounts(filters, "completionStatus")),
    location: Object.fromEntries(facetCounts(filters, "location")),
    flags: flagCounts(filters),
  };

  return (
    <div className="space-y-4 px-6 pb-6 pt-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-[19px] font-semibold tracking-tight">Analytics</h1>
            <span className="text-[13px] text-ink-muted">{scope.title}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            Every figure below covers the {s.total.toLocaleString()} records in this view.
          </p>
        </div>
        <Link
          href={`/assessments${toQueryString(filters)}`}
          className="flex h-8 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs font-medium text-ink-secondary hover:bg-surface-sunken hover:text-ink"
        >
          See these records
          <ArrowRight size={13} strokeWidth={2} />
        </Link>
      </div>

      {/* One filter row above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={filters.q} />
        <FilterChips filters={filters} facets={facets} locations={allLocations()} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Records" value={s.total.toLocaleString()} emphasis />
        <StatTile
          label="Surveys completed"
          value={s.surveysDone.toLocaleString()}
          sub={`${pct(s.surveysDone, s.total)} of records`}
          tone="good"
        />
        <StatTile
          label="Completions done"
          value={s.completionsDone.toLocaleString()}
          sub={`${pct(s.completionsDone, s.total)} of records`}
          tone="good"
        />
        <StatTile
          label="In flight"
          value={s.inFlight.toLocaleString()}
          sub="Survey done, completion open"
          tone="warning"
        />
        <StatTile
          label="Overdue"
          value={s.overdue.toLocaleString()}
          sub="Open past 14 days"
          tone="critical"
        />
        <StatTile
          label="Median turnaround"
          value={s.medianDaysToComplete == null ? "—" : `${s.medianDaysToComplete} d`}
          sub="Survey date to completion"
        />
      </div>

      <ChartCard
        title="Survey and completion activity"
        subtitle="Records by month of survey date and of completion date"
        table={{
          columns: ["Month", "Surveys", "Completions"],
          rows: activity.map((a) => [formatMonth(a.month), a.surveys, a.completions]),
        }}
      >
        {activity.length === 0 ? <Empty /> : <ActivityLine data={activity} />}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Survey status"
          subtitle="In pipeline order, not sorted by size"
          table={{
            columns: ["Status", "Records"],
            rows: survey.map((x) => [x.status, x.count]),
          }}
        >
          <StatusBars data={survey} seriesLabel="Records" />
        </ChartCard>

        <ChartCard
          title="Completion status"
          subtitle="In pipeline order, not sorted by size"
          table={{
            columns: ["Status", "Records"],
            rows: completion.map((x) => [x.status, x.count]),
          }}
        >
          <StatusBars data={completion} seriesLabel="Records" />
        </ChartCard>
      </div>

      <ChartCard
        title="By location"
        subtitle="Top 8 locations; the rest are folded into Other"
        table={{
          columns: ["Location", "Completed", "Not completed", "Total"],
          rows: locations.map((l) => [
            l.location,
            l.completed,
            l.open,
            l.completed + l.open,
          ]),
        }}
      >
        {locations.length === 0 ? <Empty /> : <LocationBars data={locations} />}
      </ChartCard>
    </div>
  );
}

function Empty() {
  return (
    <p className="grid h-40 place-items-center text-xs text-ink-secondary">
      No records match these filters.
    </p>
  );
}

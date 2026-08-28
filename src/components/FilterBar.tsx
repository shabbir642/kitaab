"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { FacetMenu, FacetOption, MenuLabel } from "./FacetMenu";
import { FLAGS, type Filters } from "@/lib/filters";
import { COMPLETION_STATUSES, SURVEY_STATUSES } from "@/lib/schema";
import { cn } from "@/lib/utils";

type Facets = {
  surveyStatus: Record<string, number>;
  completionStatus: Record<string, number>;
  location: Record<string, number>;
  flags: Record<string, number>;
};

const DATE_PRESETS = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 12 months", days: 365 },
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export function FilterBar({
  filters,
  facets,
  locations,
}: {
  filters: Filters;
  facets: Facets;
  locations: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [lastUrlQ, setLastUrlQ] = useState(filters.q);
  const firstRender = useRef(true);

  // Keep the box in sync when the URL changes from elsewhere (Clear all, Back).
  // Adjusting state during render is the documented pattern for this - an
  // effect here would cause a second render pass on every navigation.
  if (lastUrlQ !== filters.q) {
    setLastUrlQ(filters.q);
    setQ(filters.q);
  }

  const commit = useMemo(
    () =>
      (mutate: (p: URLSearchParams) => void) => {
        const p = new URLSearchParams(searchParams.toString());
        mutate(p);
        p.delete("page"); // any filter change returns to page 1
        startTransition(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
      },
    [pathname, router, searchParams],
  );

  // Debounced search
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (q === filters.q) return;
    const t = setTimeout(() => {
      commit((p) => {
        if (q) p.set("q", q);
        else p.delete("q");
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggleMulti = (key: string, value: string) =>
    commit((p) => {
      const current = p.getAll(key);
      p.delete(key);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      for (const v of next) p.append(key, v);
    });

  const setSingle = (key: string, value: string) =>
    commit((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });

  const clearAll = () =>
    startTransition(() => router.push(pathname, { scroll: false }));

  const dateFacetCount =
    (filters.surveyFrom ? 1 : 0) +
    (filters.surveyTo ? 1 : 0) +
    (filters.completionFrom ? 1 : 0) +
    (filters.completionTo ? 1 : 0);

  const anyActive =
    !!filters.q ||
    dateFacetCount > 0 ||
    filters.surveyStatus.length +
      filters.completionStatus.length +
      filters.anyStatus.length +
      filters.location.length +
      filters.flags.length >
      0 ||
    !!filters.origin;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-md">
        <Search
          size={14}
          strokeWidth={2}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ID, name, location, assessor, remarks…"
          aria-label="Search records"
          className="h-8 w-full rounded-md border border-hairline bg-surface pl-8 pr-8 text-xs text-ink placeholder:text-ink-muted focus:border-hairline-strong focus:outline-none"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          >
            <X size={13} strokeWidth={2.25} />
          </button>
        )}
      </div>

      <FacetMenu label="Survey status" activeCount={filters.surveyStatus.length}>
        {SURVEY_STATUSES.map((s) => (
          <FacetOption
            key={s}
            label={s}
            count={facets.surveyStatus[s] ?? 0}
            checked={filters.surveyStatus.includes(s)}
            onToggle={() => toggleMulti("surveyStatus", s)}
          />
        ))}
      </FacetMenu>

      <FacetMenu label="Completion status" activeCount={filters.completionStatus.length}>
        {COMPLETION_STATUSES.map((s) => (
          <FacetOption
            key={s}
            label={s}
            count={facets.completionStatus[s] ?? 0}
            checked={filters.completionStatus.includes(s)}
            onToggle={() => toggleMulti("completionStatus", s)}
          />
        ))}
      </FacetMenu>

      <FacetMenu label="Any status is" activeCount={filters.anyStatus.length} width="w-56">
        <MenuLabel>Matches either status column</MenuLabel>
        {[...new Set<string>([...SURVEY_STATUSES, ...COMPLETION_STATUSES])].map((s) => (
          <FacetOption
            key={s}
            label={s}
            checked={filters.anyStatus.includes(s)}
            onToggle={() => toggleMulti("anyStatus", s)}
          />
        ))}
      </FacetMenu>

      <FacetMenu label="Location" activeCount={filters.location.length}>
        {locations.length === 0 && (
          <p className="px-2 py-2 text-xs text-ink-muted">No locations recorded yet.</p>
        )}
        {locations.map((l) => (
          <FacetOption
            key={l}
            label={l}
            count={facets.location[l] ?? 0}
            checked={filters.location.includes(l)}
            onToggle={() => toggleMulti("location", l)}
          />
        ))}
      </FacetMenu>

      <FacetMenu label="Dates" activeCount={dateFacetCount} width="w-72">
        <MenuLabel>Survey date</MenuLabel>
        <div className="flex items-center gap-1.5 px-2 pb-2">
          <DateInput
            value={filters.surveyFrom}
            onChange={(v) => setSingle("surveyFrom", v)}
            label="Survey date from"
          />
          <span className="text-xs text-ink-muted">to</span>
          <DateInput
            value={filters.surveyTo}
            onChange={(v) => setSingle("surveyTo", v)}
            label="Survey date to"
          />
        </div>
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() =>
                commit((sp) => {
                  sp.set("surveyFrom", isoDaysAgo(p.days));
                  sp.delete("surveyTo");
                })
              }
              className="rounded border border-hairline px-1.5 py-0.5 text-[11px] text-ink-secondary hover:bg-surface-sunken hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="border-t border-hairline pt-1">
          <MenuLabel>Completion date</MenuLabel>
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <DateInput
              value={filters.completionFrom}
              onChange={(v) => setSingle("completionFrom", v)}
              label="Completion date from"
            />
            <span className="text-xs text-ink-muted">to</span>
            <DateInput
              value={filters.completionTo}
              onChange={(v) => setSingle("completionTo", v)}
              label="Completion date to"
            />
          </div>
        </div>
      </FacetMenu>

      <span className="mx-0.5 h-5 w-px bg-hairline" aria-hidden />

      {FLAGS.map((f) => {
        const active = filters.flags.includes(f.key);
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={active}
            onClick={() => toggleMulti("flags", f.key)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
              active
                ? "border-hairline-strong bg-accent-wash text-ink"
                : "border-hairline text-ink-secondary hover:bg-surface-sunken hover:text-ink",
            )}
          >
            {f.label}
            <span className="text-[10px] tabular-nums text-ink-muted">{facets.flags[f.key] ?? 0}</span>
          </button>
        );
      })}

      {anyActive && (
        <button
          type="button"
          onClick={clearAll}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-secondary hover:text-ink"
        >
          <X size={13} strokeWidth={2.25} /> Clear all
        </button>
      )}

      {pending && (
        <Loader2 size={14} className="animate-spin text-ink-muted" aria-label="Loading" />
      )}
    </div>
  );
}

function DateInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="date"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 min-w-0 flex-1 rounded border border-hairline bg-surface px-1.5 text-[11px] text-ink focus:border-hairline-strong focus:outline-none"
    />
  );
}

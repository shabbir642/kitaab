"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, X } from "lucide-react";
import { FacetMenu, FacetOption, MenuLabel } from "./FacetMenu";
import { FLAGS, type Filters } from "@/lib/filters";
import { COMPLETION_STATUSES, SURVEY_STATUSES } from "@/lib/schema";
import { formatDate } from "@/lib/utils";

type Chip = { key: string; field: string; value: string; remove: (p: URLSearchParams) => void };

const CATEGORIES = [
  { key: "surveyStatus", label: "Survey status" },
  { key: "completionStatus", label: "Completion status" },
  { key: "anyStatus", label: "Any status column" },
  { key: "location", label: "Location" },
  { key: "flags", label: "Flag" },
  { key: "dates", label: "Date range" },
  { key: "origin", label: "Origin" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

export function FilterChips({
  filters,
  facets,
  locations,
}: {
  filters: Filters;
  facets: {
    surveyStatus: Record<string, number>;
    completionStatus: Record<string, number>;
    location: Record<string, number>;
    flags: Record<string, number>;
  };
  locations: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<CategoryKey | null>(null);

  const commit = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    p.delete("page");
    const qs = p.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const toggleMulti = (key: string, value: string) =>
    commit((p) => {
      const current = p.getAll(key);
      p.delete(key);
      for (const v of current.includes(value) ? current.filter((x) => x !== value) : [...current, value]) {
        p.append(key, v);
      }
    });

  const dropFromMulti = (key: string, value: string) => (p: URLSearchParams) => {
    const current = p.getAll(key).filter((v) => v !== value);
    p.delete(key);
    for (const v of current) p.append(key, v);
  };

  /* ---- active chips ----
     The keyword lives in its own input beside these, so it is deliberately not
     repeated as a chip. */
  const chips: Chip[] = [];
  const multi: [string, string, string[]][] = [
    ["surveyStatus", "Survey status", filters.surveyStatus],
    ["completionStatus", "Completion status", filters.completionStatus],
    ["anyStatus", "Any status", filters.anyStatus],
    ["location", "Location", filters.location],
  ];
  for (const [key, field, values] of multi) {
    for (const v of values) {
      chips.push({ key: `${key}:${v}`, field, value: v, remove: dropFromMulti(key, v) });
    }
  }
  for (const f of filters.flags) {
    const label = FLAGS.find((x) => x.key === f)?.label ?? f;
    chips.push({ key: `flag:${f}`, field: "Flag", value: label, remove: dropFromMulti("flags", f) });
  }
  const dates: [string, string, string][] = [
    ["surveyFrom", "Survey date", `after ${formatDate(filters.surveyFrom)}`],
    ["surveyTo", "Survey date", `before ${formatDate(filters.surveyTo)}`],
    ["completionFrom", "Completion date", `after ${formatDate(filters.completionFrom)}`],
    ["completionTo", "Completion date", `before ${formatDate(filters.completionTo)}`],
  ];
  for (const [key, field, value] of dates) {
    if (filters[key as keyof Filters]) {
      chips.push({ key, field, value, remove: (p) => p.delete(key) });
    }
  }
  if (filters.origin) {
    chips.push({ key: "origin", field: "Origin", value: filters.origin, remove: (p) => p.delete("origin") });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className="flex h-8 items-center gap-1.5 rounded-md border border-hairline-strong bg-surface px-2 text-[12px] sm:h-[26px] sm:text-[11.5px]"
        >
          <span className="text-ink-muted">{c.field}</span>
          <span className="max-w-40 truncate">{c.value}</span>
          <button
            type="button"
            onClick={() => commit(c.remove)}
            aria-label={`Remove ${c.field} ${c.value}`}
            className="-m-2 p-2 text-ink-muted hover:text-ink"
          >
            <X size={11} strokeWidth={2.5} />
          </button>
        </span>
      ))}

      <FacetMenu label="Add filter" width="w-72" dashed>
        {category === null ? (
          <>
            <MenuLabel>Filter by</MenuLabel>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className="w-full rounded-md px-2 py-2.5 text-left text-xs text-ink transition-colors hover:bg-surface-sunken sm:py-1.5"
              >
                {c.label}
              </button>
            ))}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted transition-colors hover:bg-surface-sunken"
            >
              <ChevronLeft size={12} strokeWidth={2.5} />
              {CATEGORIES.find((c) => c.key === category)?.label}
            </button>

            {category === "surveyStatus" &&
              SURVEY_STATUSES.map((s) => (
                <FacetOption
                  key={s}
                  label={s}
                  count={facets.surveyStatus[s] ?? 0}
                  checked={filters.surveyStatus.includes(s)}
                  onToggle={() => toggleMulti("surveyStatus", s)}
                />
              ))}

            {category === "completionStatus" &&
              COMPLETION_STATUSES.map((s) => (
                <FacetOption
                  key={s}
                  label={s}
                  count={facets.completionStatus[s] ?? 0}
                  checked={filters.completionStatus.includes(s)}
                  onToggle={() => toggleMulti("completionStatus", s)}
                />
              ))}

            {category === "anyStatus" && (
              <>
                <MenuLabel>Matches either status column</MenuLabel>
                {[...new Set<string>([...SURVEY_STATUSES, ...COMPLETION_STATUSES])].map((s) => (
                  <FacetOption
                    key={s}
                    label={s}
                    checked={filters.anyStatus.includes(s)}
                    onToggle={() => toggleMulti("anyStatus", s)}
                  />
                ))}
              </>
            )}

            {category === "location" &&
              (locations.length === 0 ? (
                <p className="px-2 py-2 text-xs text-ink-muted">No locations recorded yet.</p>
              ) : (
                locations.map((l) => (
                  <FacetOption
                    key={l}
                    label={l}
                    count={facets.location[l] ?? 0}
                    checked={filters.location.includes(l)}
                    onToggle={() => toggleMulti("location", l)}
                  />
                ))
              ))}

            {category === "flags" &&
              FLAGS.map((f) => (
                <FacetOption
                  key={f.key}
                  label={f.label}
                  count={facets.flags[f.key] ?? 0}
                  checked={filters.flags.includes(f.key)}
                  onToggle={() => toggleMulti("flags", f.key)}
                />
              ))}

            {category === "origin" &&
              (["import", "manual"] as const).map((o) => (
                <FacetOption
                  key={o}
                  label={o === "import" ? "Imported" : "Entered by hand"}
                  checked={filters.origin === o}
                  onToggle={() =>
                    commit((p) => (filters.origin === o ? p.delete("origin") : p.set("origin", o)))
                  }
                />
              ))}

            {category === "dates" && (
              <div className="flex flex-col gap-2 px-2 pb-2 pt-1">
                <DateRange
                  label="Survey date"
                  from={filters.surveyFrom}
                  to={filters.surveyTo}
                  onChange={(k, v) => commit((p) => (v ? p.set(k, v) : p.delete(k)))}
                  keys={["surveyFrom", "surveyTo"]}
                />
                <DateRange
                  label="Completion date"
                  from={filters.completionFrom}
                  to={filters.completionTo}
                  onChange={(k, v) => commit((p) => (v ? p.set(k, v) : p.delete(k)))}
                  keys={["completionFrom", "completionTo"]}
                />
              </div>
            )}
          </>
        )}
      </FacetMenu>

      {chips.length > 0 && (
        <button
          type="button"
          onClick={() =>
            commit((p) => {
              // Clears the filters, not the keyword box sitting next to them.
              for (const key of [...new Set(p.keys())]) {
                if (key !== "q" && key !== "sort" && key !== "perPage") p.delete(key);
              }
            })
          }
          className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-ink-secondary hover:text-ink sm:h-[26px] sm:px-1.5 sm:text-[11.5px]"
        >
          <X size={11} strokeWidth={2.5} /> Clear
        </button>
      )}

      {pending && <Loader2 size={13} className="animate-spin text-ink-muted" aria-label="Loading" />}
    </div>
  );
}

function DateRange({
  label,
  from,
  to,
  keys,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  keys: [string, string];
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div>
      <p className="pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</p>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={from}
          aria-label={`${label} from`}
          onChange={(e) => onChange(keys[0], e.target.value)}
          className="h-7 min-w-0 flex-1 rounded border border-hairline bg-surface px-1.5 text-[11px] tabular-nums focus:border-hairline-strong focus:outline-none"
        />
        <span className="text-[11px] text-ink-muted">to</span>
        <input
          type="date"
          value={to}
          aria-label={`${label} to`}
          onChange={(e) => onChange(keys[1], e.target.value)}
          className="h-7 min-w-0 flex-1 rounded border border-hairline bg-surface px-1.5 text-[11px] tabular-nums focus:border-hairline-strong focus:outline-none"
        />
      </div>
    </div>
  );
}


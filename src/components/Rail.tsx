"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarOff,
  Clock,
  List,
  PanelLeft,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { parseFilters, type RawParams } from "@/lib/filters";
import type { RailCounts } from "@/lib/queries";
import {
  VIEWS,
  locationHref,
  matchLocation,
  matchView,
  viewHref,
  type ViewIcon,
} from "@/lib/views";
import { cn } from "@/lib/utils";

const ICONS: Record<ViewIcon, typeof List> = {
  list: List,
  overdue: AlertTriangle,
  awaiting: Clock,
  issues: TriangleAlert,
  unscheduled: CalendarOff,
};

const TONES: Record<ViewIcon, string> = {
  list: "var(--ink-muted)",
  overdue: "var(--status-critical)",
  awaiting: "var(--status-warning)",
  issues: "var(--status-serious)",
  unscheduled: "var(--ink-muted)",
};

export function Rail({
  counts,
  locations,
  locationTotal,
  onOpenPalette,
}: {
  counts: RailCounts;
  locations: { location: string; count: number }[];
  locationTotal: number;
  onOpenPalette: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showAllLocations, setShowAllLocations] = useState(false);

  const raw: RawParams = {};
  for (const key of new Set(searchParams.keys())) {
    const all = searchParams.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  const filters = parseFilters(raw);

  // A view is only "current" while you are actually on the records list.
  const onList = pathname === "/assessments";
  const activeView = onList ? matchView(filters) : null;
  const activeLocation = onList ? matchLocation(filters) : null;

  const shown = showAllLocations ? locations : locations.slice(0, 4);

  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-hairline bg-surface-sunken">
      <div className="flex items-center gap-2 px-3.5 pb-2.5 pt-3.5">
        <Link href="/assessments" className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid size-[22px] place-items-center rounded-md text-[11px] font-bold text-accent-ink"
            style={{ background: "var(--accent)" }}
          >
            K
          </span>
          <span className="text-[13px] font-semibold tracking-tight">Kitaab</span>
        </Link>
        <PanelLeft size={15} strokeWidth={1.75} className="ml-auto text-ink-muted" aria-hidden />
      </div>

      <div className="flex flex-col gap-1.5 px-2.5 pb-3">
        <Link
          href="/assessments/new"
          className="flex h-[30px] items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-accent-ink"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={14} strokeWidth={2.5} />
          New record
        </Link>
      </div>

      <div className="px-2.5">
        <SectionLabel>Views</SectionLabel>
        <div className="flex flex-col gap-px">
          {VIEWS.map((v) => {
            const Icon = ICONS[v.icon];
            const active = activeView === v.key;
            return (
              <Link
                key={v.key}
                href={viewHref(v)}
                title={v.description}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[30px] items-center gap-2 rounded-md px-2 text-[12.5px] transition-colors",
                  active
                    ? "bg-accent-wash font-medium text-ink"
                    : "text-ink-secondary hover:bg-surface hover:text-ink",
                )}
              >
                <Icon size={14} strokeWidth={active ? 2 : 1.75} style={{ color: TONES[v.icon] }} />
                <span className="flex-1 truncate">{v.name}</span>
                <span className="text-[11px] tabular-nums text-ink-muted">
                  {counts[v.countKey].toLocaleString()}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="px-2.5 pt-3.5">
        <SectionLabel>Locations</SectionLabel>
        <div className="flex flex-col gap-px">
          {shown.map((l) => {
            const active = activeLocation === l.location;
            return (
              <Link
                key={l.location}
                href={locationHref(l.location)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-7 items-center gap-2 rounded-md px-2 text-[12.5px] transition-colors",
                  active
                    ? "bg-accent-wash font-medium text-ink"
                    : "text-ink-secondary hover:bg-surface hover:text-ink",
                )}
              >
                <span className="flex-1 truncate">{l.location}</span>
                <span className="text-[11px] tabular-nums text-ink-muted">{l.count}</span>
              </Link>
            );
          })}
          {locationTotal > 4 && (
            <button
              type="button"
              onClick={() => setShowAllLocations((v) => !v)}
              className="flex h-7 items-center rounded-md px-2 text-left text-[12.5px] text-ink-muted transition-colors hover:text-ink"
            >
              {showAllLocations ? "Show fewer" : `Show all ${locationTotal}`}
            </button>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-hairline px-4 py-2.5">
        <button
          type="button"
          onClick={onOpenPalette}
          title="Jump to a view, a record or an action"
          className="flex items-center gap-1.5 text-[12.5px] text-ink-secondary transition-colors hover:text-ink"
        >
          <Search size={13} strokeWidth={1.75} />
          <kbd className="rounded-[3px] bg-surface-raised px-1 font-mono text-[10px]">⌘K</kbd>
        </button>
        <span className="h-4 w-px bg-hairline" aria-hidden />
        <Link
          href="/analytics"
          aria-current={pathname === "/analytics" ? "page" : undefined}
          className={cn(
            "flex items-center gap-[7px] text-[12.5px] transition-colors",
            pathname === "/analytics" ? "font-medium text-ink" : "text-ink-secondary hover:text-ink",
          )}
        >
          <BarChart3 size={14} strokeWidth={1.75} />
          Analytics
        </Link>
        <span className="ml-auto">
          <ThemeToggle />
        </span>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
      {children}
    </p>
  );
}

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
  PanelRight,
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
  open,
  collapsed,
  onToggleCollapsed,
  onClose,
}: {
  counts: RailCounts;
  locations: { location: string; count: number }[];
  locationTotal: number;
  onOpenPalette: () => void;
  /** is the mobile drawer showing (ignored from lg, where the rail is a column) */
  open: boolean;
  /** narrow, icon-only - desktop only; the mobile drawer is always full width */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** dismiss the mobile drawer */
  onClose: () => void;
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
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-hairline bg-surface-sunken",
        // Below lg it is a drawer over the content; from lg it is a column.
        // The transform lives here rather than on a wrapper: -translate-x-full
        // is a percentage of the element's own width, and a wrapper holding
        // only a fixed child has none.
        "fixed inset-y-0 left-0 z-40 w-[236px] transition-transform duration-200 lg:static lg:z-auto lg:transition-[width]",
        open ? "translate-x-0" : "-translate-x-full",
        "lg:translate-x-0",
        collapsed ? "lg:w-[3.25rem]" : "lg:w-[236px]",
      )}
    >
      <div className={cn("flex items-center gap-2 pb-2.5 pt-3.5", collapsed ? "lg:px-2" : "px-3.5")}>
        <Link
          href="/assessments"
          onClick={onClose}
          className="flex items-center gap-2 py-2"
          title={collapsed ? "Kitaab" : undefined}
        >
          <span
            aria-hidden
            className="grid size-[22px] shrink-0 place-items-center rounded-md text-[11px] font-bold text-accent-ink"
            style={{ background: "var(--accent)" }}
          >
            K
          </span>
          <span className={cn("text-[13px] font-semibold tracking-tight", collapsed && "lg:hidden")}>
            Kitaab
          </span>
        </Link>

        {/* collapses the rail on a wide screen, closes the drawer on a narrow one */}
        <button
          type="button"
          onClick={() => (window.innerWidth >= 1024 ? onToggleCollapsed() : onClose())}
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "ml-auto grid size-10 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-ink lg:size-7",
            collapsed && "lg:ml-0 lg:hidden",
          )}
        >
          <PanelLeft size={15} strokeWidth={1.75} />
        </button>
      </div>

      {/* when collapsed there is no room beside the mark, so the toggle gets its own row */}
      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand the sidebar"
          aria-expanded={false}
          className="mx-2 mb-1 hidden size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-ink lg:grid"
        >
          <PanelRight size={15} strokeWidth={1.75} />
        </button>
      )}

      <div className={cn("flex flex-col gap-1.5 pb-3", collapsed ? "lg:px-2" : "px-2.5")}>
        <Link
          href="/assessments/new"
          onClick={onClose}
          title={collapsed ? "New record" : undefined}
          className={cn(
            "flex h-11 items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-accent-ink lg:h-[30px]",
            collapsed && "lg:h-9",
          )}
          style={{ background: "var(--accent)" }}
        >
          <Plus size={14} strokeWidth={2.5} />
          <span className={cn(collapsed && "lg:hidden")}>New record</span>
        </Link>
      </div>

      <div className={cn(collapsed ? "lg:px-2" : "px-2.5")}>
        <SectionLabel className={cn(collapsed && "lg:hidden")}>Views</SectionLabel>
        <div className="flex flex-col gap-px">
          {VIEWS.map((v) => {
            const Icon = ICONS[v.icon];
            const active = activeView === v.key;
            return (
              <Link
                key={v.key}
                href={viewHref(v)}
                onClick={onClose}
                title={collapsed ? `${v.name} — ${counts[v.countKey]}` : v.description}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-md px-2 text-[13px] transition-colors lg:h-[30px] lg:text-[12.5px]",
                  collapsed && "lg:h-9 lg:justify-center lg:px-0",
                  active
                    ? "bg-accent-wash font-medium text-ink"
                    : "text-ink-secondary hover:bg-surface hover:text-ink",
                )}
              >
                <Icon
                  size={14}
                  strokeWidth={active ? 2 : 1.75}
                  style={{ color: TONES[v.icon] }}
                  className="shrink-0"
                />
                <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>{v.name}</span>
                <span
                  className={cn("text-[11px] tabular-nums text-ink-muted", collapsed && "lg:hidden")}
                >
                  {counts[v.countKey].toLocaleString()}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className={cn("px-2.5 pt-3.5", collapsed && "lg:hidden")}>
        <SectionLabel>Locations</SectionLabel>
        <div className="flex flex-col gap-px">
          {shown.map((l) => {
            const active = activeLocation === l.location;
            return (
              <Link
                key={l.location}
                href={locationHref(l.location)}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-md px-2 text-[13px] transition-colors lg:h-7 lg:text-[12.5px]",
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
              className="flex h-11 items-center rounded-md px-2 text-left text-[13px] text-ink-muted transition-colors hover:text-ink lg:h-7 lg:text-[12.5px]"
            >
              {showAllLocations ? "Show fewer" : `Show all ${locationTotal}`}
            </button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "mt-auto flex items-center gap-2 border-t border-hairline py-2.5",
          collapsed ? "lg:flex-col lg:gap-1.5 lg:px-2" : "px-4",
        )}
      >
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenPalette();
          }}
          title="Jump to a view, a record or an action"
          aria-label="Open the command palette"
          className={cn(
            "flex h-11 items-center gap-1.5 text-[12.5px] text-ink-secondary transition-colors hover:text-ink lg:h-auto",
            collapsed && "lg:grid lg:size-9 lg:place-items-center",
          )}
        >
          <Search size={13} strokeWidth={1.75} />
          <kbd
            className={cn(
              "rounded-[3px] bg-surface-raised px-1 font-mono text-[10px]",
              collapsed && "lg:hidden",
            )}
          >
            ⌘K
          </kbd>
        </button>
        <span className={cn("h-4 w-px bg-hairline", collapsed && "lg:hidden")} aria-hidden />
        <Link
          href="/analytics"
          onClick={onClose}
          title={collapsed ? "Analytics" : undefined}
          aria-current={pathname === "/analytics" ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-[7px] text-[12.5px] transition-colors lg:h-auto",
            collapsed && "lg:grid lg:size-9 lg:place-items-center",
            pathname === "/analytics" ? "font-medium text-ink" : "text-ink-secondary hover:text-ink",
          )}
        >
          <BarChart3 size={14} strokeWidth={1.75} className="shrink-0" />
          <span className={cn(collapsed && "lg:hidden")}>Analytics</span>
        </Link>
        <span className={cn("ml-auto", collapsed && "lg:ml-0")}>
          <ThemeToggle />
        </span>
      </div>
    </aside>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

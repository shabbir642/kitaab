"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarOff,
  Clock,
  CornerDownLeft,
  Download,
  List,
  MapPin,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { COMPLETION_STATUSES, SURVEY_STATUSES } from "@/lib/schema";
import { VIEWS, locationHref, viewHref, type ViewIcon } from "@/lib/views";
import { cn } from "@/lib/utils";

const VIEW_ICONS: Record<ViewIcon, typeof List> = {
  list: List,
  overdue: AlertTriangle,
  awaiting: Clock,
  issues: TriangleAlert,
  unscheduled: CalendarOff,
};

type Item = {
  id: string;
  group: string;
  label: string;
  detail?: string;
  count?: number;
  href: string;
  icon: typeof List;
  tone?: string;
};

type RecordHit = { id: number; assessmentId: string; name: string; location: string | null };

const has = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/** The body only exists while the palette is open, so every open starts from
 *  fresh state - no effect resetting it after the fact. */
export function CommandPalette({
  open,
  onClose,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  locations: { location: string; count: number }[];
}) {
  if (!open) return null;
  return <PaletteBody onClose={onClose} locations={locations} />;
}

function PaletteBody({
  onClose,
  locations,
}: {
  onClose: () => void;
  locations: { location: string; count: number }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  // Hits carry the term they answered, so a stale response can never be shown
  // against a newer query.
  const [hits, setHits] = useState<{ term: string; records: RecordHit[] }>({
    term: "",
    records: [],
  });
  const listRef = useRef<HTMLDivElement>(null);

  const term = q.trim();

  // Record lookup runs on the server; everything else is matched locally.
  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as { records: RecordHit[] };
        setHits({ term, records: json.records });
      } catch {
        /* aborted or offline - the other sections still work */
      }
    }, 160);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [term]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const records = hits.term === term ? hits.records : [];

    for (const v of VIEWS) {
      if (term && !has(v.name, term) && !has(v.description, term)) continue;
      out.push({
        id: `view:${v.key}`,
        group: "Views",
        label: v.name,
        detail: v.description,
        href: viewHref(v),
        icon: VIEW_ICONS[v.icon],
      });
    }

    for (const l of locations) {
      if (term && !has(l.location, term)) continue;
      out.push({
        id: `loc:${l.location}`,
        group: "Locations",
        label: `Location is ${l.location}`,
        count: l.count,
        href: locationHref(l.location),
        icon: MapPin,
      });
    }

    if (term) {
      for (const s of SURVEY_STATUSES) {
        if (!has(s, term)) continue;
        out.push({
          id: `ss:${s}`,
          group: "Filters",
          label: `Survey status is ${s}`,
          href: `/assessments?surveyStatus=${encodeURIComponent(s)}`,
          icon: Search,
        });
      }
      for (const s of COMPLETION_STATUSES) {
        if (!has(s, term)) continue;
        out.push({
          id: `cs:${s}`,
          group: "Filters",
          label: `Completion status is ${s}`,
          href: `/assessments?completionStatus=${encodeURIComponent(s)}`,
          icon: Search,
        });
      }
    }

    for (const r of records) {
      out.push({
        id: `rec:${r.id}`,
        group: "Records",
        label: r.name,
        detail: r.assessmentId,
        href: `/assessments/${r.id}`,
        icon: CornerDownLeft,
      });
    }

    if (term) {
      out.push({
        id: "search-all",
        group: "Search",
        label: `Search all records for "${term}"`,
        href: `/assessments?q=${encodeURIComponent(term)}`,
        icon: Search,
      });
    } else {
      out.push({ id: "new", group: "Actions", label: "New record", href: "/assessments/new", icon: Plus });
      out.push({ id: "paste", group: "Actions", label: "Paste multiple records", href: "/assessments/new?mode=paste", icon: Plus });
      out.push({ id: "analytics", group: "Actions", label: "Open analytics", href: "/analytics", icon: BarChart3 });
      out.push({ id: "export", group: "Actions", label: "Export current view to CSV", href: "/api/export", icon: Download });
    }

    return out;
  }, [term, hits, locations]);

  // Keep the cursor inside the list as results change.
  const safeCursor = items.length === 0 ? 0 : Math.min(cursor, items.length - 1);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [safeCursor, items.length]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (items.length ? (c + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (items.length ? (c - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[safeCursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-hairline-strong bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
          <Search size={15} strokeWidth={2} className="text-ink-muted" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search records, jump to a view, apply a filter"
            aria-label="Search records, views and filters"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
        </div>

        <div ref={listRef} className="thin-scroll max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-ink-secondary">
              Nothing matches that.
            </p>
          )}
          {items.map((item, i) => {
            const Icon = item.icon;
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const active = i === safeCursor;
            return (
              <div key={item.id}>
                {header && (
                  <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    {header}
                  </p>
                )}
                <button
                  type="button"
                  data-active={active}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(item)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left transition-colors",
                    active ? "bg-accent-wash" : "hover:bg-surface-sunken",
                  )}
                >
                  <Icon size={14} strokeWidth={1.75} className="shrink-0 text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink">{item.label}</span>
                    {item.detail && (
                      <span className="mt-px block truncate font-mono text-[10.5px] text-ink-muted">
                        {item.detail}
                      </span>
                    )}
                  </span>
                  {item.count !== undefined && (
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">{item.count}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3.5 border-t border-hairline px-4 py-2 text-[10.5px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-[3px] bg-surface-raised px-1 font-mono">↑↓</kbd> move
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-[3px] bg-surface-raised px-1 font-mono">↵</kbd> open
          </span>
          <span className="ml-auto">Searches ID, name, location, assessor and remarks</span>
        </div>
      </div>
    </div>
  );
}

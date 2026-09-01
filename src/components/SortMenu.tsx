"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { FacetMenu, MenuLabel } from "./FacetMenu";
import {
  DEFAULT_SORTS,
  MAX_SORTS,
  SORTABLE,
  SORT_LABELS,
  serializeSorts,
  sortsEqual,
  type SortKey,
  type SortSpec,
} from "@/lib/filters";

const ALL_KEYS = Object.keys(SORTABLE) as SortKey[];

/** Multi-level sort. Level 1 orders the list, level 2 breaks its ties, and so
 *  on - which is the only reason more than one level is worth having. */
export function SortMenu({ sorts }: { sorts: SortSpec[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = (next: SortSpec[]) => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("page");
    if (next.length === 0 || sortsEqual(next, DEFAULT_SORTS)) p.delete("sort");
    else p.set("sort", serializeSorts(next));
    const qs = p.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const isDefault = sortsEqual(sorts, DEFAULT_SORTS);
  const unused = ALL_KEYS.filter((k) => !sorts.some((s) => s.key === k));

  return (
    <FacetMenu
      label="Sort"
      activeCount={isDefault ? 0 : sorts.length}
      width="w-72"
      align="end"
      dashed
    >
      <MenuLabel>Order by</MenuLabel>
      <div className="flex flex-col gap-0.5 pb-1">
        {sorts.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1.5 rounded-md px-2 py-1">
            <span className="w-3 shrink-0 text-[10px] tabular-nums text-ink-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-xs">{SORT_LABELS[s.key]}</span>
            <button
              type="button"
              onClick={() =>
                apply(sorts.map((x, j) => (j === i ? { ...x, dir: x.dir === "asc" ? "desc" : "asc" } : x)))
              }
              title={s.dir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
              className="flex h-8 items-center gap-1 rounded border border-hairline px-2 text-[11px] text-ink-secondary hover:bg-surface-sunken hover:text-ink sm:h-6 sm:px-1.5 sm:text-[10px]"
            >
              {s.dir === "asc" ? <ArrowUp size={10} strokeWidth={3} /> : <ArrowDown size={10} strokeWidth={3} />}
              {s.dir === "asc" ? "A→Z" : "Z→A"}
            </button>
            <button
              type="button"
              onClick={() => apply(sorts.filter((_, j) => j !== i))}
              aria-label={`Remove ${SORT_LABELS[s.key]} from the sort`}
              disabled={sorts.length === 1}
              className="grid size-8 place-items-center rounded text-ink-muted hover:text-ink disabled:opacity-30 sm:size-6"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>

      {sorts.length < MAX_SORTS && unused.length > 0 && (
        <div className="border-t border-hairline pt-1">
          <MenuLabel>
            {sorts.length === 1 ? "Then break ties by" : "Then by"}
          </MenuLabel>
          {unused.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => apply([...sorts, { key: k, dir: "asc" }])}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-xs text-ink transition-colors hover:bg-surface-sunken sm:py-1.5"
            >
              <Plus size={11} strokeWidth={2.5} className="text-ink-muted" />
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      {!isDefault && (
        <div className="border-t border-hairline pt-1">
          <button
            type="button"
            onClick={() => apply(DEFAULT_SORTS)}
            className="w-full rounded-md px-2 py-2.5 text-left text-xs text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink sm:py-1.5"
          >
            Reset to last updated
          </button>
        </div>
      )}

      {pending && <span className="sr-only">Sorting…</span>}
    </FacetMenu>
  );
}

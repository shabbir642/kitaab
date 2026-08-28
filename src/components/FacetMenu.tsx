"use client";

import { useEffect, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lightweight popover built on <details> - keyboard accessible, no library,
 *  closes on outside click and Escape. */
export function FacetMenu({
  label,
  activeCount,
  children,
  align = "start",
  width = "w-64",
}: {
  label: string;
  activeCount?: number;
  children: React.ReactNode;
  align?: "start" | "end";
  width?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onDocClick = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) el.open = false;
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="group relative">
      <summary
        className={cn(
          "flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
          activeCount
            ? "border-hairline-strong bg-accent-wash text-ink"
            : "border-hairline text-ink-secondary hover:bg-surface-sunken hover:text-ink",
        )}
      >
        {label}
        {!!activeCount && (
          <span className="rounded-sm bg-surface px-1 text-[10px] tabular-nums text-ink-secondary">
            {activeCount}
          </span>
        )}
        <ChevronDown size={13} strokeWidth={2} className="text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div
        className={cn(
          "absolute z-20 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-hairline bg-surface-raised p-1 shadow-lg thin-scroll",
          width,
          align === "end" ? "right-0" : "left-0",
        )}
      >
        {children}
      </div>
    </details>
  );
}

export function FacetOption({
  checked,
  label,
  count,
  onToggle,
}: {
  checked: boolean;
  label: string;
  count?: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="menuitemcheckbox"
      aria-checked={checked}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink transition-colors hover:bg-surface-sunken"
    >
      <span className="grid size-4 shrink-0 place-items-center rounded border border-hairline-strong">
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">{count}</span>
      )}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
      {children}
    </p>
  );
}

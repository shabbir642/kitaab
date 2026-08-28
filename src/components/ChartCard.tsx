"use client";

import { useId, useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type TableTwin = {
  columns: string[];
  rows: (string | number)[][];
};

/** Every chart ships with a table-view twin, so no value is reachable only by
 *  hovering a mark. */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  table: TableTwin;
  children: React.ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const id = useId();

  return (
    <section className={cn("rounded-xl border border-hairline bg-surface p-4", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-ink-secondary">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-md border border-hairline p-0.5">
          <Toggle active={view === "chart"} onClick={() => setView("chart")} label="Chart view" controls={id}>
            <BarChart3 size={13} strokeWidth={2} />
          </Toggle>
          <Toggle active={view === "table"} onClick={() => setView("table")} label="Table view" controls={id}>
            <Table2 size={13} strokeWidth={2} />
          </Toggle>
        </div>
      </header>

      <div id={id}>
        {view === "chart" ? (
          children
        ) : (
          <div className="max-h-80 overflow-auto thin-scroll">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-hairline">
                  {table.columns.map((c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={cn(
                        "py-1.5 pr-3 font-medium text-ink-secondary",
                        i > 0 && "text-right",
                      )}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={String(r[0])} className="border-b border-hairline last:border-0">
                    {r.map((cell, i) => (
                      <td
                        key={i}
                        className={cn(
                          "py-1.5 pr-3",
                          i > 0 ? "text-right tabular-nums" : "text-ink",
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Toggle({
  active,
  onClick,
  label,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      aria-controls={controls}
      className={cn(
        "grid size-6 place-items-center rounded transition-colors",
        active ? "bg-surface-sunken text-ink" : "text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

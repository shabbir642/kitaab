"use client";

type Entry = {
  name?: unknown;
  value?: unknown;
  color?: unknown;
  dataKey?: unknown;
};

type TipProps = {
  active?: boolean;
  payload?: readonly Entry[];
  label?: unknown;
};

/** One tooltip shape for every chart on the page. Values also live in each
 *  card's table view, so the tooltip only ever enhances - it never gates. */
export function makeVizTooltip(labelFormatter?: (l: string) => string) {
  return function VizTooltip({ active, payload, label }: TipProps) {
    if (!active || !payload?.length) return null;
    const raw = label == null ? "" : String(label);
    const heading = labelFormatter ? labelFormatter(raw) : raw;

    return (
      <div className="pointer-events-none rounded-lg border border-hairline bg-surface-raised px-2.5 py-2 text-xs shadow-lg">
        <p className="mb-1 font-medium text-ink">{heading}</p>
        <ul className="space-y-0.5">
          {payload.map((p, i) => (
            <li key={String(p.dataKey ?? p.name ?? i)} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-sm"
                style={{ background: typeof p.color === "string" ? p.color : undefined }}
              />
              <span className="text-ink-secondary">{String(p.name ?? "")}</span>
              <span className="ml-auto font-medium tabular-nums text-ink">
                {String(p.value ?? "")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };
}

export const VizTooltip = makeVizTooltip();

export const AXIS_TICK = { fill: "var(--ink-muted)", fontSize: 11 } as const;
export const CURSOR_FILL = "var(--surface-sunken)";

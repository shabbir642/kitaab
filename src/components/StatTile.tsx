import { cn } from "@/lib/utils";

/** A single number is a stat tile, never a one-bar chart. */
export function StatTile({
  label,
  value,
  sub,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warning" | "critical";
  emphasis?: boolean;
}) {
  const dot =
    tone === "good" ? "var(--status-good)"
    : tone === "warning" ? "var(--status-warning)"
    : tone === "critical" ? "var(--status-critical)"
    : null;

  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary">
        {dot && (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: dot }}
          />
        )}
        {label}
      </p>
      {/* proportional figures - tabular-nums only where numbers align vertically */}
      <p className={cn("mt-1 font-semibold tracking-tight", emphasis ? "text-3xl" : "text-2xl")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}

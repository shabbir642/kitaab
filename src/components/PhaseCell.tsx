import { Check } from "lucide-react";
import { toneFor, type Tone } from "@/lib/schema";
import { formatDate, formatDateShort } from "@/lib/utils";

const TONE_VAR: Record<Tone, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
  neutral: "var(--baseline)",
};

/** Survey and completion as one two-node journey rather than four unrelated
 *  columns. The connector carries the state between them, so a stalled record
 *  reads as stalled without needing a separate badge. */
export function PhaseCell({
  surveyStatus,
  surveyDate,
  completionStatus,
  completionDate,
  overdueDays,
  turnaround,
}: {
  surveyStatus: string | null;
  surveyDate: string | null;
  completionStatus: string | null;
  completionDate: string | null;
  overdueDays: number | null;
  turnaround: number | null;
}) {
  const surveyDone = surveyStatus === "Completed";
  const completionDone = completionStatus === "Completed";

  const aTone: Tone = surveyStatus ? toneFor(surveyStatus) : "neutral";
  const bTone: Tone = completionStatus ? toneFor(completionStatus) : "neutral";

  const link =
    overdueDays != null ? TONE_VAR.critical
    : completionDone ? TONE_VAR.good
    : surveyDone ? TONE_VAR[bTone]
    : "var(--grid)";

  const right =
    completionDate ? formatDateShort(completionDate)
    : completionStatus && completionStatus !== "Not Started" ? completionStatus.toLowerCase()
    : surveyDone ? "pending"
    : "—";

  const label = `Survey ${surveyStatus ?? "unset"}${surveyDate ? ` on ${formatDate(surveyDate)}` : ""}; completion ${completionStatus ?? "unset"}${completionDate ? ` on ${formatDate(completionDate)}` : ""}`;

  return (
    <span className="flex items-center gap-2.5" title={label}>
      <span className="flex items-center" aria-hidden>
        <Node tone={aTone} done={surveyDone} />
        <span className="h-0.5 w-7" style={{ background: link }} />
        <Node tone={bTone} done={completionDone} />
      </span>
      {/* one line, always: it truncates rather than wrapping the row taller */}
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] tabular-nums text-ink-muted">
        <span>{surveyDate ? formatDateShort(surveyDate) : "not scheduled"}</span>
        <span aria-hidden>→</span>
        <span className="truncate" style={{ color: completionDone ? undefined : link }}>
          {right}
        </span>
        {turnaround != null && <span className="shrink-0">· {turnaround}d</span>}
      </span>
    </span>
  );
}

function Node({ tone, done }: { tone: Tone; done: boolean }) {
  const color = TONE_VAR[tone];
  if (done) {
    return (
      <span
        className="grid size-[15px] shrink-0 place-items-center rounded-full"
        style={{ background: color }}
      >
        <Check size={9} strokeWidth={4} style={{ color: "var(--surface)" }} />
      </span>
    );
  }
  return (
    <span
      className="size-[15px] shrink-0 rounded-full border-2 box-border"
      style={{ borderColor: color }}
    />
  );
}

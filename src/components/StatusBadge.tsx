import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock,
  XCircle,
} from "lucide-react";
import { toneFor, type Tone } from "@/lib/schema";
import { cn } from "@/lib/utils";

const TONE_VAR: Record<Tone, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
  neutral: "var(--status-neutral)",
};

const TONE_ICON: Record<Tone, typeof CheckCircle2> = {
  good: CheckCircle2,
  warning: Clock,
  serious: CircleDashed,
  critical: XCircle,
  neutral: CircleSlash,
};

/** Status is always icon + label. The colour is a reinforcement, never the
 *  only channel carrying the meaning. */
export function StatusBadge({
  status,
  className,
  size = "md",
}: {
  status: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  if (!status) {
    return <span className="text-ink-muted">&mdash;</span>;
  }
  const tone = toneFor(status);
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-hairline bg-surface px-1.5 py-0.5 font-medium text-ink",
        size === "sm" ? "text-[11px]" : "text-xs",
        className,
      )}
    >
      <Icon
        size={size === "sm" ? 11 : 12}
        strokeWidth={2.25}
        style={{ color: TONE_VAR[tone] }}
        aria-hidden
      />
      {status}
    </span>
  );
}

export function IssueBadge({ count, title }: { count: number; title: string }) {
  if (count <= 0) return null;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-hairline px-1.5 py-0.5 text-[11px] font-medium text-ink"
    >
      <AlertTriangle size={11} strokeWidth={2.25} style={{ color: "var(--status-warning)" }} aria-hidden />
      {count === 1 ? "1 issue" : `${count} issues`}
    </span>
  );
}

export function OverdueBadge({ days }: { days: number }) {
  return (
    <span
      title={`Survey completed ${days} days ago, completion still open`}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-hairline px-1.5 py-0.5 text-[11px] font-medium text-ink"
    >
      <AlertTriangle size={11} strokeWidth={2.25} style={{ color: "var(--status-critical)" }} aria-hidden />
      Overdue {days}d
    </span>
  );
}

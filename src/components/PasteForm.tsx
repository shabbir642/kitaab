"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { pasteRecordsAction, type PasteState } from "@/app/actions";
import { PASTE_COLUMNS } from "@/lib/paste";

const EMPTY: PasteState = { ok: false };

const SAMPLE = [
  "CRS-2026-0501\tCampus Readiness Survey - Pune 7\tPune\tR. Iyer\t2026-07-14\tCompleted\t2026-07-28\tCompleted\tClean run",
  "MSA-2026-0502\tManufacturing Safety Audit - Mumbai 3\tMumbai\tS. Kulkarni\t2026-08-02\tIn Progress\t\tNot Started\t",
].join("\n");

export function PasteForm() {
  const [state, action] = useActionState(pasteRecordsAction, EMPTY);

  return (
    <form action={action} className="space-y-4">
      <div className="rounded-lg border border-hairline bg-surface-sunken/50 p-3">
        <p className="text-xs font-medium">Column order (tab- or comma-separated)</p>
        <ol className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-secondary">
          {PASTE_COLUMNS.map((c, i) => (
            <li key={c} className="tabular-nums">
              <span className="text-ink-muted">{i + 1}.</span> {c}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-ink-muted">
          Dates must be YYYY-MM-DD. A header row is skipped automatically. Rows that
          fail validation are listed below and left unsaved — nothing is guessed.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-secondary">Rows</span>
        <textarea
          name="rows"
          rows={10}
          spellCheck={false}
          placeholder={SAMPLE}
          className="w-full rounded-md border border-hairline bg-surface px-2.5 py-2 font-mono text-[11px] text-ink placeholder:text-ink-muted focus:border-hairline-strong focus:outline-none"
        />
      </label>

      {state.message && (
        <p className="flex items-start gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs">
          {state.ok ? (
            <CheckCircle2 size={14} strokeWidth={2.25} style={{ color: "var(--status-good)" }} className="mt-px shrink-0" />
          ) : (
            <AlertCircle size={14} strokeWidth={2.25} style={{ color: "var(--status-warning)" }} className="mt-px shrink-0" />
          )}
          {state.message}
        </p>
      )}

      {!!state.rejected?.length && (
        <div className="overflow-hidden rounded-lg border border-hairline">
          <p className="border-b border-hairline bg-surface-sunken/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Skipped rows
          </p>
          <ul className="divide-y divide-[var(--border)]">
            {state.rejected.map((r) => (
              <li key={`${r.line}-${r.raw}`} className="px-3 py-2 text-[11px]">
                <span className="text-ink-muted tabular-nums">line {r.line}</span>{" "}
                <span style={{ color: "var(--status-critical)" }}>{r.reason}</span>
                <code className="mt-0.5 block truncate font-mono text-ink-secondary">{r.raw}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-8 rounded-md px-3 text-xs font-semibold text-accent-ink disabled:opacity-60"
      style={{ background: "var(--accent)" }}
    >
      {pending ? "Adding…" : "Add rows"}
    </button>
  );
}

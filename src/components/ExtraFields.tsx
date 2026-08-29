"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { removeExtraAction, setExtraAction } from "@/app/actions";
import { InlineText } from "./InlineText";

/** Anything this app never modelled. The record carries it in its `extras`
 *  blob, which is also where a future spreadsheet import will put the columns
 *  it doesn't recognise - so what you add here and what arrives from a sheet
 *  land in the same place. */
export function ExtraFields({
  assessmentId,
  extras,
}: {
  assessmentId: number;
  extras: Record<string, unknown>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const entries = Object.entries(extras).map(([k, v]) => [k, v == null ? "" : String(v)] as const);

  const add = () => {
    setError(null);
    startTransition(async () => {
      const res = await setExtraAction(assessmentId, key, value);
      if (res.ok) {
        setKey("");
        setValue("");
        setAdding(false);
        router.refresh();
      } else {
        setError(res.message ?? "Could not add that field.");
      }
    });
  };

  return (
    <section className="rounded-xl border border-hairline bg-surface">
      <header className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-tight">Additional details</h2>
        <span className="text-[11px] tabular-nums text-ink-muted">{entries.length}</span>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto flex items-center gap-1 rounded-md border border-dashed border-hairline-strong px-2 py-1 text-[11px] text-ink-secondary hover:text-ink"
          >
            <Plus size={11} strokeWidth={2.5} />
            Add field
          </button>
        )}
      </header>

      {adding && (
        <div className="border-b border-hairline px-4 py-3">
          <div className="flex items-start gap-2">
            <input
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Field name"
              aria-label="New field name"
              className="h-7 w-44 rounded-md border border-hairline-strong bg-surface px-2 text-xs focus:outline-none"
            />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); add(); }
                if (e.key === "Escape") { e.preventDefault(); setAdding(false); }
              }}
              placeholder="Value"
              aria-label="New field value"
              className="h-7 min-w-0 flex-1 rounded-md border border-hairline-strong bg-surface px-2 text-xs focus:outline-none"
            />
            <button
              type="button"
              onClick={add}
              disabled={pending}
              className="h-7 shrink-0 rounded-md px-2.5 text-[11px] font-semibold text-accent-ink disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {pending ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              aria-label="Cancel"
              className="grid size-7 shrink-0 place-items-center rounded-md border border-hairline text-ink-secondary hover:text-ink"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
          {error && (
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--status-critical)" }}>
              {error}
            </p>
          )}
        </div>
      )}

      {entries.length === 0 && !adding ? (
        <p className="px-4 py-6 text-center text-[11px] text-ink-muted">
          Nothing beyond the standard fields. Add one for anything this record needs
          that the others don&rsquo;t.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {entries.map(([k, v]) => (
            <div key={k} className="group/extra flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <InlineText
                  label={k}
                  value={v || null}
                  action={(next) => setExtraAction(assessmentId, k, next)}
                />
              </div>
              <form action={removeExtraAction} className="pt-0.5">
                <input type="hidden" name="assessmentId" value={assessmentId} />
                <input type="hidden" name="key" value={k} />
                <button
                  type="submit"
                  aria-label={`Remove ${k}`}
                  className="rounded p-1 text-ink-muted opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover/extra:opacity-100"
                >
                  <Trash2 size={11} strokeWidth={2} />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

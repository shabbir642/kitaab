"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, MessageSquare, Trash2 } from "lucide-react";
import { addNoteAction, deleteNoteAction, type FormState } from "@/app/actions";
import type { Note } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

const EMPTY: FormState = { ok: false };

/** The record's running commentary. Separate from `remarks`, which is one
 *  overwritable field that came from the spreadsheet - these accumulate and
 *  are dated, so the history survives. */
export function Notes({ assessmentId, notes }: { assessmentId: number; notes: Note[] }) {
  const [state, action] = useActionState(addNoteAction, EMPTY);

  return (
    <section className="rounded-xl border border-hairline bg-surface">
      <header className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <MessageSquare size={13} strokeWidth={2} className="text-ink-muted" aria-hidden />
        <h2 className="text-xs font-semibold tracking-tight">Notes</h2>
        <span className="text-[11px] tabular-nums text-ink-muted">{notes.length}</span>
      </header>

      <form action={action} className="border-b border-hairline px-4 py-3">
        <input type="hidden" name="assessmentId" value={assessmentId} />
        <textarea
          name="body"
          rows={2}
          placeholder="Add a note — what happened, who said what, what to chase."
          aria-label="New note"
          className="w-full resize-y rounded-md border border-hairline bg-surface-sunken px-2.5 py-2 text-xs leading-relaxed text-ink placeholder:text-ink-muted focus:border-hairline-strong focus:outline-none"
        />
        {state.message && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--status-critical)" }}>
            <AlertCircle size={11} strokeWidth={2.5} />
            {state.message}
          </p>
        )}
        <div className="mt-2 flex justify-end">
          <AddButton />
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="px-4 py-6 text-center text-[11px] text-ink-muted">
          No notes yet. Anything you would otherwise put in a side conversation goes here.
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border)]">
          {notes.map((n) => (
            <li key={n.id} className="group/note px-4 py-3">
              <div className="flex items-baseline gap-2">
                <time
                  dateTime={n.createdAt}
                  className="text-[10.5px] tabular-nums text-ink-muted"
                >
                  {formatDateTime(n.createdAt)}
                </time>
                <form action={deleteNoteAction} className="ml-auto">
                  <input type="hidden" name="assessmentId" value={assessmentId} />
                  <input type="hidden" name="noteId" value={n.id} />
                  <button
                    type="submit"
                    aria-label="Delete this note"
                    className="rounded p-0.5 text-ink-muted opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover/note:opacity-100"
                  >
                    <Trash2 size={11} strokeWidth={2} />
                  </button>
                </form>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-7 rounded-md px-2.5 text-[11px] font-semibold text-accent-ink disabled:opacity-60"
      style={{ background: "var(--accent)" }}
    >
      {pending ? "Adding…" : "Add note"}
    </button>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import type { FormState } from "@/app/actions";
import { cn } from "@/lib/utils";

/** One field, edited on its own. Used for everything outside the core record
 *  form, so fixing a note never means opening a form full of dates. */
export function InlineText({
  label,
  value,
  action,
  multiline = false,
  placeholder = "Not set",
  hint,
}: {
  label: string;
  value: string | null;
  action: (value: string) => Promise<FormState>;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [lastValue, setLastValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  // Adopt a value that changed underneath us (another edit, a refresh).
  if (lastValue !== value && !editing) {
    setLastValue(value);
    setDraft(value ?? "");
  }

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await action(draft);
      if (res.ok) {
        setEditing(false);
        setLastValue(draft);
        router.refresh();
      } else {
        setError(res.message ?? "Could not save that.");
      }
    });
  };

  const cancel = () => {
    setDraft(value ?? "");
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="group/field">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {label}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${label}`}
            className="flex items-center gap-1 rounded px-1 text-[10px] text-ink-muted opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover/field:opacity-100"
          >
            <Pencil size={10} strokeWidth={2} />
            Edit
          </button>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "mt-1.5 block w-full rounded-md border border-transparent px-2 py-1.5 text-left text-xs leading-relaxed transition-colors hover:border-hairline hover:bg-surface-sunken",
            value ? "text-ink" : "text-ink-muted",
          )}
        >
          {value ? (
            <span className="whitespace-pre-wrap">{value}</span>
          ) : (
            <span>{placeholder}</span>
          )}
        </button>
      </div>
    );
  }

  const Field = multiline ? "textarea" : "input";
  return (
    <div>
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </span>
      <div className="mt-1.5">
        <Field
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ref={fieldRef as any}
          autoFocus
          aria-label={label}
          value={draft}
          rows={multiline ? 4 : undefined}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
            setDraft(e.target.value)
          }
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          className="w-full resize-y rounded-md border border-hairline-strong bg-surface px-2 py-1.5 text-xs leading-relaxed text-ink focus:outline-none"
        />
        {error && (
          <p className="mt-1 text-[11px]" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold text-accent-ink disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            <Check size={11} strokeWidth={3} />
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-[11px] text-ink-secondary hover:text-ink"
          >
            <X size={11} strokeWidth={2.5} />
            Cancel
          </button>
          <span className="ml-auto text-[10px] text-ink-muted">
            {multiline ? "⌘↵ to save · Esc to cancel" : "↵ to save · Esc to cancel"}
          </span>
        </div>
      </div>
      {hint && <p className="mt-1 text-[10.5px] text-ink-muted">{hint}</p>}
    </div>
  );
}

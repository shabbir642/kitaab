"use client";

import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";

/* ---------------------------------------------------------------------------
   The pieces the account-shaped forms share.

   Sign-in, sign-up, the password change and the admin's add-user form are the
   same form four times over: a message box at the top, labelled fields that
   can carry an error, and one submit button that names what it is doing. They
   were diverging by a pixel at a time, so the shapes live here.

   Not for the record forms - those are denser, field-level and already have
   their own dialect in RecordForm.
--------------------------------------------------------------------------- */

/** Fields are 16px on a phone by way of globals.css, which is what keeps iOS
 *  Safari from zooming the page; nothing here should set a size that fights
 *  it. */
export function fieldInput(invalid: boolean) {
  return [
    "w-full rounded-md border bg-surface px-2.5 py-1.5 text-xs text-ink focus:outline-none",
    invalid ? "border-[var(--status-critical)]" : "border-hairline focus:border-hairline-strong",
  ].join(" ");
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-secondary">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-ink-muted">{hint}</span>}
      {error && (
        <span className="mt-1 block text-[11px]" style={{ color: "var(--status-critical)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

/** `role="alert"` either way: a screen reader should hear that the password
 *  changed as readily as that it did not. */
export function FormAlert({ message, ok }: { message: string; ok?: boolean }) {
  const Icon = ok ? CheckCircle2 : AlertCircle;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs"
    >
      <Icon
        size={14}
        strokeWidth={2.25}
        style={{ color: ok ? "var(--status-good)" : "var(--status-critical)" }}
        className="mt-px shrink-0"
      />
      {message}
    </p>
  );
}

export function SubmitButton({
  idle,
  busy,
  className,
}: {
  idle: string;
  busy: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        className ??
        "h-8 w-full rounded-md px-3 text-xs font-semibold text-accent-ink disabled:opacity-60"
      }
      style={{ background: "var(--accent)" }}
    >
      {pending ? busy : idle}
    </button>
  );
}

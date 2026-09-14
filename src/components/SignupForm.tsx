"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { signUpAction, type SignupState } from "@/app/auth-actions";

const EMPTY: SignupState = {};

export function SignupForm() {
  const [state, action] = useActionState(signUpAction, EMPTY);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {state.message && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs"
        >
          <AlertCircle
            size={14}
            strokeWidth={2.25}
            style={{ color: "var(--status-critical)" }}
            className="mt-px shrink-0"
          />
          {state.message}
        </p>
      )}

      <Field label="Your name" error={err.name}>
        <input name="name" required autoFocus autoComplete="name" className={input(!!err.name)} />
      </Field>

      <Field label="Email" error={err.email}>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          spellCheck={false}
          className={input(!!err.email)}
        />
      </Field>

      <Field label="Password" error={err.password} hint="At least 8 characters.">
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={input(!!err.password)}
        />
      </Field>

      <Field label="Confirm password" error={err.confirm}>
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className={input(!!err.confirm)}
        />
      </Field>

      <SubmitButton />
    </form>
  );
}

function input(invalid: boolean) {
  return [
    "w-full rounded-md border bg-surface px-2.5 py-1.5 text-xs text-ink focus:outline-none",
    invalid ? "border-[var(--status-critical)]" : "border-hairline focus:border-hairline-strong",
  ].join(" ");
}

function Field({
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-8 w-full rounded-md px-3 text-xs font-semibold text-accent-ink disabled:opacity-60"
      style={{ background: "var(--accent)" }}
    >
      {pending ? "Creating account…" : "Create account"}
    </button>
  );
}

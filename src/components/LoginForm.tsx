"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { signInAction, type AuthState } from "@/app/auth-actions";

const EMPTY: AuthState = {};

export function LoginForm() {
  const [state, action] = useActionState(signInAction, EMPTY);

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

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-secondary">Email</span>
        <input
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="username"
          spellCheck={false}
          className="w-full rounded-md border bg-surface px-2.5 py-2 text-[16px] text-ink focus:outline-none sm:py-1.5 sm:text-xs border-hairline focus:border-hairline-strong"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-secondary">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border bg-surface px-2.5 py-2 text-[16px] text-ink focus:outline-none sm:py-1.5 sm:text-xs border-hairline focus:border-hairline-strong"
        />
      </label>

      <SubmitButton />
    </form>
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
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

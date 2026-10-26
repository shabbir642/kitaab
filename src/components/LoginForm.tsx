"use client";

import { useActionState } from "react";
import { signInAction, type AuthState } from "@/app/auth-actions";
import { Field, FormAlert, SubmitButton, fieldInput } from "./FormField";

const EMPTY: AuthState = {};

export function LoginForm() {
  const [state, action] = useActionState(signInAction, EMPTY);

  return (
    <form action={action} className="space-y-4">
      {state.message && <FormAlert message={state.message} />}

      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="username"
          spellCheck={false}
          className={fieldInput(false)}
        />
      </Field>

      <Field label="Password">
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={fieldInput(false)}
        />
      </Field>

      <SubmitButton idle="Sign in" busy="Signing in…" />
    </form>
  );
}

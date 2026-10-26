"use client";

import { useActionState } from "react";
import { signUpAction, type SignupState } from "@/app/auth-actions";
import { Field, FormAlert, SubmitButton, fieldInput } from "./FormField";

const EMPTY: SignupState = {};

export function SignupForm() {
  const [state, action] = useActionState(signUpAction, EMPTY);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {state.message && <FormAlert message={state.message} />}

      <Field label="Your name" error={err.name}>
        <input
          name="name"
          required
          autoFocus
          autoComplete="name"
          className={fieldInput(!!err.name)}
        />
      </Field>

      <Field label="Email" error={err.email}>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          spellCheck={false}
          className={fieldInput(!!err.email)}
        />
      </Field>

      <Field label="Password" error={err.password} hint="At least 8 characters.">
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={fieldInput(!!err.password)}
        />
      </Field>

      <Field label="Confirm password" error={err.confirm}>
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className={fieldInput(!!err.confirm)}
        />
      </Field>

      <SubmitButton idle="Create account" busy="Creating account…" />
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction, type PasswordState } from "@/app/auth-actions";
import { Field, FormAlert, SubmitButton, fieldInput } from "./FormField";

const EMPTY: PasswordState = {};

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, EMPTY);
  const form = useRef<HTMLFormElement>(null);
  const err = state.fieldErrors ?? {};

  // Leaving three filled password boxes on screen after a success invites the
  // next person at the keyboard to read them out of the browser's own store.
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);

  return (
    <form ref={form} action={action} className="space-y-4">
      {state.message && <FormAlert message={state.message} ok={state.ok} />}

      <Field label="Current password" error={err.current}>
        <input
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className={fieldInput(!!err.current)}
        />
      </Field>

      <Field label="New password" error={err.password} hint="At least 8 characters.">
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={fieldInput(!!err.password)}
        />
      </Field>

      <Field label="Confirm new password" error={err.confirm}>
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className={fieldInput(!!err.confirm)}
        />
      </Field>

      <SubmitButton idle="Change password" busy="Changing…" />
    </form>
  );
}

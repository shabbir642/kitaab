"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, UserMinus } from "lucide-react";
import { adminUsersAction, type AdminState } from "@/app/auth-actions";
import { Field, FormAlert, SubmitButton, fieldInput } from "./FormField";
import { formatDate, formatDateTime } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Adding, resetting and deactivating, all through one action.

   Every form on this screen dispatches the same `useActionState` handle, so
   whatever was done last reports itself in one place at the top - including a
   generated password, which exists only in that reply and is never readable
   again.
--------------------------------------------------------------------------- */

export type AdminUserRow = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "maintainer";
  createdAt: string;
  lastLoginAt: string | null;
};

const EMPTY: AdminState = {};

export function UserAdmin({ users, meId }: { users: AdminUserRow[]; meId: number }) {
  const [state, action] = useActionState(adminUsersAction, EMPTY);
  const err = state.fieldErrors ?? {};

  return (
    <div className="space-y-5">
      {state.message && <FormAlert message={state.message} ok={state.ok} />}

      {state.issued && (
        <div className="rounded-xl border border-hairline bg-surface-sunken p-4">
          <p className="text-xs font-medium text-ink">
            Password for {state.issued.email}
          </p>
          <p className="mt-2 break-all rounded-md border border-hairline bg-surface px-2.5 py-2 font-mono text-xs text-ink">
            {state.issued.password}
          </p>
          <p className="mt-2 text-[11px] text-ink-muted">
            Stored only as a hash, so this is the one time it can be read. Send it over
            something they already trust, and have them change it.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-hairline bg-surface p-5">
        <h2 className="text-[13px] font-semibold text-ink">Add someone</h2>
        <p className="mb-4 mt-1 text-[11px] text-ink-muted">
          A maintainer sees only the records they create. An admin sees every record and
          this screen.
        </p>

        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="intent" value="add" />

          <Field label="Their name" error={err.name}>
            <input name="name" required autoComplete="off" className={fieldInput(!!err.name)} />
          </Field>

          <Field label="Email" error={err.email}>
            <input
              name="email"
              type="email"
              required
              autoComplete="off"
              spellCheck={false}
              className={fieldInput(!!err.email)}
            />
          </Field>

          <Field label="Role" error={err.role}>
            <select name="role" defaultValue="maintainer" className={fieldInput(false)}>
              <option value="maintainer">Maintainer</option>
              <option value="admin">Admin</option>
            </select>
          </Field>

          <div className="flex items-end">
            <SubmitButton
              idle="Create account"
              busy="Creating…"
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold text-accent-ink disabled:opacity-60"
            />
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-hairline text-[11px] uppercase tracking-[0.06em] text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium max-sm:hidden">Role</th>
              <th className="px-4 py-2.5 font-medium max-md:hidden">Added</th>
              <th className="px-4 py-2.5 font-medium max-md:hidden">Last sign-in</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3">
                  <span className="block font-medium text-ink">
                    {u.name}
                    {u.id === meId && <span className="ml-1.5 text-ink-muted">(you)</span>}
                  </span>
                  <span className="block text-[11px] text-ink-muted">{u.email}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-muted sm:hidden">
                    {u.role === "admin" ? "Admin" : "Maintainer"}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-secondary max-sm:hidden">
                  {u.role === "admin" ? "Admin" : "Maintainer"}
                </td>
                <td className="px-4 py-3 text-ink-secondary max-md:hidden">
                  {formatDate(u.createdAt.slice(0, 10))}
                </td>
                <td className="px-4 py-3 text-ink-secondary max-md:hidden">
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <RowButton action={action} userId={u.id} intent="reset" label="Reset password">
                      <KeyRound size={13} strokeWidth={1.75} />
                    </RowButton>
                    {u.id !== meId && (
                      <Deactivate action={action} userId={u.id} name={u.name} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function RowButton({
  action,
  userId,
  intent,
  label,
  children,
  danger,
}: {
  action: (fd: FormData) => void;
  userId: number;
  intent: string;
  label: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="userId" value={userId} />
      <IconSubmit label={label} danger={danger}>
        {children}
      </IconSubmit>
    </form>
  );
}

function IconSubmit({
  label,
  danger,
  children,
}: {
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={label}
      aria-label={label}
      className="grid size-9 place-items-center rounded-md border border-hairline transition-colors hover:bg-surface-sunken disabled:opacity-50 sm:size-8"
      style={{ color: danger ? "var(--status-critical)" : "var(--ink-secondary)" }}
    >
      {children}
    </button>
  );
}

/** Two clicks, because a deactivation signs somebody out mid-sentence and the
 *  way back is a CLI. The rest of the app deletes on one click, but the rest
 *  of the app soft-deletes rows rather than people. */
function Deactivate({
  action,
  userId,
  name,
}: {
  action: (fd: FormData) => void;
  userId: number;
  name: string;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title={`Deactivate ${name}`}
        aria-label={`Deactivate ${name}`}
        className="grid size-9 place-items-center rounded-md border border-hairline text-ink-secondary transition-colors hover:bg-surface-sunken sm:size-8"
      >
        <UserMinus size={13} strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="h-9 rounded-md border border-hairline px-2 text-[11px] text-ink-secondary sm:h-8"
      >
        Cancel
      </button>
      <RowButton action={action} userId={userId} intent="deactivate" label={`Deactivate ${name}`} danger>
        <UserMinus size={13} strokeWidth={1.75} />
      </RowButton>
    </span>
  );
}

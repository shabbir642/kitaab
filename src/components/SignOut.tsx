"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/auth-actions";

/** Sits beside the theme toggle in the rail's footer. A form rather than a
 *  link because signing out revokes the session row - it is a write, and a
 *  link would let a prefetch do it. */
export function SignOut({ name }: { name: string }) {
  return (
    <form action={signOutAction} className="contents">
      <SignOutButton name={name} />
    </form>
  );
}

function SignOutButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={`Signed in as ${name} - sign out`}
      aria-label={`Signed in as ${name} - sign out`}
      className="grid size-8 place-items-center rounded-md border border-hairline text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
    >
      <LogOut size={14} strokeWidth={1.75} />
    </button>
  );
}

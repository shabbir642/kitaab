"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createUser, emailTaken, signIn } from "@/lib/auth";
import { endSession, startSession } from "@/lib/session";

export type AuthState = { message?: string };

/** Behind a proxy the socket address is the proxy's, so the client's is read
 *  from the forwarded header - first entry, the rest being hops. */
async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: h.get("user-agent"),
  };
}

export async function signInAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { message: "Enter your email and password." };

  const { ip, userAgent } = await requestMeta();
  const result = await signIn(email, password, ip);

  if (!result.ok) {
    // Deliberately the same answer for an unknown address as for a wrong
    // password: this form should not tell a stranger who has an account.
    return {
      message:
        result.reason === "throttled"
          ? "Too many attempts. Wait a few minutes and try again."
          : "Email or password is incorrect.",
    };
  }

  await startSession(result.user.id, { ip, userAgent });
  redirect("/assessments");
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

/* ---------------------------------------------------------------------------
   Sign-up.

   Open registration is safe here only because of what a new account can see:
   sign-up always produces a maintainer, and a maintainer sees only the records
   they created themselves. Somebody who finds this page gets an empty app, not
   a copy of the data.

   The admin role is not self-service - it is granted with `pnpm user:add
   --admin` - so this page cannot be used to reach anyone else's records.
--------------------------------------------------------------------------- */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

export type SignupState = { message?: string; fieldErrors?: Record<string, string> };

export async function signUpAction(_prev: SignupState, fd: FormData): Promise<SignupState> {
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Tell us your name.";
  if (!email) fieldErrors.email = "An email address is required.";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "That does not look like an email address.";
  if (!password) fieldErrors.password = "Choose a password.";
  else if (password.length < MIN_PASSWORD) fieldErrors.password = `At least ${MIN_PASSWORD} characters.`;
  if (password && confirm !== password) fieldErrors.confirm = "The two passwords do not match.";

  if (Object.keys(fieldErrors).length) {
    return { message: "Fix the highlighted fields.", fieldErrors };
  }

  // Checked rather than caught, so a taken address is a field error instead of
  // a unique-index violation surfacing as a crash.
  if (await emailTaken(email)) {
    return {
      message: "Fix the highlighted fields.",
      fieldErrors: { email: "That address already has an account." },
    };
  }

  // Role is not read from the form. Sign-up produces a maintainer, always.
  const id = await createUser({ email, password, name, role: "maintainer" });

  const { ip, userAgent } = await requestMeta();
  await startSession(id, { ip, userAgent });
  redirect("/assessments");
}

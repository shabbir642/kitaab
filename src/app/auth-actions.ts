"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import {
  MIN_PASSWORD,
  createUser,
  deactivateUser,
  emailTaken,
  findUserById,
  generatePassword,
  passwordHashFor,
  revokeAllSessions,
  revokeOtherSessions,
  setPassword,
  signIn,
  verifyPassword,
} from "@/lib/auth";
import { currentToken, endSession, requireAdmin, requireUser, startSession } from "@/lib/session";

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

   The admin role is not self-service - it is granted by an existing admin, on
   /admin/users or with `pnpm user:add --admin` - so this page cannot be used
   to reach anyone else's records.
--------------------------------------------------------------------------- */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  await logActivity(id, "sign-up", "user", id, { ip });
  await startSession(id, { ip, userAgent });
  redirect("/assessments");
}

/* ---------------------------------------------------------------------------
   Changing your own password.

   The current password is required even though the session already proves who
   you are: a borrowed, unlocked browser should not be able to lock its owner
   out. Succeeding revokes every *other* session, so whoever prompted the
   change - a shared screen, a stolen cookie - is signed out by it.
--------------------------------------------------------------------------- */

export type PasswordState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function changePasswordAction(
  _prev: PasswordState,
  fd: FormData,
): Promise<PasswordState> {
  const user = await requireUser();

  const current = String(fd.get("current") ?? "");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!current) fieldErrors.current = "Enter your current password.";
  if (!password) fieldErrors.password = "Choose a new password.";
  else if (password.length < MIN_PASSWORD)
    fieldErrors.password = `At least ${MIN_PASSWORD} characters.`;
  if (password && confirm !== password) fieldErrors.confirm = "The two passwords do not match.";

  if (Object.keys(fieldErrors).length) {
    return { message: "Fix the highlighted fields.", fieldErrors };
  }

  const hash = await passwordHashFor(user.id);
  if (!hash || !(await verifyPassword(current, hash))) {
    return {
      message: "Fix the highlighted fields.",
      fieldErrors: { current: "That is not your current password." },
    };
  }
  if (await verifyPassword(password, hash)) {
    return {
      message: "Fix the highlighted fields.",
      fieldErrors: { password: "That is already your password." },
    };
  }

  await setPassword(user.id, password);

  // This session keeps working; every other one goes, which is the point.
  const token = await currentToken();
  if (token) await revokeOtherSessions(user.id, token);

  await logActivity(user.id, "password", "user", user.id, { self: true });

  return {
    ok: true,
    message: "Password changed. Any other browser you were signed in on has been signed out.",
  };
}

/* ---------------------------------------------------------------------------
   Administering users.

   One action behind three buttons, so the screen has a single place to report
   what happened - and so a generated password can be handed back through the
   same state that renders it exactly once.

   `requireAdmin()` is the enforcement. Hiding the link is presentation.
--------------------------------------------------------------------------- */

export type AdminState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Shown once, never stored in the clear and never read back. */
  issued?: { email: string; password: string };
};

export async function adminUsersAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "add") return addUser(admin.id, fd);

  const targetId = Number(fd.get("userId"));
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return { message: "That user no longer exists." };
  }
  const target = await findUserById(targetId);
  if (!target) return { message: "That user no longer exists." };

  if (intent === "reset") {
    const password = generatePassword();
    await setPassword(target.id, password);
    // Every session they had goes. A reset is for the case where somebody else
    // may be holding one.
    await revokeAllSessions(target.id);
    await logActivity(admin.id, "password", "user", target.id, { by: admin.id });
    revalidatePath("/admin/users");
    return {
      ok: true,
      message: `New password for ${target.name}. It is shown once - send it to them now.`,
      issued: { email: target.email, password },
    };
  }

  if (intent === "deactivate") {
    // An admin who deactivates themselves is signed out by their own click and
    // may be the only admin there is.
    if (target.id === admin.id) return { message: "You cannot deactivate your own account." };
    await deactivateUser(target.id);
    await logActivity(admin.id, "delete", "user", target.id, { email: target.email });
    revalidatePath("/admin/users");
    return { ok: true, message: `${target.name} has been deactivated and signed out.` };
  }

  return { message: "Unrecognised action." };
}

async function addUser(adminId: number, fd: FormData): Promise<AdminState> {
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim();
  const role = fd.get("role") === "admin" ? "admin" : "maintainer";

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "A name is required.";
  if (!email) fieldErrors.email = "An email address is required.";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "That does not look like an email address.";
  if (!fieldErrors.email && (await emailTaken(email)))
    fieldErrors.email = "That address already has an account.";

  if (Object.keys(fieldErrors).length) {
    return { message: "Fix the highlighted fields.", fieldErrors };
  }

  // Always generated: an admin typing a password for somebody else means that
  // password exists in two heads and probably in a chat log.
  const password = generatePassword();
  const id = await createUser({ email, password, name, role });

  await logActivity(adminId, "create", "user", id, { email, role });
  revalidatePath("/admin/users");

  return {
    ok: true,
    message: `${name} can sign in now. The password is shown once - send it to them.`,
    issued: { email, password },
  };
}

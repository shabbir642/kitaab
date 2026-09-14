import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  SESSION_TTL_DAYS,
  createSession,
  revokeSession,
  userForToken,
  type User,
} from "./auth";

/* ---------------------------------------------------------------------------
   The request's user.

   This is the half of auth that touches the cookie, kept apart from auth.ts so
   that scripts - which have no request to read - can still hash a password and
   create a user. See AUTH_PLAN.md.
--------------------------------------------------------------------------- */

export const SESSION_COOKIE = "kitaab_session";

/** Wrapped in React's per-request cache: the layout and the page both ask who
 *  the user is, and without this each one is a separate round trip to a
 *  database that is deliberately a long way from nothing. */
export const currentUser = cache(async (): Promise<User | undefined> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? await userForToken(token) : undefined;
});

/** The gate for anything that reads or writes real data. A page that forgets
 *  to call this is unprotected, so it belongs at the top of every server
 *  action, route handler and protected page - not only in the proxy, which is
 *  a redirect for humans rather than a boundary. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/** Only callable from a server action or route handler; a server component may
 *  read cookies but not set them. */
export async function startSession(
  userId: number,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<void> {
  const { token } = await createSession(userId, meta);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

/** Revokes the row as well as dropping the cookie. Clearing only the cookie
 *  would leave a working session behind for anyone who had copied it. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  jar.delete(SESSION_COOKIE);
}

/** The caller's token, for the one case that needs it: keeping this session
 *  alive while revoking every other one after a password change. */
export async function currentToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

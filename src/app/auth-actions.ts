"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
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

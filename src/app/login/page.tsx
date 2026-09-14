import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in, this page has nothing to offer.
  if (await currentUser()) redirect("/assessments");

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-xs">
        <div className="mb-6">
          <h1 className="text-base font-semibold text-ink">Kitaab</h1>
          <p className="mt-1 text-xs text-ink-muted">
            The book of assessment records. Sign in to continue.
          </p>
        </div>
        <LoginForm />
        <p className="mt-6 text-[11px] text-ink-muted">
          Accounts are created by an administrator.
        </p>
      </div>
    </main>
  );
}

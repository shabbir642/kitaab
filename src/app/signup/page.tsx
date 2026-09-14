import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/SignupForm";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Create an account" };

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await currentUser()) redirect("/assessments");

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-xs">
        <div className="mb-6">
          <h1 className="text-base font-semibold text-ink">Create an account</h1>
          <p className="mt-1 text-xs text-ink-muted">
            You will see the records you add yourself. Ask an administrator if you need
            access to everything.
          </p>
        </div>
        <SignupForm />
        <p className="mt-6 text-[11px] text-ink-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-ink-secondary underline underline-offset-2 hover:text-ink">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

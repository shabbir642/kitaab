import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PasswordForm } from "@/components/PasswordForm";
import { requireUser } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Your account" };

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-6 py-6">
      <div>
        <Link
          href="/assessments"
          className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink max-sm:min-h-8 max-sm:py-2"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back to records
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Your account</h1>
      </div>

      <section className="rounded-xl border border-hairline bg-surface p-5">
        <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row
            label="Role"
            value={user.role === "admin" ? "Admin" : "Maintainer"}
            hint={
              user.role === "admin"
                ? "You can see every record."
                : "You can see the records you create."
            }
          />
          <Row label="Account created" value={formatDate(user.createdAt.slice(0, 10))} />
          <Row
            label="Last sign-in"
            value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "This one"}
          />
        </dl>
      </section>

      <section className="rounded-xl border border-hairline bg-surface p-5">
        <h2 className="text-[13px] font-semibold text-ink">Change your password</h2>
        <p className="mb-4 mt-1 text-[11px] text-ink-muted">
          This browser stays signed in. Every other one is signed out, which is the point
          if you are changing it because somebody else may have had it.
        </p>
        <div className="max-w-xs">
          <PasswordForm />
        </div>
      </section>

      {/* There is no self-service reset: it needs a mail provider the app does
          not have. Saying so beats letting someone hunt for the link. */}
      <p className="text-[11px] text-ink-muted">
        Forgotten passwords are reset by an admin — there is no reset email.
      </p>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
      {hint && <dd className="mt-0.5 text-[11px] text-ink-muted">{hint}</dd>}
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UserAdmin } from "@/components/UserAdmin";
import { listUsers } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "People" };

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  // The gate, server-side. The rail hides the link from a maintainer; that is
  // tidiness, this is the enforcement.
  const me = await requireAdmin();
  const users = await listUsers();

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
      <div>
        <Link
          href="/assessments"
          className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink max-sm:min-h-8 max-sm:py-2"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back to records
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">People</h1>
        <p className="mt-1 text-xs text-ink-muted">
          {users.length} active {users.length === 1 ? "account" : "accounts"}. Deactivating
          someone keeps their records and their trail; it only stops them signing in.
        </p>
      </div>

      <UserAdmin users={users} meId={me.id} />
    </div>
  );
}

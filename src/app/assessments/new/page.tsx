import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PasteForm } from "@/components/PasteForm";
import { RecordForm } from "@/components/RecordForm";
import { allAssessors, allLocations } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Add records" };

export const dynamic = "force-dynamic";

export default async function NewRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const paste = mode === "paste";

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/assessments"
          className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back to records
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Add records</h1>
      </div>

      <div className="flex w-fit gap-1 rounded-lg border border-hairline p-1">
        <Tab href="/assessments/new" active={!paste}>
          Single record
        </Tab>
        <Tab href="/assessments/new?mode=paste" active={paste}>
          Paste multiple
        </Tab>
      </div>

      <div className="rounded-xl border border-hairline bg-surface p-5">
        {paste ? (
          <PasteForm />
        ) : (
          <RecordForm locations={allLocations()} assessors={allAssessors()} />
        )}
      </div>
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-surface-sunken text-ink" : "text-ink-secondary hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

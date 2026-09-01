import Link from "next/link";
import { Modal } from "@/components/Modal";
import { PasteForm } from "@/components/PasteForm";
import { RecordForm } from "@/components/RecordForm";
import { allAssessors, allLocations } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Intercepts /assessments/new when it is reached from inside the app, so the
 *  list stays behind it. Opening the URL directly still renders the full page. */
export default async function NewRecordModal({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const paste = mode === "paste";
  const [locations, assessors] = await Promise.all([allLocations(), allAssessors()]);

  return (
    <Modal
      title="Add records"
      subtitle={paste ? "Paste rows in the fixed column order" : "One record at a time"}
    >
      <div className="mb-4 flex w-fit gap-1 rounded-lg border border-hairline p-1">
        <Tab href="/assessments/new" active={!paste}>
          Single record
        </Tab>
        <Tab href="/assessments/new?mode=paste" active={paste}>
          Paste multiple
        </Tab>
      </div>
      {paste ? (
        <PasteForm />
      ) : (
        <RecordForm locations={locations} assessors={assessors} />
      )}
    </Modal>
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
      replace
      scroll={false}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-surface-sunken text-ink" : "text-ink-secondary hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

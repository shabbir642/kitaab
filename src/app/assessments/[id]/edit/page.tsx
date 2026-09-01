import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RecordForm } from "@/components/RecordForm";
import { allAssessors, allLocations, getAssessment } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = Number.isInteger(Number(id)) ? await getAssessment(Number(id)) : null;
  return { title: record ? `Edit ${record.assessmentId}` : "Edit record" };
}

/** The full-page form, for when this URL is opened directly. Reached from
 *  inside the app it is intercepted into a modal instead. */
export default async function EditRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [record, locations, assessors] = await Promise.all([
    Number.isInteger(Number(id)) ? getAssessment(Number(id)) : null,
    allLocations(),
    allAssessors(),
  ]);
  if (!record) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
      <div>
        <Link
          href={`/assessments/${record.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back to the record
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Edit record</h1>
        <p className="mt-0.5 font-mono text-xs text-ink-muted">{record.assessmentId}</p>
      </div>
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <RecordForm record={record} locations={locations} assessors={assessors} />
      </div>
    </div>
  );
}

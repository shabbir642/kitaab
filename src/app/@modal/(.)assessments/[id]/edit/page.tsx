import { notFound } from "next/navigation";
import { Modal } from "@/components/Modal";
import { RecordForm } from "@/components/RecordForm";
import { allAssessors, allLocations, getAssessment } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The core record fields, edited together over the record they belong to. */
export default async function EditRecordModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireUser();

  const { id } = await params;
  const [record, locations, assessors] = await Promise.all([
    Number.isInteger(Number(id)) ? getAssessment(Number(id), actor) : null,
    allLocations(actor),
    allAssessors(actor),
  ]);
  if (!record) notFound();

  return (
    <Modal title="Edit record" subtitle={record.assessmentId}>
      <RecordForm
        record={record}
        locations={locations}
        assessors={assessors}
        closeOnSave
      />
    </Modal>
  );
}

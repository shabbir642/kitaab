import { notFound } from "next/navigation";
import { Modal } from "@/components/Modal";
import { RecordForm } from "@/components/RecordForm";
import { allAssessors, allLocations, getAssessment } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** The core record fields, edited together over the record they belong to. */
export default async function EditRecordModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = Number.isInteger(Number(id)) ? getAssessment(Number(id)) : null;
  if (!record) notFound();

  return (
    <Modal title="Edit record" subtitle={record.assessmentId}>
      <RecordForm
        record={record}
        locations={allLocations()}
        assessors={allAssessors()}
        closeOnSave
      />
    </Modal>
  );
}

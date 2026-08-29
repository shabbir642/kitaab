import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Pencil,
  Trash2,
} from "lucide-react";
import { ExtraFields } from "@/components/ExtraFields";
import { InlineText } from "@/components/InlineText";
import { Notes } from "@/components/Notes";
import { PhaseTrack } from "@/components/PhaseCell";
import { deleteRecordsAction, updateFieldAction } from "@/app/actions";
import { getAssessment, listNotes } from "@/lib/queries";
import { OVERDUE_DAYS, warningsFor } from "@/lib/schema";
import { daysBetween, formatDateTime, todayIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = Number.isInteger(Number(id)) ? getAssessment(Number(id)) : null;
  return { title: record ? record.assessmentId : "Record" };
}

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const record = getAssessment(numericId);
  if (!record) notFound();

  const notes = listNotes(record.id);
  const issues = warningsFor(record);
  const today = todayIso();

  const surveyAge = record.surveyDate ? daysBetween(record.surveyDate, today) : null;
  const turnaround =
    record.surveyDate && record.completionDate
      ? daysBetween(record.surveyDate, record.completionDate)
      : null;
  const open =
    record.completionStatus == null ||
    !["Completed", "Rejected"].includes(record.completionStatus);
  const overdueDays =
    record.surveyStatus === "Completed" && open && surveyAge != null && surveyAge > OVERDUE_DAYS
      ? surveyAge
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
      {/* ---- identity + actions ---- */}
      <div>
        <Link
          href="/assessments"
          className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Back to records
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[19px] font-semibold tracking-tight">{record.name}</h1>
              {record.origin === "manual" && (
                <span className="rounded border border-hairline px-1.5 py-0.5 text-[10px] text-ink-muted">
                  entered by hand
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">{record.assessmentId}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href={`/assessments/${record.id}/edit`}
              className="flex h-[30px] items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-accent-ink"
              style={{ background: "var(--accent)" }}
            >
              <Pencil size={13} strokeWidth={2.25} />
              Edit
            </Link>
            <form action={deleteRecordsAction}>
              <input type="hidden" name="id" value={record.id} />
              <input type="hidden" name="returnTo" value="/assessments" />
              <button
                type="submit"
                className="flex h-[30px] items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs font-medium hover:bg-surface-sunken"
              >
                <Trash2 size={13} strokeWidth={2} style={{ color: "var(--status-critical)" }} />
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>

      {saved && (
        <p className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs">
          <CheckCircle2 size={14} strokeWidth={2.25} style={{ color: "var(--status-good)" }} />
          Record created.
        </p>
      )}

      {/* ---- the fields that are also on the list, two lines, then out of the way ---- */}
      <section className="rounded-xl border border-hairline bg-surface">
        <div className="border-b border-hairline px-4 py-3.5">
          <PhaseTrack
            surveyStatus={record.surveyStatus}
            surveyDate={record.surveyDate}
            completionStatus={record.completionStatus}
            completionDate={record.completionDate}
            overdueDays={overdueDays}
          />
        </div>
        <dl className="grid grid-cols-2 divide-x divide-[var(--border)] sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="Location" value={record.location} />
          <Fact label="Assessor" value={record.assessor} />
          <Fact label="Days since survey" value={surveyAge == null ? null : `${surveyAge}`} />
          <Fact label="Turnaround" value={turnaround == null ? null : `${turnaround} days`} />
          <Fact label="Last updated" value={formatDateTime(record.updatedAt)} />
        </dl>
      </section>

      {/* ---- everything the list cannot hold ---- */}
      <div className="grid gap-5 lg:grid-cols-[1fr_19rem]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border border-hairline bg-surface px-4 py-3.5">
            <InlineText
              label="Remarks"
              value={record.remarks}
              multiline
              placeholder="No remarks. This is the field that came from the spreadsheet."
              action={updateFieldAction.bind(null, record.id, "remarks")}
            />
          </section>

          <Notes assessmentId={record.id} notes={notes} />

          <ExtraFields assessmentId={record.id} extras={record.extras} />
        </div>

        <aside className="space-y-4">
          <Panel title="Needs attention">
            {overdueDays == null && issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-ink-secondary">
                <CheckCircle2 size={12} strokeWidth={2.25} style={{ color: "var(--status-good)" }} />
                Nothing outstanding
              </p>
            ) : (
              <ul className="space-y-2">
                {overdueDays != null && (
                  <li className="flex gap-1.5 text-xs text-ink-secondary">
                    <AlertTriangle
                      size={12}
                      strokeWidth={2.25}
                      style={{ color: "var(--status-critical)" }}
                      className="mt-0.5 shrink-0"
                    />
                    Completion has been open {overdueDays} days since the survey finished.
                  </li>
                )}
                {issues.map((w) => (
                  <li key={w} className="flex gap-1.5 text-xs text-ink-secondary">
                    <AlertTriangle
                      size={12}
                      strokeWidth={2.25}
                      style={{ color: "var(--status-warning)" }}
                      className="mt-0.5 shrink-0"
                    />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Provenance">
            <Row label="Origin">{record.origin}</Row>
            <Row label="Created">{formatDateTime(record.createdAt)}</Row>
            <Row label="Updated">{formatDateTime(record.updatedAt)}</Row>
            <Row label="Notes">{notes.length}</Row>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-xs" title={value ?? undefined}>
        {value ?? <span className="text-ink-muted">&mdash;</span>}
      </dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-4">
      <h2 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-ink-secondary">{label}</span>
      <span className="text-right font-medium tabular-nums">{children}</span>
    </div>
  );
}

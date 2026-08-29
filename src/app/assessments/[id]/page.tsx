import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Trash2 } from "lucide-react";
import { RecordForm } from "@/components/RecordForm";
import { StatusBadge } from "@/components/StatusBadge";
import { deleteRecordsAction } from "@/app/actions";
import { allAssessors, allLocations, getAssessment } from "@/lib/queries";
import { OVERDUE_DAYS, warningsFor } from "@/lib/schema";
import { daysBetween, formatDate, formatDateTime, todayIso } from "@/lib/utils";

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
  const overdue =
    record.surveyStatus === "Completed" && open && surveyAge != null && surveyAge > OVERDUE_DAYS;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/assessments"
            className="inline-flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink"
          >
            <ArrowLeft size={13} strokeWidth={2} />
            Back to records
          </Link>
          <h1 className="mt-2 truncate text-lg font-semibold tracking-tight">{record.name}</h1>
          <p className="mt-0.5 font-mono text-xs text-ink-secondary">{record.assessmentId}</p>
        </div>
        <form action={deleteRecordsAction}>
          <input type="hidden" name="id" value={record.id} />
          <input type="hidden" name="returnTo" value="/assessments" />
          <button
            type="submit"
            className="flex h-8 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-xs font-medium hover:bg-surface-sunken"
          >
            <Trash2 size={13} strokeWidth={2} style={{ color: "var(--status-critical)" }} />
            Delete
          </button>
        </form>
      </div>

      {saved && (
        <p className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs">
          <CheckCircle2 size={14} strokeWidth={2.25} style={{ color: "var(--status-good)" }} />
          Record created.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <RecordForm record={record} locations={allLocations()} assessors={allAssessors()} />
        </div>

        <aside className="space-y-4">
          <Panel title="Current state">
            <Row label="Survey">
              <StatusBadge status={record.surveyStatus} size="sm" />
            </Row>
            <Row label="Survey date">{formatDate(record.surveyDate) || "—"}</Row>
            <Row label="Completion">
              <StatusBadge status={record.completionStatus} size="sm" />
            </Row>
            <Row label="Completion date">{formatDate(record.completionDate) || "—"}</Row>
          </Panel>

          <Panel title="Derived">
            <Row label="Days since survey">
              {surveyAge == null ? "—" : `${surveyAge} d`}
            </Row>
            <Row label="Turnaround">{turnaround == null ? "—" : `${turnaround} d`}</Row>
            <Row label="Overdue">
              {overdue ? (
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle size={12} strokeWidth={2.25} style={{ color: "var(--status-critical)" }} />
                  Yes ({surveyAge} d)
                </span>
              ) : (
                "No"
              )}
            </Row>
          </Panel>

          <Panel title="Data issues">
            {issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-ink-secondary">
                <CheckCircle2 size={12} strokeWidth={2.25} style={{ color: "var(--status-good)" }} />
                None found
              </p>
            ) : (
              <ul className="space-y-1.5">
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
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-4">
      <h2 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
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

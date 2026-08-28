"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { saveRecord, type FormState } from "@/app/actions";
import { COMPLETION_STATUSES, SURVEY_STATUSES, type Assessment } from "@/lib/schema";
import { cn } from "@/lib/utils";

const EMPTY: FormState = { ok: false };

export function RecordForm({
  record,
  locations,
  assessors,
}: {
  record?: Assessment;
  locations: string[];
  assessors: string[];
}) {
  const [state, action] = useActionState(saveRecord.bind(null, record?.id ?? null), EMPTY);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      {state.message && (
        <p
          className={cn(
            "flex items-start gap-2 rounded-lg border border-hairline px-3 py-2 text-xs",
            state.ok ? "bg-surface" : "bg-surface",
          )}
        >
          {state.ok ? (
            <CheckCircle2 size={14} strokeWidth={2.25} style={{ color: "var(--status-good)" }} className="mt-px shrink-0" />
          ) : (
            <AlertCircle size={14} strokeWidth={2.25} style={{ color: "var(--status-critical)" }} className="mt-px shrink-0" />
          )}
          {state.message}
        </p>
      )}

      <Section title="Identity">
        <Field label="Assessment ID" required error={err.assessmentId} hint="Any mix of letters, digits and symbols. Must be unique.">
          <input
            name="assessmentId"
            defaultValue={record?.assessmentId ?? ""}
            required
            autoComplete="off"
            spellCheck={false}
            className={inputCls(!!err.assessmentId, "font-mono")}
          />
        </Field>
        <Field label="Assessment name" required error={err.name}>
          <input
            name="name"
            defaultValue={record?.name ?? ""}
            required
            className={inputCls(!!err.name)}
          />
        </Field>
        <Field label="Location" error={err.location}>
          <input
            name="location"
            list="fdk-locations"
            defaultValue={record?.location ?? ""}
            className={inputCls(!!err.location)}
          />
          <datalist id="fdk-locations">
            {locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="Assessor" error={err.assessor}>
          <input
            name="assessor"
            list="fdk-assessors"
            defaultValue={record?.assessor ?? ""}
            className={inputCls(!!err.assessor)}
          />
          <datalist id="fdk-assessors">
            {assessors.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
      </Section>

      <Section title="Survey phase">
        <Field label="Survey date" error={err.surveyDate}>
          <input
            type="date"
            name="surveyDate"
            defaultValue={record?.surveyDate ?? ""}
            className={inputCls(!!err.surveyDate, "tabular-nums")}
          />
        </Field>
        <Field label="Survey status" error={err.surveyStatus}>
          <select name="surveyStatus" defaultValue={record?.surveyStatus ?? "Pending"} className={inputCls(false)}>
            {SURVEY_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Completion phase">
        <Field label="Completion date" error={err.completionDate}>
          <input
            type="date"
            name="completionDate"
            defaultValue={record?.completionDate ?? ""}
            className={inputCls(!!err.completionDate, "tabular-nums")}
          />
        </Field>
        <Field label="Completion status" error={err.completionStatus}>
          <select
            name="completionStatus"
            defaultValue={record?.completionStatus ?? "Not Started"}
            className={inputCls(false)}
          >
            {COMPLETION_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Notes" cols={1}>
        <Field label="Remarks" error={err.remarks}>
          <textarea
            name="remarks"
            rows={3}
            defaultValue={record?.remarks ?? ""}
            className={inputCls(false, "resize-y")}
          />
        </Field>
      </Section>

      <div className="flex items-center gap-2 border-t border-hairline pt-4">
        <SubmitButton>{record ? "Save changes" : "Create record"}</SubmitButton>
      </div>
    </form>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-8 rounded-md px-3 text-xs font-semibold text-accent-ink disabled:opacity-60"
      style={{ background: "var(--accent)" }}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function inputCls(invalid: boolean, extra = "") {
  return cn(
    "w-full rounded-md border bg-surface px-2.5 py-1.5 text-xs text-ink focus:outline-none",
    invalid ? "border-[var(--status-critical)]" : "border-hairline focus:border-hairline-strong",
    extra,
  );
}

function Section({
  title,
  children,
  cols = 2,
}: {
  title: string;
  children: React.ReactNode;
  cols?: 1 | 2;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </legend>
      <div className={cn("grid gap-3", cols === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>
        {children}
      </div>
    </fieldset>
  );
}

function Field({
  label,
  children,
  error,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  error?: string[];
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-secondary">
        {label}
        {required && <span style={{ color: "var(--status-critical)" }}> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-ink-muted">{hint}</span>}
      {error?.map((e) => (
        <span key={e} className="mt-1 block text-[11px]" style={{ color: "var(--status-critical)" }}>
          {e}
        </span>
      ))}
    </label>
  );
}

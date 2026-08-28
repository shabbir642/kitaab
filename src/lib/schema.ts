import { z } from "zod";

/* ---------------------------------------------------------------------------
   Domain vocabulary.

   Statuses are declared per *phase* rather than as one flat list, because an
   assessment moves through several independently-tracked phases (survey, then
   completion) and each has its own vocabulary. Adding a phase later means
   adding an entry here plus two columns - not reworking the UI.
--------------------------------------------------------------------------- */

export type Tone = "good" | "warning" | "serious" | "critical" | "neutral";

export type PhaseKey = "survey" | "completion";

export type PhaseDef = {
  key: PhaseKey;
  label: string;
  dateField: "surveyDate" | "completionDate";
  statusField: "surveyStatus" | "completionStatus";
  statuses: readonly string[];
  /** statuses that mean "this phase is finished" */
  terminal: readonly string[];
};

export const SURVEY_STATUSES = [
  "Pending",
  "Scheduled",
  "In Progress",
  "Completed",
  "Cancelled",
] as const;

export const COMPLETION_STATUSES = [
  "Not Started",
  "In Review",
  "Completed",
  "Rejected",
  "On Hold",
] as const;

export const PHASES: readonly PhaseDef[] = [
  {
    key: "survey",
    label: "Survey",
    dateField: "surveyDate",
    statusField: "surveyStatus",
    statuses: SURVEY_STATUSES,
    terminal: ["Completed", "Cancelled"],
  },
  {
    key: "completion",
    label: "Completion",
    dateField: "completionDate",
    statusField: "completionStatus",
    statuses: COMPLETION_STATUSES,
    terminal: ["Completed", "Rejected"],
  },
] as const;

/** Status -> tone. Tones drive the status palette (icon + label always shown,
 *  so colour never carries the meaning on its own). */
const TONES: Record<string, Tone> = {
  Completed: "good",
  "In Review": "warning",
  "In Progress": "warning",
  Scheduled: "neutral",
  Pending: "serious",
  "Not Started": "serious",
  "On Hold": "serious",
  Cancelled: "neutral",
  Rejected: "critical",
};

export function toneFor(status: string | null | undefined): Tone {
  if (!status) return "neutral";
  return TONES[status] ?? "neutral";
}

/** Days after a completed survey before an unfinished completion is "overdue". */
export const OVERDUE_DAYS = 14;

/* ---------------------------------------------------------------------------
   Record shape + validation
--------------------------------------------------------------------------- */

export type Assessment = {
  id: number;
  assessmentId: string;
  name: string;
  location: string | null;
  assessor: string | null;
  surveyDate: string | null;
  surveyStatus: string | null;
  completionDate: string | null;
  completionStatus: string | null;
  remarks: string | null;
  origin: "manual" | "import";
  /** extra columns carried over from a future spreadsheet import */
  extras: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts "", null, undefined -> null. Otherwise requires a real calendar
 *  date in YYYY-MM-DD (rejects 2025-02-31, which Date() would silently roll
 *  over to March). */
const optionalDate = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))
  .refine((v) => v === null || ISO_DATE.test(v), {
    message: "Use the date picker (YYYY-MM-DD)",
  })
  .refine(
    (v) => {
      if (v === null) return true;
      const [y, m, d] = v.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d
      );
    },
    { message: "Not a real calendar date" },
  );

const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

/** Assessment IDs are user-supplied and can mix letters, digits and symbols.
 *  We only strip whitespace and invisible characters that make two visually
 *  identical IDs compare unequal. */
export function normalizeAssessmentId(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .trim();
}

export const assessmentInput = z
  .object({
    assessmentId: z
      .string()
      .transform(normalizeAssessmentId)
      .refine((v) => v.length > 0, { message: "Assessment ID is required" })
      .refine((v) => v.length <= 128, { message: "Too long (max 128)" }),
    name: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, { message: "Assessment name is required" }),
    location: optionalText,
    assessor: optionalText,
    surveyDate: optionalDate,
    surveyStatus: z.enum(SURVEY_STATUSES).nullish().default("Pending"),
    completionDate: optionalDate,
    completionStatus: z.enum(COMPLETION_STATUSES).nullish().default("Not Started"),
    remarks: optionalText,
  })
  .superRefine((val, ctx) => {
    if (
      val.surveyDate &&
      val.completionDate &&
      val.completionDate < val.surveyDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["completionDate"],
        message: "Completion date cannot precede the survey date",
      });
    }
  });

export type AssessmentInput = z.infer<typeof assessmentInput>;

/** Soft data-quality signals. Deliberately NOT validation errors - a record
 *  that looks odd still gets saved, it just gets flagged in the list. */
export function warningsFor(r: {
  surveyDate: string | null;
  surveyStatus: string | null;
  completionDate: string | null;
  completionStatus: string | null;
}): string[] {
  const out: string[] = [];
  if (r.surveyStatus === "Completed" && !r.surveyDate)
    out.push("Survey marked completed but has no survey date");
  if (r.completionStatus === "Completed" && !r.completionDate)
    out.push("Completion marked completed but has no completion date");
  if (r.completionDate && r.surveyStatus !== "Completed")
    out.push("Has a completion date while the survey is not completed");
  return out;
}

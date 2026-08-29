"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  assessmentInput,
  COMPLETION_STATUSES,
  normalizeAssessmentId,
  SURVEY_STATUSES,
} from "@/lib/schema";
import {
  addNote,
  assessmentIdExists,
  bulkSetStatus,
  createAssessment,
  deleteAssessments,
  deleteNote,
  INLINE_FIELDS,
  removeExtra,
  setExtra,
  updateAssessment,
  updateInlineField,
  type InlineField,
} from "@/lib/queries";
import { PASTE_COLUMNS } from "@/lib/paste";

export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

function readForm(fd: FormData) {
  const get = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    assessmentId: get("assessmentId"),
    name: get("name"),
    location: get("location"),
    assessor: get("assessor"),
    surveyDate: get("surveyDate"),
    surveyStatus: get("surveyStatus") || null,
    completionDate: get("completionDate"),
    completionStatus: get("completionStatus") || null,
    remarks: get("remarks"),
  };
}

function flatten(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export async function saveRecord(
  id: number | null,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const parsed = assessmentInput.safeParse(readForm(fd));
  if (!parsed.success) {
    return { ok: false, message: "Fix the highlighted fields.", fieldErrors: flatten(parsed.error) };
  }
  if (assessmentIdExists(parsed.data.assessmentId, id ?? undefined)) {
    return {
      ok: false,
      message: "That assessment ID is already in use.",
      fieldErrors: { assessmentId: ["Already used by another record"] },
    };
  }

  if (id == null) {
    const newId = createAssessment(parsed.data, "manual");
    revalidatePath("/assessments");
    redirect(`/assessments/${newId}?saved=1`);
  }

  updateAssessment(id, parsed.data);
  revalidatePath("/assessments");
  revalidatePath(`/assessments/${id}`);
  return { ok: true, message: "Saved." };
}

export async function deleteRecordsAction(fd: FormData): Promise<void> {
  const ids = fd
    .getAll("id")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  deleteAssessments(ids);
  revalidatePath("/assessments");
  const back = fd.get("returnTo");
  if (typeof back === "string" && back.startsWith("/")) redirect(back);
  redirect("/assessments");
}

export async function bulkStatusAction(fd: FormData): Promise<void> {
  const ids = fd
    .getAll("id")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  const field = fd.get("field") === "completion_status" ? "completion_status" : "survey_status";
  const value = String(fd.get("value") ?? "");
  const allowed: readonly string[] =
    field === "survey_status" ? SURVEY_STATUSES : COMPLETION_STATUSES;
  if (allowed.includes(value)) bulkSetStatus(ids, field, value);
  revalidatePath("/assessments");
  const back = fd.get("returnTo");
  if (typeof back === "string" && back.startsWith("/")) redirect(back);
  redirect("/assessments");
}

/* ---------------------------------------------------------------------------
   Paste-many entry.

   Accepts tab- or comma-separated lines in a fixed column order. It is a
   stopgap for entering a handful of rows at once - the real spreadsheet
   importer (header mapping, diff preview, quarantine) is a separate feature.
--------------------------------------------------------------------------- */

export type PasteState = FormState & {
  created?: number;
  rejected?: { line: number; raw: string; reason: string }[];
};

function splitLine(line: string): string[] {
  return (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim());
}

export async function pasteRecordsAction(
  _prev: PasteState,
  fd: FormData,
): Promise<PasteState> {
  const text = String(fd.get("rows") ?? "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, message: "Nothing to add - paste at least one row." };

  const rejected: { line: number; raw: string; reason: string }[] = [];
  const seenInBatch = new Set<string>();
  let created = 0;

  for (const [i, line] of lines.entries()) {
    const cells = splitLine(line);
    // Skip a header row if the pasted block includes one.
    if (i === 0 && /assessment\s*id/i.test(cells[0] ?? "")) continue;

    const record: Record<string, string> = {};
    PASTE_COLUMNS.forEach((col, idx) => {
      record[col] = cells[idx] ?? "";
    });

    const parsed = assessmentInput.safeParse(record);
    if (!parsed.success) {
      rejected.push({
        line: i + 1,
        raw: line,
        reason: parsed.error.issues.map((x) => `${x.path.join(".") || "row"}: ${x.message}`).join("; "),
      });
      continue;
    }

    const key = normalizeAssessmentId(parsed.data.assessmentId);
    if (seenInBatch.has(key)) {
      rejected.push({ line: i + 1, raw: line, reason: "Duplicate assessment ID within this paste" });
      continue;
    }
    if (assessmentIdExists(key)) {
      rejected.push({ line: i + 1, raw: line, reason: "Assessment ID already exists" });
      continue;
    }
    seenInBatch.add(key);
    createAssessment(parsed.data, "manual");
    created++;
  }

  revalidatePath("/assessments");
  return {
    ok: rejected.length === 0,
    created,
    rejected,
    message:
      rejected.length === 0
        ? `Added ${created} record${created === 1 ? "" : "s"}.`
        : `Added ${created}, skipped ${rejected.length}.`,
  };
}

/* ---------------------------------------------------------------------------
   Detail-view edits

   Everything here touches one thing at a time, so a half-finished note or a
   bad custom field can never block correcting a date.
--------------------------------------------------------------------------- */

function recordId(fd: FormData): number | null {
  const n = Number(fd.get("assessmentId"));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function revalidateRecord(id: number) {
  revalidatePath(`/assessments/${id}`);
  revalidatePath("/assessments");
}

export async function addNoteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = recordId(fd);
  const body = String(fd.get("body") ?? "").trim();
  if (id == null) return { ok: false, message: "Unknown record." };
  if (!body) return { ok: false, message: "Write something first." };
  if (body.length > 8000) return { ok: false, message: "That note is too long (8000 characters max)." };

  addNote(id, body);
  revalidateRecord(id);
  return { ok: true };
}

export async function deleteNoteAction(fd: FormData): Promise<void> {
  const id = recordId(fd);
  const noteId = Number(fd.get("noteId"));
  if (id == null || !Number.isInteger(noteId)) return;
  deleteNote(noteId, id);
  revalidateRecord(id);
}

export async function updateFieldAction(
  id: number,
  field: InlineField,
  value: string,
): Promise<FormState> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  if (!(field in INLINE_FIELDS)) return { ok: false, message: "Unknown field." };
  const trimmed = value.trim();
  updateInlineField(id, field, trimmed === "" ? null : trimmed);
  revalidateRecord(id);
  return { ok: true };
}

export async function setExtraAction(
  id: number,
  key: string,
  value: string,
): Promise<FormState> {
  const name = key.trim();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  if (!name) return { ok: false, message: "Give the field a name." };
  if (name.length > 64) return { ok: false, message: "Field name is too long (64 characters max)." };
  if (value.length > 2000) return { ok: false, message: "Value is too long (2000 characters max)." };

  setExtra(id, name, value.trim());
  revalidateRecord(id);
  return { ok: true };
}

export async function removeExtraAction(fd: FormData): Promise<void> {
  const id = recordId(fd);
  const key = String(fd.get("key") ?? "");
  if (id == null || !key) return;
  removeExtra(id, key);
  revalidateRecord(id);
}

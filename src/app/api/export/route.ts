import { NextResponse } from "next/server";
import { parseFilters, type RawParams } from "@/lib/filters";
import { exportRows } from "@/lib/queries";

const HEADERS = [
  "Assessment ID", "Name", "Location", "Assessor",
  "Survey date", "Survey status", "Completion date", "Completion status",
  "Remarks", "Origin", "Created", "Updated",
];

/** Excel treats a leading =, +, - or @ as a formula. Prefixing with a single
 *  quote keeps the exported CSV inert when opened in a spreadsheet. */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw: RawParams = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }

  const rows = exportRows(parseFilters(raw));
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.assessmentId, r.name, r.location, r.assessor,
        r.surveyDate, r.surveyStatus, r.completionDate, r.completionStatus,
        r.remarks, r.origin, r.createdAt, r.updatedAt,
      ].map(csvCell).join(","),
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM so Excel picks up UTF-8 for non-ASCII names and locations.
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="assessments-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

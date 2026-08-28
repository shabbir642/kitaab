/** Fixed column order for the paste-many entry box.
 *  Lives outside the "use server" module because a server-action file may only
 *  export async functions. */
export const PASTE_COLUMNS = [
  "assessmentId",
  "name",
  "location",
  "assessor",
  "surveyDate",
  "surveyStatus",
  "completionDate",
  "completionStatus",
  "remarks",
] as const;

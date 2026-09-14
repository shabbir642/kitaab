import { all, run } from "./db";

/* ---------------------------------------------------------------------------
   The audit trail.

   created_by / updated_by say who a record belongs to now. This says who did
   what, including to records that no longer exist - which is the half that
   columns cannot answer.

   Its own module rather than part of queries.ts because auth.ts writes to it
   too, and queries.ts already depends on auth for the Role type.

   Writes are recorded only when something actually changed. A maintainer
   probing a record they cannot see changes nothing, and must not leave a trail
   suggesting they did.
--------------------------------------------------------------------------- */

export type ActivityAction =
  | "create"
  | "update"
  | "delete"
  | "status"
  | "sign-in"
  | "sign-up";

export type ActivityEntity = "assessment" | "note" | "user";

export type ActivityRow = {
  id: number;
  userId: number | null;
  userName: string | null;
  action: ActivityAction;
  entity: ActivityEntity;
  entityId: number | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

export async function logActivity(
  userId: number | null,
  action: ActivityAction,
  entity: ActivityEntity,
  entityId: number | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await run(
    `INSERT INTO activity (user_id, action, entity, entity_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, action, entity, entityId, JSON.stringify(detail), new Date().toISOString()],
  );
}

type Raw = {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  entity: string;
  entity_id: number | null;
  detail: string;
  created_at: string;
};

function toActivity(r: Raw): ActivityRow {
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(r.detail || "{}") as Record<string, unknown>;
  } catch {
    detail = {};
  }
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    action: r.action as ActivityAction,
    entity: r.entity as ActivityEntity,
    entityId: r.entity_id,
    detail,
    createdAt: r.created_at,
  };
}

const SELECT = `a.id, a.user_id, u.name AS user_name, a.action, a.entity,
                a.entity_id, a.detail, a.created_at`;

/** The whole trail. Admin-only at the call site: it names records across every
 *  owner, so it is not something a maintainer may read. */
export async function recentActivity(limit = 100): Promise<ActivityRow[]> {
  return (
    await all<Raw>(
      `SELECT ${SELECT} FROM activity a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
      [limit],
    )
  ).map(toActivity);
}

/** One record's history, for the record page. */
export async function activityFor(
  entity: ActivityEntity,
  entityId: number,
  limit = 50,
): Promise<ActivityRow[]> {
  return (
    await all<Raw>(
      `SELECT ${SELECT} FROM activity a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity = ? AND a.entity_id = ?
       ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
      [entity, entityId, limit],
    )
  ).map(toActivity);
}

import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { logActivity } from "./activity";
import { all, first, run } from "./db";

/* ---------------------------------------------------------------------------
   Passwords and sessions.

   Deliberately free of `next/headers`: the CLI that creates the first admin
   has to hash a password, and a script cannot import a request-scoped API.
   Everything that touches the cookie lives in session.ts instead.

   See AUTH_PLAN.md for why scrypt rather than argon2, and why sessions are
   rows rather than signed tokens.
--------------------------------------------------------------------------- */

/** Two roles, and the difference is what you can see: an admin sees every
 *  record, a maintainer only the ones they created. Admin is not
 *  self-service - sign-up always produces a maintainer. */
export type Role = "admin" | "maintainer";

export type User = {
  id: number;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  lastLoginAt: string | null;
};

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
};

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role === "admin" ? "admin" : "maintainer",
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

const USER_COLS = `id, email, name, role, created_at, last_login_at`;

const now = () => new Date().toISOString();

/** One place to normalise, so the lookup and the unique index always agree on
 *  what counts as the same address. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/* ---------------------------------------------------------------------------
   Password hashing

   The parameters are stored in the hash rather than read from a constant, so
   raising the cost later does not invalidate every existing password: an old
   hash still describes how to verify itself, and can be upgraded on next
   sign-in.
--------------------------------------------------------------------------- */

const SCRYPT = {
  N: 1 << 15, // 32768
  r: 8,
  p: 1,
  keylen: 64,
  // 128 * N * r is exactly 32 MiB here, which is Node's default ceiling - and
  // the check is `>`, not `>=`, so the default would reject these parameters.
  maxmem: 64 * 1024 * 1024,
} as const;

function scrypt(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number; keylen: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password.normalize("NFKC"),
      salt,
      params.keylen,
      { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT.maxmem },
      (err, derived) => (err ? reject(err) : resolve(derived)),
    );
  });
}

/** `scrypt$N$r$p$salt$digest`, both tails base64. Self-describing. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await scrypt(password, salt, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    digest.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawDigest] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const expected = Buffer.from(rawDigest, "base64");
  if (expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(password, Buffer.from(rawSalt, "base64"), {
      N,
      r,
      p,
      keylen: expected.length,
    });
  } catch {
    // Stored parameters that Node will not accept - a corrupt row, not a match.
    return false;
  }

  // Lengths are equal by construction above, but timingSafeEqual throws rather
  // than returning false if they ever are not.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/* A sign-in attempt for an address that does not exist must cost the same as
   one for an address that does, or the vague "email or password is incorrect"
   message is undone by a stopwatch. Callers verify against this when no user
   was found. */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64"));
  return dummyHash;
}

/* ---------------------------------------------------------------------------
   Users
--------------------------------------------------------------------------- */

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const row = await first<UserRow>(
    `SELECT ${USER_COLS} FROM users WHERE email = ? AND deleted_at IS NULL`,
    [normalizeEmail(email)],
  );
  return row && toUser(row);
}

export async function findUserById(id: number): Promise<User | undefined> {
  const row = await first<UserRow>(
    `SELECT ${USER_COLS} FROM users WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  return row && toUser(row);
}

/** The password hash, kept off the User type so it is never carried around by
 *  accident - it has to be asked for. */
export async function passwordHashFor(userId: number): Promise<string | undefined> {
  const row = await first<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return row?.password_hash;
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  role?: Role;
}): Promise<number> {
  const stamp = now();
  const { lastInsertRowid } = await run(
    `INSERT INTO users (email, password_hash, name, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      normalizeEmail(input.email),
      await hashPassword(input.password),
      input.name.trim(),
      input.role ?? "maintainer",
      stamp,
      stamp,
    ],
  );
  return lastInsertRowid;
}

/** One source of generated passwords, shared by `pnpm user:add` and the admin
 *  screen's reset, so both hand out the same shape of thing: base64url, which
 *  survives being pasted into a chat window without escaping. */
export const generatePassword = () => randomBytes(12).toString("base64url");

/** The shortest password the app will accept anywhere - the sign-up form, the
 *  account screen and the CLI all read it from here. */
export const MIN_PASSWORD = 8;

export async function setPassword(userId: number, password: string): Promise<void> {
  await run(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, [
    await hashPassword(password),
    now(),
    userId,
  ]);
}

export async function emailTaken(email: string, exceptId?: number): Promise<boolean> {
  const row = await first<{ id: number }>(
    `SELECT id FROM users WHERE email = ? AND deleted_at IS NULL AND id IS NOT ?`,
    [normalizeEmail(email), exceptId ?? null],
  );
  return row !== undefined;
}

/** Soft delete, matching the rest of the app - and revoke live sessions, or a
 *  deactivated account stays signed in until its cookie expires. */
export async function deactivateUser(userId: number): Promise<void> {
  const stamp = now();
  await run(`UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ?`, [stamp, stamp, userId]);
  await revokeAllSessions(userId);
}

export async function listUsers(): Promise<User[]> {
  const rows = await all<UserRow>(
    `SELECT ${USER_COLS} FROM users WHERE deleted_at IS NULL ORDER BY name`,
  );
  return rows.map(toUser);
}

/* ---------------------------------------------------------------------------
   Sessions

   The cookie carries 32 random bytes; the table stores only their SHA-256.
   A database dump therefore contains no usable sessions, which matters here
   because export:sql writes one to a file on purpose.
--------------------------------------------------------------------------- */

export const SESSION_TTL_DAYS = 30;

/** Below this much remaining life, a session's expiry is extended on use.
 *  Rolling it on *every* request would mean a write - a round trip to Mumbai -
 *  on every page load, to move the deadline by seconds. */
const REFRESH_WHEN_REMAINING_DAYS = SESSION_TTL_DAYS - 1;

const days = (n: number) => n * 24 * 60 * 60 * 1000;

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("base64url");

export async function createSession(
  userId: number,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const stamp = now();
  const expiresAt = new Date(Date.now() + days(SESSION_TTL_DAYS)).toISOString();

  await run(
    `INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, hashToken(token), stamp, expiresAt, stamp, meta.userAgent ?? null, meta.ip ?? null],
  );

  await run(`UPDATE users SET last_login_at = ? WHERE id = ?`, [stamp, userId]);

  return { token, expiresAt };
}

/** Resolves a cookie value to its user, or undefined. Expiry and revocation
 *  are checked in SQL so a stale row can never be read back as live. */
export async function userForToken(token: string): Promise<User | undefined> {
  if (!token) return undefined;

  const row = await first<UserRow & { session_id: number; expires_at: string }>(
    `SELECT s.id AS session_id, s.expires_at,
            u.id, u.email, u.name, u.role, u.created_at, u.last_login_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > ?
        AND u.deleted_at IS NULL`,
    [hashToken(token), now()],
  );
  if (!row) return undefined;

  const remaining = new Date(row.expires_at).getTime() - Date.now();
  if (remaining < days(REFRESH_WHEN_REMAINING_DAYS)) {
    await run(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`, [
      now(),
      new Date(Date.now() + days(SESSION_TTL_DAYS)).toISOString(),
      row.session_id,
    ]);
  }

  return toUser(row);
}

export async function revokeSession(token: string): Promise<void> {
  await run(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`, [
    now(),
    hashToken(token),
  ]);
}

export async function revokeAllSessions(userId: number): Promise<void> {
  await run(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [
    now(),
    userId,
  ]);
}

/** Used after a password change: the session doing the changing stays, every
 *  other one - including whoever else may be holding a stolen cookie - goes. */
export async function revokeOtherSessions(userId: number, keepToken: string): Promise<void> {
  await run(
    `UPDATE sessions SET revoked_at = ?
      WHERE user_id = ? AND revoked_at IS NULL AND token_hash IS NOT ?`,
    [now(), userId, hashToken(keepToken)],
  );
}

/* ---------------------------------------------------------------------------
   Sign-in throttling

   Serverless has no shared memory, so the counter lives in the database or it
   counts nothing. Attempts are recorded per address and per address-less IP,
   so one account being attacked cannot lock out an entire office, and an IP
   spraying many addresses is still caught.
--------------------------------------------------------------------------- */

export const MAX_ATTEMPTS = 10;
const WINDOW_MINUTES = 15;

const windowStart = () => new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

export async function recordFailedAttempt(email: string, ip: string | null): Promise<void> {
  await run(`INSERT INTO login_attempts (email, ip, created_at) VALUES (?, ?, ?)`, [
    normalizeEmail(email),
    ip,
    now(),
  ]);
  // Pruned on write - nothing else visits this table.
  await run(`DELETE FROM login_attempts WHERE created_at < ?`, [
    new Date(Date.now() - days(1)).toISOString(),
  ]);
}

export async function isThrottled(email: string, ip: string | null): Promise<boolean> {
  const row = await first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE created_at > ? AND (email = ? OR (? IS NOT NULL AND ip = ?))`,
    [windowStart(), normalizeEmail(email), ip, ip],
  );
  return Number(row?.n ?? 0) >= MAX_ATTEMPTS;
}

export async function clearAttempts(email: string, ip: string | null): Promise<void> {
  await run(`DELETE FROM login_attempts WHERE email = ? OR (? IS NOT NULL AND ip = ?)`, [
    normalizeEmail(email),
    ip,
    ip,
  ]);
}

/* ---------------------------------------------------------------------------
   Sign-in
--------------------------------------------------------------------------- */

export type SignInResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" | "throttled" };

/** The single place a password is checked. Returns the same "invalid" for an
 *  unknown address as for a wrong password, and costs the same either way. */
export async function signIn(
  email: string,
  password: string,
  ip: string | null = null,
): Promise<SignInResult> {
  if (await isThrottled(email, ip)) return { ok: false, reason: "throttled" };

  const user = await findUserByEmail(email);
  const hash = user ? await passwordHashFor(user.id) : undefined;

  // No user, or somehow no hash: still run a real verification, so the timing
  // does not answer a question the error message refuses to.
  const matched = await verifyPassword(password, hash ?? (await dummyPasswordHash()));

  if (!user || !hash || !matched) {
    await recordFailedAttempt(email, ip);
    return { ok: false, reason: "invalid" };
  }

  await clearAttempts(email, ip);
  await logActivity(user.id, "sign-in", "user", user.id, { ip });
  return { ok: true, user };
}

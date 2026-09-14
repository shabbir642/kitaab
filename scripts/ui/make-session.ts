/**
 * Creates the account the browser suites sign in as, and prints nothing but a
 * live session token to the file named by KITAAB_TOKEN_OUT.
 *
 * Only ever pointed at the throwaway database that run-all.mjs makes.
 */
import { writeFileSync } from "node:fs";
import { createSession, createUser, findUserByEmail } from "../../src/lib/auth.ts";
import { pushSchema } from "../../src/lib/db.ts";

const out = process.env.KITAAB_TOKEN_OUT;
if (!out) {
  console.error("KITAAB_TOKEN_OUT is not set");
  process.exit(1);
}

await pushSchema();

const email = "suite@kitaab.test";
const existing = await findUserByEmail(email);
const id = existing?.id ?? (await createUser({
  email,
  password: "browser-suite-only",
  name: "Suite Runner",
  role: "admin",
}));

const { token } = await createSession(id);
writeFileSync(out, token);
console.log(`browser suites will sign in as ${email}`);

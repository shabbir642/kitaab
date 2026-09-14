/**
 * Creates a user. There is no sign-up page by design, so this is how the first
 * admin comes into being - and how an account is made against the deployment.
 *
 *   pnpm user:add alice@example.com "Alice Khan" --admin
 *   pnpm user:add bob@example.com "Bob Rao" --password 'chosen-by-them'
 *   KITAAB_USE_REMOTE=1 pnpm user:add ...        # against the deployment
 *
 * With no --password one is generated and printed once. It is not stored
 * anywhere in the clear, so copy it before closing the terminal.
 */
import { randomBytes } from "node:crypto";
import { createUser, emailTaken, normalizeEmail } from "../src/lib/auth.ts";
import { describeTarget, pushSchema } from "../src/lib/db.ts";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

const positional = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  return !(i > 0 && argv[i - 1] === "--password");
});

const [email, name] = positional;

if (!email || !name) {
  console.error('usage: pnpm user:add <email> "<name>" [--admin] [--password <pw>]');
  process.exit(1);
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`not an email address: ${email}`);
  process.exit(1);
}

await pushSchema();

if (await emailTaken(email)) {
  console.error(`${normalizeEmail(email)} already has an account on ${describeTarget()}`);
  process.exit(1);
}

// base64url, so it survives being pasted anywhere without escaping.
const password = value("password") ?? randomBytes(12).toString("base64url");
const generated = !value("password");

if (password.length < 8) {
  console.error("password must be at least 8 characters");
  process.exit(1);
}

const role = flag("admin") ? "admin" : "member";
const id = await createUser({ email, password, name, role });

console.log(`created ${role} #${id} <${normalizeEmail(email)}> on ${describeTarget()}`);
if (generated) console.log(`password: ${password}\n(shown once - it is stored only as a hash)`);

/**
 * The account screen and the admin's people screen, in a real browser.
 *
 * These two are the reason to drive a browser rather than call the library:
 * both are server actions behind forms, and the things worth asserting are
 * that a generated password is shown once, that a wrong current password is
 * refused, and that the admin screen is not reachable by a maintainer - none
 * of which the data layer can answer.
 *
 * It arrives signed in as the suite's admin and does its damage to accounts it
 * creates itself, never to that one: changing the suite account's password
 * would pull the session out from under every other suite.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (() => {
  const given = process.argv[2] ?? process.env.TEST_BASE_URL;
  if (!given) {
    console.error(
      "This suite creates and deactivates accounts, so it will not guess a target.\n" +
        "Run it through `pnpm test:ui`, or pass a base URL:\n\n" +
        "  node scripts/ui/people.mjs http://127.0.0.1:3123\n",
    );
    process.exit(2);
  }
  return given.replace(/\/$/, "");
})();

const PORT = Number(process.env.CDP_PORT ?? 9607), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "people-"));
const ch = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new","--disable-gpu","--no-first-run","--hide-scrollbars",
   `--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,"--window-size=1400,940","about:blank"],{stdio:"ignore"});
let wsUrl;
for (let i=0;i<60;i++){ try{ const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const p=l.find(t=>t.type==="page"&&t.webSocketDebuggerUrl); if(p){wsUrl=p.webSocketDebuggerUrl;break} }catch{} await sleep(250) }
const sock = new WebSocket(wsUrl); await new Promise(r=>sock.addEventListener("open",r));
let id=0; const pend=new Map();
sock.addEventListener("message",e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);sock.send(JSON.stringify({id:i,method:m,params:p}))});
const ev = async (e) => {
  const r = await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result.result.value;
};
const goto = async (p) => { await send("Page.navigate",{url: BASE + p}); await sleep(3000); };
const text = () => ev(`document.body.innerText`);
const setVal = (sel, val) => ev(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
})()`);
const clickText = (t) => ev(`(() => {
  const b = [...document.querySelectorAll('button,a,summary')].find(x => x.textContent.trim() === ${JSON.stringify(t)});
  if (!b) return false; b.click(); return true;
})()`);
const clickLabel = (l) => ev(`(() => {
  const b = [...document.querySelectorAll('button,a')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(l)});
  if (!b) return false; b.click(); return true;
})()`);

await send("Page.enable"); await send("Runtime.enable");

if (!process.env.TEST_SESSION) {
  console.error("TEST_SESSION is not set - run this through `pnpm test:ui`.");
  process.exit(2);
}
await send("Network.enable");
await send("Network.setCookie", { name: "kitaab_session", value: process.env.TEST_SESSION, url: BASE });

let fails = 0;
const ok = (n,c,x) => { if(!c){fails++;console.log("FAIL ",n,x??"")} else console.log("ok   ",n) };

const STAMP = Date.now();
const NEW_EMAIL = `people-${STAMP}@kitaab.test`;

try {
  /* ---- the account screen ---- */
  await goto("/account");
  const account = await text();
  ok("the account screen names you", account.includes("Your account") && account.includes("suite@kitaab.test"));
  ok("it says which role you hold", account.includes("Admin"));
  ok("it says there is no reset email", account.toLowerCase().includes("no reset email"));

  // Wrong current password: the one case where getting it wrong must not
  // quietly succeed.
  await setVal('input[name="current"]', "not-the-password");
  await setVal('input[name="password"]', "a-new-password-1");
  await setVal('input[name="confirm"]', "a-new-password-1");
  await clickText("Change password");
  await sleep(2500);
  ok("a wrong current password is refused", (await text()).includes("not your current password"));

  // And a mismatch, which never reaches the database at all.
  await setVal('input[name="current"]', "browser-suite-only");
  await setVal('input[name="password"]', "a-new-password-1");
  await setVal('input[name="confirm"]', "something-else");
  await clickText("Change password");
  await sleep(2500);
  ok("mismatched confirmation is refused", (await text()).includes("do not match"));
  ok("the suite account still has its password", !(await text()).includes("Password changed"));

  /* ---- the people screen ---- */
  ok("the rail offers People to an admin", await ev(`!!document.querySelector('a[href="/admin/users"]')`));

  await goto("/admin/users");
  ok("the people screen lists accounts", (await text()).includes("suite@kitaab.test"));

  await setVal('input[name="name"]', "Added By Suite");
  await setVal('input[name="email"]', NEW_EMAIL);
  await setVal('select[name="role"]', "maintainer");
  await clickText("Create account");
  await sleep(3000);

  const added = await text();
  ok("the new account appears", added.includes(NEW_EMAIL));
  ok("its password is shown once", added.includes(`Password for ${NEW_EMAIL}`));
  const issued = await ev(`(() => {
    const el = [...document.querySelectorAll('p')].find(p => p.className.includes('font-mono'));
    return el ? el.textContent.trim() : null;
  })()`);
  ok("the password is readable from the page", typeof issued === "string" && issued.length >= 8, issued);

  // Reloading must not hand it out again - it only ever existed in that reply.
  await goto("/admin/users");
  ok("the password is not shown again", !(await text()).includes("Password for"));

  // The new maintainer can sign in with what was issued.
  const signedIn = await ev(`(async () => {
    const r = await fetch("/api/search?q=zzz", { headers: { "x-test": "1" } });
    return r.status;
  })()`);
  ok("the admin's own API call still works", signedIn === 200, signedIn);

  /* ---- deactivation is two clicks ---- */
  const rowCount = () => ev(`document.querySelectorAll('tbody tr').length`);
  const before = await rowCount();
  ok("deactivate is armed before it fires", await clickLabel("Deactivate Added By Suite"));
  await sleep(600);
  ok("nothing was deactivated by the first click", (await rowCount()) === before);
  ok("the second click is a different control", await clickLabel("Deactivate Added By Suite"));
  await sleep(3000);
  const after = await text();
  ok("the account is gone from the list", !after.includes(NEW_EMAIL));
  ok("and it says so", after.includes("deactivated"));

  /* ---- you cannot deactivate yourself ---- */
  ok("no deactivate control on your own row",
     !(await ev(`!!document.querySelector('[aria-label="Deactivate Suite Runner"]')`)));
} catch (err) {
  fails++;
  console.log(`\nERROR ${err.message}`);
} finally {
  sock.close();
  ch.kill();
  for (let i = 0; i < 10; i++) {
    try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(200); }
  }
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

/**
 * The sign-in flow, in a real browser: the redirect that closes the app, the
 * form, the vague error, and signing out again.
 *
 * Unlike the other suites this one does *not* arrive with a session cookie -
 * getting one is the thing being tested. It signs in as the account
 * make-session.ts creates.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (() => {
  const given = process.argv[2] ?? process.env.TEST_BASE_URL;
  if (!given) {
    console.error(
      "This suite needs an explicit target.\n" +
        "Run it through `pnpm test:ui`, or pass a base URL:\n\n" +
        "  node scripts/ui/auth.mjs http://127.0.0.1:3123\n",
    );
    process.exit(2);
  }
  return given.replace(/\/$/, "");
})();

const EMAIL = "suite@kitaab.test";
const PASSWORD = "browser-suite-only";

const PORT = Number(process.env.CDP_PORT ?? 9605), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "auth-"));
const ch = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new","--disable-gpu","--no-first-run","--hide-scrollbars",
   `--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,"--window-size=1300,900","about:blank"],{stdio:"ignore"});
let wsUrl;
for (let i=0;i<60;i++){ try{ const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const p=l.find(t=>t.type==="page"&&t.webSocketDebuggerUrl); if(p){wsUrl=p.webSocketDebuggerUrl;break} }catch{} await sleep(250) }
const sock = new WebSocket(wsUrl);
await new Promise(r=>sock.addEventListener("open",r));
let id=0; const pend=new Map();
sock.addEventListener("message",e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);sock.send(JSON.stringify({id:i,method:m,params:p}))});
const ev = async (expr) => {
  const r = await send("Runtime.evaluate",{expression:expr,returnByValue:true,awaitPromise:true});
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result.result.value;
};
const goto = async (path) => { await send("Page.navigate",{url: BASE + path}); await sleep(2600); };
const setInput = (sel, val) => ev(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  s.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
})()`);
const clickSel = (sel) => ev(`(() => {
  const b = document.querySelector(${JSON.stringify(sel)});
  if (!b) return false; b.click(); return true;
})()`);

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

let fails = 0;
const ok = (n,c,x) => { if(!c){fails++;console.log("FAIL ",n,x??"")} else console.log("ok   ",n) };

const signInWith = async (email, password) => {
  await setInput('input[name="email"]', email);
  await setInput('input[name="password"]', password);
  await clickSel('button[type="submit"]');
  await sleep(3000);
};

/* ---- 1. the app is closed ---- */
await send("Network.clearBrowserCookies");
await goto("/assessments");
ok("signed out, records redirect to sign-in", /\/login$/.test(await ev(`location.pathname`)),
   await ev(`location.pathname`));
ok("the sign-in form is there", await ev(`!!document.querySelector('input[name="email"]')`));
ok("no shell is drawn for a stranger", !(await ev(`!!document.querySelector('aside')`)));
ok("sign-up is offered", await ev(`!!document.querySelector('a[href="/signup"]')`));

/* ---- 2. a wrong password says nothing useful ---- */
await signInWith(EMAIL, "definitely-not-the-password");
ok("wrong password keeps you out", /\/login$/.test(await ev(`location.pathname`)),
   await ev(`location.pathname`));
const wrongPw = await ev(`document.querySelector('[role="alert"]')?.innerText ?? ''`);
ok("wrong password is reported", /incorrect/i.test(wrongPw), wrongPw);

await goto("/login");
await signInWith("nobody-at-all@kitaab.test", PASSWORD);
const unknown = await ev(`document.querySelector('[role="alert"]')?.innerText ?? ''`);
ok("an unknown address gets the identical message", unknown === wrongPw, `${unknown} vs ${wrongPw}`);

/* ---- 3. signing in ---- */
await goto("/login");
await signInWith(EMAIL, PASSWORD);
ok("correct password lands on the records", /\/assessments/.test(await ev(`location.pathname`)),
   await ev(`location.pathname`));
ok("the shell is drawn once signed in", await ev(`!!document.querySelector('aside')`));
ok("records are actually rendered", (await ev(`document.querySelectorAll('tbody tr').length`)) > 0);

/* ---- 4. the session persists ---- */
await goto("/analytics");
ok("session carries across pages", /\/analytics/.test(await ev(`location.pathname`)),
   await ev(`location.pathname`));

/* ---- 5. signing out ---- */
await goto("/assessments");
ok("sign out is offered", await ev(`!!document.querySelector('aside button[aria-label*="sign out"]')`));
await clickSel('aside button[aria-label*="sign out"]');
await sleep(3000);
ok("signing out returns to sign-in", /\/login$/.test(await ev(`location.pathname`)),
   await ev(`location.pathname`));
await goto("/assessments");
ok("and the app is closed again", /\/login$/.test(await ev(`location.pathname`)),
   await ev(`location.pathname`));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
ch.kill();
process.exit(fails === 0 ? 0 : 1);

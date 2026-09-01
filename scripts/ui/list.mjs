import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BASE = (() => {
  const given = process.argv[2] ?? process.env.TEST_BASE_URL;
  if (!given) {
    console.error(
      "This suite creates and deletes records, so it will not guess a target.\n" +
        "Run it through `pnpm test:ui`, which boots a server on a throwaway\n" +
        "database, or pass a base URL explicitly:\n\n" +
        "  node " + process.argv[1].replace(process.cwd() + "/", "") + " http://127.0.0.1:3123\n",
    );
    process.exit(2);
  }
  return given.replace(/\/$/, "");
})();
const PORT = Number(process.env.CDP_PORT ?? 9602), sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "ft-"));
const ch = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new","--disable-gpu","--no-first-run","--hide-scrollbars",
   `--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,"--window-size=1500,900","about:blank"],{stdio:"ignore"});
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
const goto = async (path) => { await send("Page.navigate",{url: BASE + ""+path}); await sleep(3200); };
const key = async (k, code, mods=0, text) => {
  for (const type of ["rawKeyDown", ...(text?["char"]:[]), "keyUp"])
    await send("Input.dispatchKeyEvent",{type,key:k,code,text:type==="char"?text:undefined,modifiers:mods});
};
const setInput = (sel, val) => ev(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  s.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
})()`);
// summary elements are the popover triggers, so they count as clickable too
const clickText = (t) => ev(`(() => {
  const b = [...document.querySelectorAll('button,a,summary')].find(x => x.textContent.trim().startsWith(${JSON.stringify(t)}));
  if (!b) return false; b.click(); return true;
})()`);

await send("Page.enable"); await send("Runtime.enable");
let fails = 0;
const ok = (n,c,x) => { if(!c){fails++;console.log("FAIL ",n,x??"")} else console.log("ok   ",n) };

/* ---- 2. default page size ---- */
await goto("/assessments");
ok("default page shows 10 rows", await ev(`document.querySelectorAll('tbody tr').length`) === 10,
   await ev(`document.querySelectorAll('tbody tr').length`));
ok("pagination offers 10 first", (await ev(`document.body.innerText`)).includes("10"));
// Derived from the data on the page rather than a hardcoded record count, so
// this holds against any seeded database.
const pager = await ev(`document.body.innerText`);
const shown = pager.match(/(\d+)\s*[–-]\s*(\d+) of ([\d,]+)/);
const pages = pager.match(/(\d+) \/ (\d+)/);
ok("pagination reports a range out of a total", !!shown, pager.match(/of [\d,]+/)?.[0]);
ok("page count is the total over 10 per page", !!pages &&
   Number(pages[2]) === Math.ceil(Number(shown[3].replace(/,/g, "")) / 10),
   shown && pages ? `${shown[3]} records, ${pages[2]} pages` : "unparsed");

/* ---- 3. inline keyword search ---- */
ok("search box lives in the list header", await ev(`!!document.querySelector('input[aria-label="Filter records by keyword"]')`));
ok("rail no longer carries a search box",
   !(await ev(`!!document.querySelector('aside input')`)));
await setInput('input[aria-label="Filter records by keyword"]', "kochi");
await sleep(1800);
ok("typing filters the list in place", /[?&]q=kochi/.test(await ev(`location.href`)), await ev(`location.href`));
const rowsText = await ev(`document.querySelector('tbody').innerText`);
ok("results are actually narrowed", rowsText.toLowerCase().includes("kochi"));
ok("keyword is not duplicated as a chip",
   !(await ev(`[...document.querySelectorAll('span')].some(s => s.textContent.trim() === 'Search')`)));

// "/" focuses it
await goto("/assessments");
await key("/", "Slash", 0, "/");
await sleep(400);
ok("slash focuses the keyword box",
   await ev(`document.activeElement?.getAttribute('aria-label') === 'Filter records by keyword'`));

/* ---- ⌘K still there ---- */
await key("k","KeyK",4,"k");
await sleep(700);
ok("⌘K still opens the palette", await ev(`!!document.querySelector('[role="dialog"][aria-label="Command palette"]')`));
await key("Escape","Escape");
await sleep(400);

/* ---- 4. multi-level sort ---- */
ok("sort control present", await clickText("Sort"));
await sleep(500);
await sleep(400);
const sortPanel = await ev(`[...document.querySelectorAll('details')].find(d => d.open)?.innerText || ''`);
ok("sort menu lists the current level", /order by/i.test(sortPanel) && /last updated/i.test(sortPanel), sortPanel.slice(0,60));
ok("sort menu offers tie-breakers", /then break ties by/i.test(sortPanel));
await goto("/assessments?sort=location:asc,name:asc");
const sorted = await ev(`[...document.querySelectorAll('tbody tr')].map(r => r.children[3].innerText.trim())`);
ok("primary sort applied", sorted.length > 1 && sorted[0] <= sorted[sorted.length-1], sorted.slice(0,3));
const names = await ev(`[...document.querySelectorAll('tbody tr')].map(r => ({loc: r.children[3].innerText.trim(), name: r.children[2].innerText.split('\\n')[0].trim()}))`);
let tieOk = true;
for (let i=1;i<names.length;i++) if (names[i-1].loc === names[i].loc && names[i-1].name > names[i].name) tieOk = false;
ok("second level breaks ties", tieOk, names.slice(0,4));
ok("sort levels are numbered in the header", (await ev(`document.querySelector('thead').innerText`)).match(/\d/) !== null);

/* ---- 1. new record modal ---- */
await goto("/assessments");
ok("New record clicks through", await clickText("New record"));
await sleep(2600);
ok("opens as a modal", await ev(`!!document.querySelector('[role="dialog"][aria-label="Add records"]')`));
ok("list is still behind it", await ev(`!!document.querySelector('table tbody tr')`));
ok("url is the real route", /\/assessments\/new/.test(await ev(`location.href`)), await ev(`location.href`));
ok("paste tab reachable inside the modal", await clickText("Paste multiple"));
await sleep(1500);
ok("paste form rendered in the modal", (await ev(`document.querySelector('[role="dialog"]').innerText`)).includes("Column order"));
await key("Escape","Escape");
await sleep(1800);
ok("escape closes it", !(await ev(`!!document.querySelector('[role="dialog"][aria-label="Add records"]')`)));
ok("back on the list", /\/assessments(\?|$)/.test(await ev(`location.href`)), await ev(`location.href`));

// direct visit is still a full page
await goto("/assessments/new");
ok("direct visit renders the full page, not a modal",
   !(await ev(`!!document.querySelector('[role="dialog"]')`)) && (await ev(`document.body.innerText`)).includes("Add records"));

// A screenshot is an optional second argument; argv[2] is the base URL.
if (process.argv[3]) {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(process.argv[3], Buffer.from(shot.result.data, "base64"));
}
console.log(fails===0 ? "\nALL PASS" : `\n${fails} FAILED`);
sock.close(); ch.kill();
process.exit(fails===0?0:1);

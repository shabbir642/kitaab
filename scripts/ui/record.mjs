import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BASE = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const PORT = Number(process.env.CDP_PORT ?? 9603), sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "dt-"));
const ch = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new","--disable-gpu","--no-first-run","--hide-scrollbars",
   `--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,"--window-size=1500,940","about:blank"],{stdio:"ignore"});
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
const goto = async (p) => { await send("Page.navigate",{url: BASE + ""+p}); await sleep(3200); };
const setVal = (sel, val, tag="HTMLTextAreaElement") => ev(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  const s = Object.getOwnPropertyDescriptor(window[${JSON.stringify(tag)}].prototype,'value').set;
  s.call(el, ${JSON.stringify(val)});
  el.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
})()`);
const clickText = (t) => ev(`(() => {
  const b = [...document.querySelectorAll('button,a,summary')].find(x => x.textContent.trim() === ${JSON.stringify(t)});
  if (!b) return false; b.click(); return true;
})()`);
await send("Page.enable"); await send("Runtime.enable");

let fails = 0;
const ok = (n,c,x) => { if(!c){fails++;console.log("FAIL ",n,x??"")} else console.log("ok   ",n) };
const stamp = Date.now();

// find a record to work on
await goto("/assessments?perPage=10");
const href = await ev(`document.querySelector('tbody a[href^="/assessments/"]').getAttribute('href')`);
await goto(href);
const body0 = await ev(`document.body.innerText`);

/* ---- layout: priority fields up top, room below ---- */
ok("phase track sits at the top", /SURVEY[\s\S]{0,80}COMPLETION/i.test(body0));
ok("list fields are a compact strip", /LOCATION[\s\S]{0,200}LAST UPDATED/i.test(body0));
ok("notes section present", /Notes/.test(body0));
ok("additional details section present", /Additional details/.test(body0));
ok("remarks is its own field", /REMARKS/i.test(body0));
const stripTop = await ev(`(() => {
  const dl = document.querySelector('dl');
  return dl ? Math.round(dl.getBoundingClientRect().bottom) : -1;
})()`);
ok("priority strip ends in the top third of the screen", stripTop > 0 && stripTop < 340, stripTop);

/* ---- notes ---- */
await setVal('textarea[aria-label="New note"]', `note-${stamp} chased the coordinator`);
ok("add note submits", await clickText("Add note"));
await sleep(2800);
const afterNote = await ev(`document.body.innerText`);
ok("note appears on the record", afterNote.includes(`note-${stamp}`));
ok("note count updated", /Notes\s*\n?\s*1/.test(afterNote) || /Notes[\s\S]{0,10}1/.test(afterNote));
ok("composer cleared after submit", (await ev(`document.querySelector('textarea[aria-label="New note"]').value`)) === "");

// a blank note is refused
ok("blank note submits", await clickText("Add note"));
await sleep(1800);
ok("blank note refused", /Write something first/.test(await ev(`document.body.innerText`)));

/* ---- inline remarks edit ---- */
ok("remarks edit opens", await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Edit Remarks');
  if (!b) return false; b.click(); return true;
})()`));
await sleep(600);
ok("remarks textarea focused", await ev(`document.activeElement?.tagName === 'TEXTAREA'`));
ok("remarks field is labelled", await setVal('textarea[aria-label="Remarks"]', `remark-${stamp}`));
ok("remarks save clicks", await clickText("Save"));
await sleep(2600);
ok("remarks persisted", (await ev(`document.body.innerText`)).includes(`remark-${stamp}`));

/* ---- custom field ---- */
ok("add field opens", await clickText("Add field"));
await sleep(500);
await setVal('input[aria-label="New field name"]', "Batch", "HTMLInputElement");
await setVal('input[aria-label="New field value"]', `B-${stamp}`, "HTMLInputElement");
ok("add field submits", await clickText("Add"));
await sleep(2600);
const afterExtra = await ev(`document.body.innerText`);
ok("custom field shown", /BATCH/i.test(afterExtra) && afterExtra.includes(`B-${stamp}`));

/* ---- edit modal over the record ---- */
ok("edit clicks through", await clickText("Edit"));
await sleep(2800);
ok("edit opens as a modal", await ev(`!!document.querySelector('[role="dialog"][aria-label="Edit record"]')`));
ok("record still behind the modal", (await ev(`document.body.innerText`)).includes("Additional details"));
ok("modal is prefilled with the core fields",
   (await ev(`document.querySelector('[role="dialog"] input[name="assessmentId"]').value`)).length > 0);
ok("url is the real edit route", /\/edit$/.test(await ev(`location.href`)), await ev(`location.href`));
await setVal('[role="dialog"] input[name="location"]', `Zzz-${stamp}`, "HTMLInputElement");
ok("save changes clicks", await ev(`(() => {
  const b = [...document.querySelectorAll('[role="dialog"] button')].find(x => x.textContent.trim().startsWith('Save changes'));
  if (!b) return false; b.click(); return true;
})()`));
await sleep(3500);
ok("modal closed after saving", !(await ev(`!!document.querySelector('[role="dialog"][aria-label="Edit record"]')`)));
ok("back on the record", !/\/edit/.test(await ev(`location.href`)), await ev(`location.href`));
ok("edit landed", (await ev(`document.body.innerText`)).includes(`Zzz-${stamp}`));

// direct visit is a full page
await goto(href + "/edit");
ok("direct edit URL is a full page", !(await ev(`!!document.querySelector('[role="dialog"]')`))
   && (await ev(`document.body.innerText`)).includes("Edit record"));

/* ---- clean up what this run created ---- */
await goto(href);
await ev(`(() => {
  const f = [...document.querySelectorAll('form')].find(x => x.querySelector('input[name="noteId"]'));
  if (f) f.requestSubmit();
})()`);
await sleep(2200);
ok("note deleted", !(await ev(`document.body.innerText`)).includes(`note-${stamp}`));
await ev(`(() => {
  const f = [...document.querySelectorAll('form')].find(x => x.querySelector('input[name="key"]'));
  if (f) f.requestSubmit();
})()`);
await sleep(2200);
ok("custom field removed", !(await ev(`document.body.innerText`)).includes(`B-${stamp}`));

// A screenshot is an optional second argument; argv[2] is the base URL.
if (process.argv[3]) {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(process.argv[3], Buffer.from(shot.result.data, "base64"));
}
console.log(fails===0 ? "\nALL PASS" : `\n${fails} FAILED`);
sock.close(); ch.kill();
process.exit(fails===0?0:1);

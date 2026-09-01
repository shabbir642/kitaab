import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
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
const PORT = Number(process.env.CDP_PORT ?? 9601), sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "pal-"));
const ch = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new","--disable-gpu","--no-first-run",`--remote-debugging-port=${PORT}`,
   `--user-data-dir=${profile}`,"--window-size=1500,900","about:blank"],{stdio:"ignore"});
let wsUrl;
for (let i=0;i<60;i++){ try{ const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const p=l.find(t=>t.type==="page"&&t.webSocketDebuggerUrl); if(p){wsUrl=p.webSocketDebuggerUrl;break} }catch{} await sleep(250) }
const sock = new WebSocket(wsUrl);
await new Promise(r=>sock.addEventListener("open",r));
let id=0; const pend=new Map();
sock.addEventListener("message",e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);sock.send(JSON.stringify({id:i,method:m,params:p}))});
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate",{expression:expr,returnByValue:true,awaitPromise:true});
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result.result.value;
};
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate",{url: BASE + "/assessments"});
await sleep(4000);

let fails = 0;
const ok = (n,c,x) => { if(!c){fails++;console.log("FAIL ",n,x??"")} else console.log("ok   ",n) };

// open with Cmd+K
for (const type of ["rawKeyDown","char","keyUp"]) {
  await send("Input.dispatchKeyEvent",{type,key:"k",code:"KeyK",text:type==="char"?"k":undefined,modifiers:4,windowsVirtualKeyCode:75});
}
await sleep(700);
ok("⌘K opens the palette", await evaluate(`!!document.querySelector('[role="dialog"][aria-label="Command palette"]')`));
ok("views listed by default", (await evaluate(`document.querySelector('[role="dialog"]').innerText`)).includes("Awaiting completion"));
ok("actions listed by default", (await evaluate(`document.querySelector('[role="dialog"]').innerText`)).includes("Paste multiple records"));

// type a query -> record hits arrive from the server
await evaluate(`(() => {
  const el = document.querySelector('[role="dialog"] input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(el, 'kochi');
  el.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
})()`);
await sleep(1400);
const txt = await evaluate(`document.querySelector('[role="dialog"]').innerText`);
ok("location filter offered", /Location is Kochi/.test(txt), txt.slice(0,160));
ok("record hits returned from the server", /Kochi \d+/.test(txt));
ok("search-all fallback offered", /Search all records for "kochi"/.test(txt));

// arrow + enter navigates
await send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});
await send("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});
await send("Input.dispatchKeyEvent",{type:"rawKeyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
await sleep(2500);
const url = await evaluate(`location.href`);
ok("enter navigates somewhere real", /assessments/.test(url), url);
ok("palette closed after navigating", !(await evaluate(`!!document.querySelector('[role="dialog"]')`)));

// rail: saved view + active state
await send("Page.navigate",{url: BASE + "/assessments?flags=overdue"});
await sleep(3000);
ok("rail marks the active view", await evaluate(`!!document.querySelector('aside a[aria-current="page"]')`));
ok("active view is Overdue", (await evaluate(`document.querySelector('aside a[aria-current="page"]').innerText`)).includes("Overdue"));
ok("header names the view", (await evaluate(`document.querySelector('h1').innerText`)) === "Overdue");

await send("Page.navigate",{url: BASE + "/assessments?location=Kochi"});
await sleep(3000);
ok("location view highlights in the rail", (await evaluate(`document.querySelector('aside a[aria-current="page"]')?.innerText || ''`)).includes("Kochi"));
ok("header names the location", (await evaluate(`document.querySelector('h1').innerText`)) === "Kochi");

// an extra filter on top of a view stops the highlight
await send("Page.navigate",{url: BASE + "/assessments?flags=overdue&location=Kochi"});
await sleep(3000);
ok("compound filters clear the view highlight", !(await evaluate(`!!document.querySelector('aside a[aria-current="page"]')`)));
ok("both chips shown", (await evaluate(`document.body.innerText`)).includes("Overdue") && (await evaluate(`document.body.innerText`)).includes("Kochi"));

console.log(fails===0 ? "\nALL PASS" : `\n${fails} FAILED`);
sock.close(); ch.kill();
process.exit(fails===0?0:1);

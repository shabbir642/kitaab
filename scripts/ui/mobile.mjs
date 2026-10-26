/**
 * Every signed-in page at phone size.
 *
 * Written after sign-in and sign-up shipped with 12px inputs - which makes iOS
 * Safari zoom the whole page the moment a field is focused - and after finding
 * that the note-delete and inline-edit controls only appeared on hover, and so
 * could not be reached on a touch screen at all.
 *
 * Checks: nothing scrolls sideways, no field is small enough to trigger the
 * zoom, every control is a thumb-sized target, and each dropdown still fits on
 * screen once opened.
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
        "  node scripts/ui/mobile.mjs http://127.0.0.1:3123\n",
    );
    process.exit(2);
  }
  return given.replace(/\/$/, "");
})();

const PORT = Number(process.env.CDP_PORT ?? 9606), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "mobile-"));
const ch = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new","--disable-gpu","--no-first-run","--hide-scrollbars",
   `--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,"about:blank"],{stdio:"ignore"});
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
const goto = async (path) => { await send("Page.navigate",{url: BASE + path}); await sleep(3000); };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
if (!process.env.TEST_SESSION) {
  console.error("TEST_SESSION is not set - run this through `pnpm test:ui`.");
  process.exit(2);
}
await send("Network.setCookie", { name: "kitaab_session", value: process.env.TEST_SESSION, url: BASE });
// iPhone-ish. The narrowest thing anyone is realistically holding.
await send("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
});

let fails = 0;
const ok = (n,c,x) => { if(!c){fails++;console.log("FAIL ",n,x??"")} else console.log("ok   ",n) };

// A collapsed <details> still lays its contents out, cramped and off screen.
// Measuring those would report failures nobody can see or tap, so anything
// inside a closed menu is skipped here and checked when opened instead.
const VISIBLE = "input:not([type=hidden]):not([type=checkbox]), button, a, summary, select, textarea";
const LIVE = `function live(e) {
  var d = e.closest('details');
  return !d || d.hasAttribute('open');
}`;

const PAGES = [
  ["/assessments", "the records list"],
  ["/assessments?flags=overdue", "a filtered view"],
  ["/analytics", "analytics"],
  ["/assessments/new", "the new record form"],
  ["/assessments/new?mode=paste", "the paste form"],
  ["/account", "the account screen"],
  ["/admin/users", "the people screen"],
];

const recordId = await (async () => {
  await goto("/assessments");
  // The first such link is "New record", which has no id - so take the first
  // href that actually ends in one.
  return ev(`(function(){
    var links = document.querySelectorAll('a[href^="/assessments/"]');
    for (var i = 0; i < links.length; i++) {
      var m = links[i].getAttribute('href').match(/^\\/assessments\\/(\\d+)$/);
      if (m) return m[1];
    }
    return null;
  })()`);
})();
if (recordId) {
  PAGES.push([`/assessments/${recordId}`, "a record"]);
  PAGES.push([`/assessments/${recordId}/edit`, "the edit form"]);
}

for (const [path, label] of PAGES) {
  await goto(path);

  ok(`${label} does not scroll sideways`,
     await ev(`document.documentElement.scrollWidth <= window.innerWidth`),
     await ev(`document.documentElement.scrollWidth + ' vs ' + window.innerWidth`));

  // Below 16px iOS Safari zooms the page on focus and the reader has to pinch back.
  ok(`${label} has no zoom-triggering fields`,
     await ev(`[...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), textarea, select')]
       .every(function(i){ return parseFloat(getComputedStyle(i).fontSize) >= 16; })`),
     await ev(`[...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), textarea, select')]
       .filter(function(i){ return parseFloat(getComputedStyle(i).fontSize) < 16; })
       .map(function(i){ return (i.name||i.type) + ':' + parseFloat(getComputedStyle(i).fontSize); }).join(', ')`));

  ok(`${label} has thumb-sized controls`,
     await ev(`(function(){ ${LIVE}
       return [...document.querySelectorAll(${JSON.stringify(VISIBLE)})].filter(live)
         .every(function(e){ var r = e.getBoundingClientRect();
           return r.height === 0 || Math.min(r.width, r.height) >= 32; });
     })()`),
     await ev(`(function(){ ${LIVE}
       return [...document.querySelectorAll(${JSON.stringify(VISIBLE)})].filter(live)
         .filter(function(e){ var r = e.getBoundingClientRect();
           return r.height > 0 && Math.min(r.width, r.height) < 32; })
         .map(function(e){ var r = e.getBoundingClientRect();
           return (e.getAttribute('aria-label') || e.textContent.trim().slice(0,14) || e.tagName) +
             ':' + Math.round(r.width) + 'x' + Math.round(r.height); }).slice(0,5).join(' | ');
     })()`));
}

/* A fixed-width dropdown anchored to a trigger runs off the right edge of a
   phone. Each one is opened and measured. */
await goto("/assessments");
const menus = await ev(`document.querySelectorAll('details').length`);
ok("the list has dropdowns to check", menus > 0, menus);
for (let i = 0; i < menus; i++) {
  const name = await ev(`document.querySelectorAll('details')[${i}].querySelector('summary').textContent.trim().slice(0,16)`);
  await ev(`(function(){
    document.querySelectorAll('details').forEach(function(d){ d.removeAttribute('open'); });
    document.querySelectorAll('details')[${i}].setAttribute('open','');
    return true;
  })()`);
  await sleep(700);
  ok(`the ${name} menu fits on screen`, await ev(`(function(){
    var d = document.querySelectorAll('details')[${i}];
    var p = d.querySelector('summary').nextElementSibling;
    if (!p) return true;
    var r = p.getBoundingClientRect();
    return r.left >= -1 && r.right <= window.innerWidth + 1;
  })()`), await ev(`(function(){
    var p = document.querySelectorAll('details')[${i}].querySelector('summary').nextElementSibling;
    var r = p.getBoundingClientRect();
    return Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + window.innerWidth;
  })()`));
  ok(`the ${name} menu has thumb-sized options`, await ev(`(function(){
    var p = document.querySelectorAll('details')[${i}].querySelector('summary').nextElementSibling;
    if (!p) return true;
    return [...p.querySelectorAll('button, a, input:not([type=hidden]):not([type=checkbox])')]
      .every(function(e){ var r = e.getBoundingClientRect();
        return r.height === 0 || Math.min(r.width, r.height) >= 32; });
  })()`));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
ch.kill();
process.exit(fails === 0 ? 0 : 1);

/**
 * The app shell: the sidebar toggle, the mobile drawer, and what the layout
 * does at phone width. Written because the collapse button shipped as a bare
 * icon with no handler - a control that looks live and does nothing is exactly
 * what a browser suite is for.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (() => {
  const given = process.argv[2] ?? process.env.TEST_BASE_URL;
  if (!given) {
    console.error(
      "This suite needs an explicit target.\n" +
        "Run it through `pnpm test:ui`, or pass a base URL:\n\n" +
        "  node scripts/ui/shell.mjs http://127.0.0.1:3123\n",
    );
    process.exit(2);
  }
  return given.replace(/\/$/, "");
})();

const PORT = Number(process.env.CDP_PORT ?? 9604);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "shell-"));
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
   `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"],
  { stdio: "ignore" },
);

let wsUrl;
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch { /* not up yet */ }
  await sleep(250);
}

const sock = new WebSocket(wsUrl);
await new Promise((r) => sock.addEventListener("open", r));
let id = 0;
const pending = new Map();
sock.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) =>
  new Promise((r) => { const i = ++id; pending.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result.result.value;
};

let fails = 0;
const ok = (name, cond, extra) => {
  if (!cond) { fails++; console.log(`FAIL  ${name}`, extra ?? ""); }
  else console.log(`ok    ${name}`);
};

const viewport = (width, mobile) =>
  send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile });
const goto = async (path) => { await send("Page.navigate", { url: BASE + path }); await sleep(2600); };
const railBox = () => ev(`(() => {
  const a = document.querySelector('aside');
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return { left: Math.round(r.left), width: Math.round(r.width), visible: r.right > 0 };
})()`);
const clickLabel = (label) => ev(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === ${JSON.stringify(label)});
  if (!b) return false; b.click(); return true;
})()`);

try {
  await send("Page.enable");
  await send("Runtime.enable");

  /* ================= desktop ================= */
  await viewport(1440, false);
  await goto("/assessments");

  let box = await railBox();
  ok("rail is a column on a wide screen", box && box.left === 0 && box.width === 236, box);
  ok("no mobile bar on a wide screen", !(await ev(`!!document.querySelector('button[aria-label="Open the sidebar"]:not(.hidden)')`))
    || (await ev(`(() => { const b = document.querySelector('button[aria-label="Open the sidebar"]'); return b ? getComputedStyle(b.parentElement).display === 'none' : true; })()`)));

  ok("collapse control exists and is a button", await ev(`(() => {
    const b = document.querySelector('aside button[aria-label="Collapse the sidebar"]');
    return !!b && b.tagName === 'BUTTON';
  })()`));

  ok("collapse clicks", await clickLabel("Collapse the sidebar"));
  await sleep(900);
  box = await railBox();
  ok("rail narrowed to an icon strip", box && box.width > 0 && box.width < 80, box);
  ok("view labels are gone", !(await ev(`document.querySelector('aside').innerText.includes('Awaiting completion')`)));
  ok("view icons remain", (await ev(`document.querySelectorAll('aside a svg').length`)) >= 5);

  // the collapsed state has to survive a reload, or it is not a preference
  await goto("/assessments");
  box = await railBox();
  ok("collapsed state persisted", box && box.width < 80, box);

  ok("expand clicks", await clickLabel("Expand the sidebar"));
  await sleep(900);
  box = await railBox();
  ok("rail expands again", box && box.width === 236, box);
  ok("labels are back", await ev(`document.querySelector('aside').innerText.includes('Awaiting completion')`));

  /* ================= phone ================= */
  await viewport(390, true);
  await goto("/assessments");

  box = await railBox();
  ok("rail is off-canvas on a phone", box && box.left <= -200, box);
  ok("content gets the whole width", (await ev(`Math.round(document.querySelector('main').getBoundingClientRect().width)`)) >= 380);
  ok("page does not scroll sideways", await ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`),
     await ev(`document.documentElement.scrollWidth + ' vs ' + document.documentElement.clientWidth`));
  ok("the wide table still scrolls inside its own container", await ev(`(() => {
    const t = document.querySelector('table');
    const s = t && t.closest('[class*="overflow-x"]');
    return !!s && s.scrollWidth > s.clientWidth;
  })()`));

  ok("a way to open the sidebar exists", await ev(`!!document.querySelector('button[aria-label="Open the sidebar"]')`));
  ok("opening it clicks", await clickLabel("Open the sidebar"));
  await sleep(700);
  box = await railBox();
  ok("drawer slid in", box && box.left === 0 && box.width === 236, box);
  ok("a backdrop covers the content", await ev(`document.querySelectorAll('[role="presentation"]').length > 0`));

  // tapping a destination should navigate AND close, or the drawer covers the result
  ok("tapping a view navigates", await ev(`(() => {
    const a = [...document.querySelectorAll('aside a')].find((x) => x.textContent.includes('Overdue'));
    if (!a) return false; a.click(); return true;
  })()`));
  await sleep(2600);
  ok("landed on the view", /flags=overdue/.test(await ev(`location.href`)), await ev(`location.href`));
  box = await railBox();
  ok("drawer closed itself after navigating", box && box.left <= -200, box);

  // and escape closes it
  await clickLabel("Open the sidebar");
  await sleep(600);
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(700);
  box = await railBox();
  ok("escape closes the drawer", box && box.left <= -200, box);

  /* ================= tablet ================= */
  await viewport(768, false);
  await goto("/assessments");
  box = await railBox();
  ok("still a drawer at 768", box && box.left <= -200, box);

  await viewport(1024, false);
  await goto("/assessments");
  box = await railBox();
  ok("becomes a column at 1024", box && box.left === 0 && box.width === 236, box);
} catch (err) {
  fails++;
  console.log(`\nERROR ${err.message}`);
} finally {
  sock.close();
  chrome.kill();
  for (let i = 0; i < 10; i++) {
    try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(200); }
  }
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

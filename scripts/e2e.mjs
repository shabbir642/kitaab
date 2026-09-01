/**
 * End-to-end check of the forms and the server actions behind them, driven over
 * the Chrome DevTools Protocol using only Node built-ins (global WebSocket) and
 * headless Chrome. No test framework, no browser download.
 *
 *   node scripts/e2e.mjs                 # against http://127.0.0.1:3000
 *   node scripts/e2e.mjs https://host    # against a tunnel or deployment
 *
 * It creates a record, edits it, exercises the duplicate-ID and bad-date paths,
 * then deletes it - so it leaves the database as it found it.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
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
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const TAG = `E2E-${Date.now()}`;

let fails = 0;
const ok = (name, cond, extra) => {
  if (!cond) {
    fails++;
    console.log(`FAIL  ${name}`, extra === undefined ? "" : extra);
  } else {
    console.log(`ok    ${name}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- minimal CDP client ---------- */

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const handlers = new Set();
    let id = 0;

    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method) {
        for (const h of [...handlers]) h(msg);
      }
    });
    ws.addEventListener("error", reject);
    ws.addEventListener("open", () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const i = ++id;
            pending.set(i, { res, rej });
            ws.send(JSON.stringify({ id: i, method, params }));
          }),
        on: (h) => {
          handlers.add(h);
          return () => handlers.delete(h);
        },
        close: () => ws.close(),
      }),
    );
  });
}

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // debugger not listening yet
    }
    await sleep(250);
  }
  throw new Error("Chrome debugger never came up");
}

/* ---------- run ---------- */

const profile = mkdtempSync(join(tmpdir(), "kitaab-cdp-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--window-size=1400,900",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let cdp;
try {
  cdp = await connect(await findTarget());
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const evaluate = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`eval failed: ${r.exceptionDetails.text}`);
    }
    return r.result.value;
  };

  const waitForEvent = (method, timeout = 45000) =>
    new Promise((res, rej) => {
      const timer = setTimeout(() => {
        off();
        rej(new Error(`timeout waiting for ${method}`));
      }, timeout);
      const off = cdp.on((m) => {
        if (m.method === method) {
          clearTimeout(timer);
          off();
          res(m.params);
        }
      });
    });

  const goto = async (path) => {
    const loaded = waitForEvent("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: BASE + path });
    await loaded;
    // Server actions are inert until React attaches, so wait for hydration.
    await sleep(1200);
  };

  const text = () => evaluate("document.body.innerText");
  const url = () => evaluate("location.href");

  const waitFor = async (label, fn, timeout = 45000) => {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeout) {
      last = await fn();
      if (last) return last;
      await sleep(300);
    }
    throw new Error(`${label} never happened`);
  };

  const set = (name, value) =>
    evaluate(
      `(() => {
        const el = document.querySelector('[name=${JSON.stringify(name)}]');
        if (!el) return false;
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
    );

  // Links and <summary> triggers are clickable too - matching only <button>
  // once clicked an inline "Edit" instead of the header's Edit link.
  const clickText = (label) =>
    evaluate(
      `(() => {
        const b = [...document.querySelectorAll('button,a,summary')]
          .find((x) => x.textContent.trim() === ${JSON.stringify(label)});
        if (!b) return false;
        b.click();
        return true;
      })()`,
    );

  console.log(`driving ${BASE}\n`);

  /* ---- list renders ---- */
  await goto("/assessments");
  const listText = await text();
  ok("list page renders rows", /All records/.test(listText) && /ASSESSMENT/i.test(listText));
  ok("rail shows the saved views", /Awaiting completion/.test(listText) && /Data issues/.test(listText));

  /* ---- create ---- */
  await goto("/assessments/new");
  ok("new-record form present", await set("assessmentId", `${TAG}/A`));
  await set("name", "E2E created record");
  await set("location", "Testville");
  await set("assessor", "CDP");
  await set("surveyDate", "2026-06-01");
  await set("surveyStatus", "Completed");
  await set("completionDate", "2026-06-15");
  await set("completionStatus", "Completed");
  await set("remarks", "created by scripts/e2e.mjs");
  ok("submit button found", await clickText("Create record"));

  const created = await waitFor("redirect after create", async () => {
    const u = await url();
    return /\/assessments\/\d+\?saved=1/.test(u) ? u : null;
  });
  const recordId = Number(created.match(/assessments\/(\d+)/)[1]);
  ok("redirected to the new record", recordId > 0, created);
  const detail = await text();
  ok("record page shows what was saved", detail.includes(`${TAG}/A`) && detail.includes("E2E created record"));
  ok("derived turnaround computed", /TURNAROUND[\s\S]{0,24}14 days/i.test(detail),
     detail.match(/TURNAROUND[\s\S]{0,30}/i)?.[0]);
  ok("priority fields are a strip, not a form", /LOCATION[\s\S]{0,240}LAST UPDATED/i.test(detail));
  ok("record has a notes section", /Notes/.test(detail));

  /* ---- duplicate ID is refused ---- */
  await goto("/assessments/new");
  await set("assessmentId", `${TAG}/A`);
  await set("name", "duplicate attempt");
  await clickText("Create record");
  const dupMsg = await waitFor("duplicate warning", async () => {
    const t = await text();
    return /already in use/i.test(t) ? t : null;
  });
  ok("duplicate assessment ID refused", /already in use/i.test(dupMsg));
  ok("duplicate did not navigate away", /\/assessments\/new/.test(await url()));

  /* ---- backwards dates are refused ---- */
  await goto("/assessments/new");
  await set("assessmentId", `${TAG}/B`);
  await set("name", "backwards dates");
  await set("surveyDate", "2026-05-10");
  await set("completionDate", "2026-05-01");
  await clickText("Create record");
  const dateMsg = await waitFor("date warning", async () => {
    const t = await text();
    return /cannot precede the survey date/i.test(t) ? t : null;
  });
  ok("completion before survey refused", /cannot precede the survey date/i.test(dateMsg));

  /* ---- search finds it ---- */
  await goto(`/assessments?q=${encodeURIComponent(TAG)}`);
  ok("search finds the new record", (await text()).includes(`${TAG}/A`));

  /* ---- edit, now behind a modal over the record ---- */
  await goto(`/assessments/${recordId}`);
  ok("edit button found", await clickText("Edit"));
  await waitFor("edit modal opens", async () =>
    (await evaluate(`!!document.querySelector('[role="dialog"][aria-label="Edit record"]')`)) ? true : null,
  );
  await set("name", "E2E edited record");
  await set("completionStatus", "On Hold");
  ok("save button found", await clickText("Save changes"));
  await waitFor("modal closes after saving", async () =>
    (await evaluate(`!!document.querySelector('[role="dialog"][aria-label="Edit record"]')`)) ? null : true,
  );
  await goto(`/assessments/${recordId}`);
  const edited = await text();
  ok("edit persisted", edited.includes("E2E edited record") && edited.includes("On Hold"));

  /* ---- paste multiple ---- */
  await goto("/assessments/new?mode=paste");
  await set(
    "rows",
    [
      `${TAG}/P1\tPasted one\tTestville\tCDP\t2026-07-01\tCompleted\t2026-07-10\tCompleted\tvia paste`,
      `${TAG}/P2\tPasted two\tTestville\tCDP\t2026-07-02\tScheduled\t\tNot Started\t`,
      `${TAG}/P3\tBad date\tTestville\tCDP\t2026-02-31\tPending\t\tNot Started\t`,
    ].join("\n"),
  );
  await clickText("Add rows");
  const pasteMsg = await waitFor("paste result", async () => {
    const t = await text();
    return /Added \d+, skipped \d+/.test(t) ? t : null;
  });
  ok("paste added the good rows and skipped the bad one", /Added 2, skipped 1/.test(pasteMsg),
     pasteMsg.match(/Added \d+, skipped \d+/)?.[0]);
  ok("skipped row explains itself", /Not a real calendar date/i.test(pasteMsg));

  /* ---- bulk delete via the list ---- */
  await goto(`/assessments?q=${encodeURIComponent(TAG)}`);
  const selected = await evaluate(
    `(() => {
      const boxes = [...document.querySelectorAll('tbody input[type=checkbox]')];
      boxes.forEach((b) => b.click());
      return boxes.length;
    })()`,
  );
  ok("selected every matching row", selected >= 3, selected);
  await waitFor("bulk bar appears", async () => (/selected/.test(await text()) ? true : null));
  ok("delete button found", await clickText("Delete"));
  await waitFor("delete finished", async () => {
    await goto(`/assessments?q=${encodeURIComponent(TAG)}`);
    return /Nothing here/.test(await text()) ? true : null;
  });
  ok("all test records deleted", true);

  /* ---- analytics still renders ---- */
  await goto("/analytics");
  const an = await text();
  ok("analytics renders tiles and charts",
     /Median turnaround/.test(an) && /Survey status/.test(an) && /By location/.test(an));

  await goto("/analytics");
  const tableView = await evaluate(
    `(() => {
      const b = document.querySelector('[aria-label="Table view"]');
      if (!b) return false;
      b.click();
      return true;
    })()`,
  );
  ok("chart table-view toggle works", tableView);

  console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
} catch (err) {
  fails++;
  console.log(`\nERROR ${err.message}`);
} finally {
  cdp?.close();
  chrome.kill();
  // Chrome flushes its profile on the way out; retry briefly rather than race it.
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      await sleep(200);
    }
  }
}

process.exit(fails === 0 ? 0 : 1);

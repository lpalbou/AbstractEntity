// Headless UI capture harness (operator UI-refactor directive 2026-07-15).
// Connects the entity app to the live gateway via the shared connect modal,
// then screenshots the surfaces the refactor touches so before/after and
// adversarial review run on REAL connected chrome, not the demo shell.
//
// Usage: node scripts/ui_shots.mjs <out-dir> [entity]
// Env:   GW_TOKEN (bearer), GW_URL (default http://127.0.0.1:8080),
//        APP_URL (default http://127.0.0.1:3007)
import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";

const OUT = process.argv[2] || "/tmp/entity_shots/after";
const ENTITY = process.argv[3] || "ephemeral";
const APP = process.env.APP_URL || "http://127.0.0.1:3007";
const GW = process.env.GW_URL || "http://127.0.0.1:8080";
const TOKEN = process.env.GW_TOKEN || "";
const CHROME =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click the first element whose trimmed text matches `text` (exact or
 * contains). Returns whether it clicked. */
async function clickText(page, selector, text, { contains = true } = {}) {
  return page.evaluate(
    (sel, t, c) => {
      const els = [...document.querySelectorAll(sel)];
      const hit = els.find((e) => {
        const s = (e.textContent || "").trim();
        return c ? s.includes(t) : s === t;
      });
      if (hit) {
        hit.click();
        return true;
      }
      return false;
    },
    selector,
    text,
    contains,
  );
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot: ${name}.png`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--hide-scrollbars", "--window-size=1600,1000"],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();
  page.on("console", (m) => {
    const t = m.text();
    if (/error|fail|#FALLBACK/i.test(t)) console.log(`  [page] ${t.slice(0, 160)}`);
  });

  // 1) Boot at the gateway roster; the connect modal auto-opens signed-out.
  // NOTE: never networkidle on the entity view — the live SSE tail keeps the
  // connection open forever (the SSE-never-idles gotcha). domcontentloaded +
  // fixed settle is the reliable wait for this app.
  await page.goto(`${APP}/?gateway=${encodeURIComponent(GW)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(1500);

  // 2) Sign in through the shared modal (token → HttpOnly session cookies).
  if (TOKEN) {
    const tokenSel = 'input[placeholder*="token" i], input[type="password"]';
    await page.waitForSelector(tokenSel, { timeout: 8000 }).catch(() => {});
    const tokenInput = await page.$(tokenSel);
    if (tokenInput) {
      await tokenInput.click({ clickCount: 3 });
      await tokenInput.type(TOKEN, { delay: 2 });
      const signedIn = (await clickText(page, "button", "Sign in", { contains: true })) || (await clickText(page, "button", "Connect", { contains: true }));
      console.log(`  sign-in clicked: ${signedIn}`);
      await sleep(3000);
    }
  }
  await shot(page, "01_roster");

  // 3) Open the target entity (domcontentloaded — SSE tail never idles).
  await page.goto(`${APP}/?gateway=${encodeURIComponent(GW)}&entity=${encodeURIComponent(ENTITY)}&live=1`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await sleep(6000); // let the fold + force layout settle
  await shot(page, "02_graph_header");

  // 4) Right-side tabs (SideTabs render by icon+title; click by title text).
  for (const [name, tab] of [
    ["03_chat", "Chat"],
    ["04_detail", "Detail"],
    ["05_book", "Book"],
    ["06_health", "Health"],
    ["07_wave", "Wave"],
    ["08_ledger", "Ledger"],
  ]) {
    const ok = await clickText(page, "button, [role=tab], .st_tab, a", tab, { contains: true });
    await sleep(name === "07_wave" ? 2500 : 1200);
    if (name === "07_wave") {
      // Wait for the life to finish streaming (the harvest reads the fold;
      // a partial boot yields an empty corpus), then score the wave.
      for (let i = 0; i < 15; i++) {
        const booting = await page.evaluate(() => document.body.textContent?.includes("partial view") ?? false);
        if (!booting) break;
        await sleep(2000);
      }
      const pulled = (await clickText(page, "button", "read the wave", { contains: true })) || (await clickText(page, "button", "re-read", { contains: true }));
      if (pulled) {
        console.log("  pulled the wave (scoring…)");
        // Scoring reads every utterance through the gateway doors — poll
        // for the replay controls instead of guessing a fixed wait.
        for (let i = 0; i < 45; i++) {
          const ready = await page.evaluate(() => Boolean(document.querySelector(".cw_controls")));
          if (ready) break;
          await sleep(2000);
        }
        await sleep(2000);
      }
    }
    if (name === "03_chat") {
      // If a visit is already open on this home, rejoin it — the history
      // rehydrates and the inline cognition wave scores the last reply
      // (pixel-verifies the widget without billing a new LLM turn).
      const rejoined = await clickText(page, "button", "rejoin", { contains: true });
      if (rejoined) {
        console.log("  rejoined an open visit (chat history + inline wave)");
        await sleep(6000);
      }
    }
    await shot(page, name + (ok ? "" : "_MISS"));
  }

  // 5) Settings modal (the gear in the controls strip).
  const openedSettings = await clickText(page, "button", "Settings", { contains: true });
  await sleep(1200);
  await shot(page, "09_settings" + (openedSettings ? "" : "_MISS"));
  // Close it (Escape) before the next capture.
  await page.keyboard.press("Escape");
  await sleep(400);

  // 6) Appearance dialog (shared cluster — click by aria-label).
  const openedAppearance = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((e) => /appearance/i.test(e.getAttribute("aria-label") || ""));
    if (b) {
      b.click();
      return true;
    }
    return false;
  });
  await sleep(800);
  await shot(page, "10_appearance" + (openedAppearance ? "" : "_MISS"));
  await page.keyboard.press("Escape");
  await sleep(400);

  // 7) Assistant drawer (shared cluster).
  const openedAssistant = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((e) => /assistant/i.test(e.getAttribute("aria-label") || ""));
    if (b) {
      b.click();
      return true;
    }
    return false;
  });
  await sleep(800);
  await shot(page, "11_assistant" + (openedAssistant ? "" : "_MISS"));
  await page.keyboard.press("Escape");
  await sleep(400);

  // 8) LIGHT THEME sanity (theme compliance is a promise the CSS must
  // keep): flip the persisted appearance to a light theme and re-render
  // the graph page + settings. Restores dark afterwards.
  await page.evaluate(() => {
    localStorage.setItem("af_appearance_abstractentity_v1", JSON.stringify({ theme: "catppuccin-latte", font: { family: "system", scale: 1 } }));
  });
  await page.goto(`${APP}/?gateway=${encodeURIComponent(GW)}&entity=${encodeURIComponent(ENTITY)}&live=1`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await sleep(6000);
  await shot(page, "12_light_graph");
  await clickText(page, "button", "Settings", { contains: true });
  await sleep(1000);
  await shot(page, "13_light_settings");
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    localStorage.setItem("af_appearance_abstractentity_v1", JSON.stringify({ theme: "observer-night", font: { family: "system", scale: 1 } }));
  });

  await browser.close();
  console.log("done →", OUT);
}

main().catch((e) => {
  console.error("harness failed:", e.message);
  process.exit(1);
});

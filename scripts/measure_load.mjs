// Journey-load measurement (operator dm#10: "initial loading is a bit slow").
// Opens one entity COLD (no cache), then again WARM (IndexedDB life cache),
// and prints time-to-first-graph and time-to-complete for both. Runs against
// the live gateway through the app's own auth modal — the numbers are what
// the operator actually experiences.
//
// Usage: GW_TOKEN=… node scripts/measure_load.mjs [entity]
// Env:   GW_URL (default http://127.0.0.1:8080), APP_URL (default :5199)
import puppeteer from "puppeteer-core";

const ENTITY = process.argv[2] || "ephemeral";
const APP = process.env.APP_URL || "http://127.0.0.1:3007";
// Empty GW_URL = the app-origin session-proxy posture (no ?gateway param).
const GW = process.env.GW_URL ?? "";
const TOKEN = process.env.GW_TOKEN || "";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until the life is loaded: content painted (graph canvas or ledger
 * rows) AND the boot-progress chip has come and gone. Samples every 100ms.
 * first-paint = first sample with content; total = boot chip cleared. */
async function timeLoad(page, url) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  let firstPaintMs = null;
  let bootSeen = false;
  for (;;) {
    const state = await page.evaluate(() => ({
      booting: !!document.querySelector(".eh_bootprogress"),
      content: document.querySelectorAll(".el_row").length > 0 || !!document.querySelector("canvas"),
      err: document.querySelector(".ev_error")?.textContent?.slice(0, 80) || null,
    }));
    if (state.err) return { total: -1, firstPaint: firstPaintMs, err: state.err };
    if (state.booting) bootSeen = true;
    if (firstPaintMs === null && state.content) firstPaintMs = Date.now() - t0;
    // Done: content present and either the boot chip finished, or 1.5s
    // passed with content and no chip (instant cache paint can clear the
    // chip between samples).
    if (state.content && !state.booting && (bootSeen || Date.now() - t0 > 1500)) {
      return { total: Date.now() - t0, firstPaint: firstPaintMs };
    }
    if (Date.now() - t0 > 90000) return { total: -1, firstPaint: firstPaintMs };
    await sleep(100);
  }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--window-size=1600,1000"],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();

  // Sign in once through the modal (user + token → session cookies).
  const gwParam = GW ? `?gateway=${encodeURIComponent(GW)}` : "";
  await page.goto(`${APP}/${gwParam}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(1500);
  // The user field pre-fills "admin"; only fill it when EMPTY (typing over
  // a pre-filled value appended once: "adminadmin" sign-in failure).
  await page.evaluate((user) => {
    const inputs = [...document.querySelectorAll('input[type="text"]')];
    const userField = inputs.find((i) => /admin/i.test(i.placeholder || "") || /user/i.test(i.previousElementSibling?.textContent || ""));
    if (userField && !userField.value.trim()) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(userField, user);
      userField.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, process.env.GW_USER || "admin");
  const tokenInput = await page.$('input[type="password"]');
  let signedIn = false;
  if (tokenInput) {
    await tokenInput.click({ clickCount: 3 });
    await tokenInput.type(TOKEN, { delay: 2 });
    await sleep(300);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const b = btns.find((x) => /^sign in$/i.test((x.textContent || "").trim()));
      if (b) b.click();
    });
    // The session exchange + roster reload can take a few seconds — poll.
    for (let i = 0; i < 40 && !signedIn; i++) {
      await sleep(300);
      signedIn = await page.evaluate(() => !document.querySelector('input[type="password"]'));
    }
  } else {
    signedIn = true; // already signed in from a prior run's cookies
  }
  console.log(`signed-in: ${signedIn}`);
  if (!signedIn) {
    await page.screenshot({ path: "/tmp/entity_signin_fail.png" });
    throw new Error("sign-in did not land (see /tmp/entity_signin_fail.png)");
  }

  const url = `${APP}/?${GW ? `gateway=${encodeURIComponent(GW)}&` : ""}entity=${encodeURIComponent(ENTITY)}`;

  // COLD: clear the life cache first (fresh browser profile has none, but be
  // explicit so re-runs stay honest).
  await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => indexedDB.deleteDatabase("abstractentity_replay_v1"));
  const cold = await timeLoad(page, url);
  console.log(`${ENTITY} COLD: first-paint=${cold.firstPaint}ms total=${cold.total}ms`);

  // Give the post-load cache save a beat to commit before reopening.
  await sleep(1500);

  // WARM: same URL again — the cache should paint instantly + delta.
  const warm = await timeLoad(page, url);
  console.log(`${ENTITY} WARM: first-paint=${warm.firstPaint}ms total=${warm.total}ms`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

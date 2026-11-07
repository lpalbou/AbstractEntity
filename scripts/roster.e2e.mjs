// The home page's "Summoned entities" grid loads tile by tile (operator 2026-11-07: "reading the
// cards is extremely slow"). Real built Entity app, deterministic gateway route doubles (the live
// gateway's measured shape: a ~20 ms roster carrying each state, quick /loop and /life_state, cards
// mostly quick but one long life slow), no model or external traffic. Desktop (1440) and phone (400).
//   npm run build && node scripts/roster.e2e.mjs --playwright ../abstractcode/web [--shots <dir>]
// Checks: every tile is drawn from the roster before any slow card answers; the quick cards fill in
// while the slow one still holds quiet placeholders; at most three cards are read at once; the slow
// tile keeps its height when its card lands; a refresh reads the roster again but no card; a failed
// card says so in a few words (and waits a minute before it is read again); no horizontal scroll.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
const arg = (name) => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? "" : process.argv[index + 1]; };
const { chromium } = arg("playwright") ? createRequire(resolve(arg("playwright"), "package.json"))("@playwright/test") : await import("@playwright/test");
const root = new URL("../", import.meta.url).pathname;
const shots = arg("shots");
if (shots) mkdirSync(shots, { recursive: true });
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://local").pathname;
  const file = resolve(root, "dist", path === "/" ? "index.html" : `.${path}`);
  if (!file.startsWith(resolve(root, "dist") + "/")) { res.writeHead(403).end(); return; }
  try { res.setHeader("content-type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" })[extname(file)] || "application/octet-stream"); res.end(readFileSync(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });

const NAMES = ["castor", "pollux", "ephemeral", "hypnos", "flowling", "nyx", "orion"];
// Card delays (ms): ephemeral is the long life (6.4 s cold on the live gateway; 2.5 s here), hypnos
// slowish, the rest quick. nyx's card fails.
const CARD_MS = { ephemeral: 2500, hypnos: 900 };
const FAILS = new Set(["nyx"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const card = (slug) => ({ age_days: 40, mind_substrate: { provider: "lmstudio", model: "qwen3.6-27b" }, discoveries: [`${slug} tides`, "reverse proxies"], key_moments: { total: 7 }, sleep_stats: { sleeps: 3, self_elected: 2 } });

try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 900, touch: false }, { name: "phone", width: 400, height: 860, touch: true }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.touch, hasTouch: viewport.touch, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    const seen = { roster: 0, card: [], inFlight: 0, maxInFlight: 0, rosterAt: 0 };
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!p.startsWith("/api/")) return route.continue();
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (p === "/api/connection/gateway") return json({ ok: true, has_session: true, gateway_url: origin, gateway: { ok: true, principal: { user_id: "laurent", admin: true } } });
      if (p === "/api/gateway/entities") {
        seen.roster += 1;
        await sleep(20);
        seen.rosterAt = Date.now();
        return json({ entities: NAMES.map((name) => ({ name, slug: name, entity_id: `entity:${name}`, state: { state: "asleep", changed_at: "2026-11-07T08:00:00Z" }, identity: null })) });
      }
      const m = p.match(/^\/api\/gateway\/entities\/([^/]+)\/(card|loop|life_state)$/);
      if (m) {
        const [, slug, what] = m;
        if (what === "loop") { await sleep(15); return json({ running: false }); }
        if (what === "life_state") { await sleep(15); return json({ phase: "sleep", state: "asleep", own_time_running: false }); }
        seen.card.push(slug);
        seen.inFlight += 1;
        seen.maxInFlight = Math.max(seen.maxInFlight, seen.inFlight);
        await sleep(CARD_MS[slug] ?? 40);
        seen.inFlight -= 1;
        if (FAILS.has(slug)) return json({ detail: "card failed" }, 500);
        return json(card(slug));
      }
      if (p.endsWith("/operator/auth")) return json({ authorized: true, user_id: "laurent", admin: true });
      return json({});
    });
    await page.goto(`${origin}/`);
    const tiles = page.locator(".eix_card");
    await tiles.first().waitFor();
    const drawnAfter = Date.now() - seen.rosterAt;
    assert.equal(await tiles.count(), NAMES.length, "every entity has its tile from the roster");
    assert.ok(drawnAfter < 1000, `tiles drawn ${drawnAfter} ms after the roster answered, before the slow card (2.5 s)`);
    const tile = (slug) => page.locator(".eix_card", { has: page.locator(".eix_name", { hasText: new RegExp(`^${slug}$`) }) });
    // Quick cards fill in while ephemeral's is still on its way.
    await tile("castor").locator(".eix_interest").first().waitFor();
    await tile("orion").locator(".eix_interest").first().waitFor();
    assert.equal(await tile("ephemeral").locator(".eix_sk").count(), 3, "the slow tile holds three quiet lines");
    assert.equal(await page.getByText("reading his card").count(), 0, "no 'reading his card' text");
    const pendingHeight = await tile("ephemeral").locator(".eix_card_body").evaluate((el) => el.getBoundingClientRect().height);
    if (shots) await page.screenshot({ path: `${shots}/roster-loading-${viewport.name}.png`, fullPage: true });
    await tile("nyx").locator(".eix_card_note").waitFor();
    assert.equal((await tile("nyx").locator(".eix_card_note").textContent()).trim(), "details unavailable right now", "a failed card in a few words");
    // ephemeral's card lands: its lines replace the placeholders.
    await tile("ephemeral").locator(".eix_interest").first().waitFor({ timeout: 6000 });
    const loadedHeight = await tile("ephemeral").locator(".eix_card_body").evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(Math.abs(loadedHeight - pendingHeight) <= 6, `the tile keeps its height when its card lands (${pendingHeight} → ${loadedHeight})`);
    assert.ok(seen.maxInFlight <= 3, `at most three cards at once (saw ${seen.maxInFlight})`);
    assert.equal(seen.maxInFlight, 3, "the three lanes are used");
    console.log(`  ${viewport.name}: tiles drawn ${drawnAfter} ms after the roster; ephemeral body ${pendingHeight.toFixed(0)} px pending → ${loadedHeight.toFixed(0)} px loaded`);
    if (shots) await page.screenshot({ path: `${shots}/roster-loaded-${viewport.name}.png`, fullPage: true });
    // A refresh reads the roster and the live reads again, but no card (nyx's failed one waits a minute).
    const cardsBefore = seen.card.length, rosterBefore = seen.roster;
    await page.locator(".eix_refresh").click();
    await page.waitForTimeout(600);
    assert.equal(seen.roster, rosterBefore + 1, "the refresh read the roster");
    assert.deepEqual(seen.card.slice(cardsBefore), [], "no card read again (a failed one waits a minute)");
    assert.ok((await tile("castor").locator(".eix_interest").count()) > 0, "nothing blanked on the refresh");
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= viewport.width + 1, `${viewport.name}: no horizontal scroll (${width}px)`);
    assert.deepEqual(errors, [], "no page errors");
    await context.close();
  }
  console.log("roster e2e: OK");
} finally {
  await browser.close();
  server.close();
}

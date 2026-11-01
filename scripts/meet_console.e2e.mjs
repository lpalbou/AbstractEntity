// Meet console composer: real built Entity app, deterministic gateway route doubles, no model or external traffic.
//   npm run build && node scripts/meet_console.e2e.mjs --playwright ../abstractcode/web [--shots <dir>]
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
const arg = (name) => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? "" : process.argv[index + 1]; };
const { chromium } = arg("playwright") ? createRequire(resolve(arg("playwright"), "package.json"))("@playwright/test") : await import("@playwright/test");
const root = new URL("../", import.meta.url).pathname;
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
const seen = { relay: [], close: [] };
let releaseRelay;
const DRAFT = "First line of the steering draft\nsecond line keeps going\nthird line ends here";
try {
  for (const viewport of [{ name: "desktop", width: 1280, height: 800, touch: false }, { name: "phone", width: 390, height: 844, touch: true }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.touch, hasTouch: viewport.touch, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (!p.startsWith("/api/")) return route.continue();
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (p === "/api/connection/gateway") return json({ ok: true, has_session: true, gateway_url: origin, gateway: { ok: true, principal: { user_id: "meet-owner", admin: true } } });
      if (p === "/api/gateway/entities") return json({ entities: [{ name: "castor", slug: "castor", entity_id: "castor" }, { name: "pollux", slug: "pollux", entity_id: "pollux" }] });
      if (p.endsWith("/meets/open")) return json({ meet_id: "m1", visit_id: "visit-m1", convener: "meet-owner", a: { entity_id: "castor", run_id: "ra" }, b: { entity_id: "pollux", run_id: "rb" } });
      if (p.endsWith("/meets/m1/relay")) {
        seen.relay.push(request.postDataJSON());
        await new Promise((resolve) => { releaseRelay = resolve; });
        return json({ spoke: { entity_id: "pollux", reply: "I hear you.", turn_n: 1 }, heard: { entity_id: "castor", reply: "And I answer.", turn_n: 1 } });
      }
      if (p.endsWith("/meets/m1/close")) { seen.close.push(request.postDataJSON()); return json({ meet_id: "m1", visit_id: "visit-m1", closed: true }); }
      if (p.endsWith("/meets/m1")) return json({ meet_id: "m1", visit_id: "visit-m1", pending: false, a: { entity_id: "castor", open: true, run_id: "ra" }, b: { entity_id: "pollux", open: true, run_id: "rb" } });
      if (p.endsWith("/operator/auth")) return json({ authorized: true, user_id: "meet-owner", admin: true });
      if (p.endsWith("/replay")) return route.fulfill({ contentType: "application/x-ndjson", body: "" });
      if (p.endsWith("/replay/stream")) return route.fulfill({ contentType: "text/event-stream", body: ": keepalive\n\n" });
      if (p.includes("/embeddings")) return json({ detail: "Embeddings unavailable" }, 503);
      return json({});
    });
    await page.goto(`${origin}/`);
    await page.getByRole("button", { name: /convene a meet/ }).click();
    await page.locator(".mc_open_btn").click();
    const composer = page.locator(".mc_panel .pc-composer");
    await composer.waitFor();
    assert.equal(await composer.count(), 1, "exactly one composer");
    assert.equal(await page.locator(".mc_panel textarea").count(), 1, "exactly one message field");
    const field = composer.locator("textarea");
    const send = composer.locator(".pc-composer__send--compact");

    const relays = seen.relay.length;
    await field.fill("hello");
    await field.press("Enter");
    assert.equal(seen.relay.length, relays, "Enter alone does not relay");
    assert.equal(await field.inputValue(), "hello\n", "Enter inserts a newline");

    await field.fill(DRAFT);
    if (arg("shots")) { mkdirSync(arg("shots"), { recursive: true }); await page.screenshot({ path: resolve(arg("shots"), `entity-meet-${viewport.name}.png`) }); }
    await composer.locator(".mc_lead_btn", { hasText: "pollux" }).click();
    await field.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await page.waitForFunction(() => document.querySelector(".mc_panel textarea")?.disabled === true);
    assert.equal(seen.relay.length, relays + 1, "Cmd/Ctrl+Enter relays once");
    assert.deepEqual(seen.relay.at(-1), { opener: "b", text: DRAFT });
    assert.equal(await send.getAttribute("aria-busy"), "true", "Send shows the spinner while relaying");
    assert(await send.isDisabled(), "Send is disabled while relaying");
    assert(await composer.locator(".mc_lead_btn").first().isDisabled(), "speaker choice is disabled while relaying");
    releaseRelay();
    await page.locator(".mc_text", { hasText: "And I answer." }).waitFor();
    assert(await field.isEnabled(), "the field returns after the relay");
    assert.equal(await field.inputValue(), "");
    assert(await send.isDisabled(), "an empty draft cannot be sent");

    await composer.locator(".mc_close_reason").fill("good talk");
    await composer.getByRole("button", { name: "end the meet", exact: true }).click();
    await page.locator(".mc_closed_actions").waitFor();
    assert.deepEqual(seen.close.at(-1), { reason: "good talk" }, "end the meet sends the closing note");
    assert.deepEqual(errors, [], "no page errors");
    await context.close();
  }
  console.log("Entity meet console PASS: one shared composer, Enter newline / Cmd+Enter relay, relay busy state, empty-draft Send gate, closing note; desktop and phone.");
} finally { releaseRelay?.(); await browser.close(); await new Promise((resolve) => server.close(resolve)); }

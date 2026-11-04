// Settings → identity and → track record (framework ADR 0052): real built Entity app, deterministic
// gateway route doubles, no model or external traffic. Desktop and phone.
//   npm run build && node scripts/identity.e2e.mjs --playwright ../abstractcode/web [--shots <dir>]
// Checks: the record without a voice shows the gateway's sentence (and no voice); one Save sends the
// whole record once; a refusal is shown word for word, never retried, with its Download action;
// history is newest first; trust reads with its support and "No experience yet".
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

const NO_VOICE = "Castor has no voice yet: choose one in its Identity settings or set the Gateway default voice";
const MISSING = "The voice model kokoro-big (330 MB) is not downloaded on this computer yet, so it cannot be the default voice. Download it first (Models page, or: abstractgateway models download kokoro kokoro-big)";
const record = (rev, over = {}) => ({ rev, avatar: { style: "watch-lotus", color: "#3366cc", source: "chosen", watch_code: "R" }, voice: { provider: "openai", model: "tts-1", voice: "alloy", source: "chosen" }, set_at: `2026-11-0${rev}T10:00:00+00:00`, set_by: "person:laurent", ...over });
const REVS = {
  1: record(1, { avatar: { style: "watch-nebula", color: "#d06439", source: "default", watch_code: "C" }, voice: null, set_by: "default" }),
  2: record(2),
  3: record(3, { voice: { provider: "openai", model: "tts-1", voice: "nova", source: "chosen" } }),
};
const view = (r) => ({ entity_id: "entity:castor", identity: r, identity_ref: { of: "entity:castor", rev: r.rev }, age: { born: "2026-11-01T10:00:00+00:00", days: 3 } });
const TRACK = { subject: "entity:castor", computed_at: "2026-11-04T10:00:00+00:00", as_of: "2026-11-04T09:00:00+00:00", sessions: 4, runs: 7, successes: 5, failures: 1, cancelled: 1, in_progress: 0, assessed: 0, tokens: { input: 31000, output: 9420, total: 40420 }, by_task_kind: { "visit/entity-visit@1": { runs: 6, successes: 5, failures: 1, cancelled: 0, tokens_total: 40000, first_at: null, last_at: null }, "work/task_inbox": { runs: 0, successes: 0, failures: 0, cancelled: 0, tokens_total: 0, first_at: null, last_at: null } }, recent_outcomes: [], basis: "completion-rate only" };
const REPUTATION = { subject: "entity:castor", computed_at: "2026-11-04T10:00:00+00:00", overall: { trust: 0.75, support: 6, successes: 5, failures: 1, last_outcome_at: "2026-11-04T09:00:00+00:00" }, by_task_kind: { "visit/entity-visit@1": { trust: 0.75, support: 6, successes: 5, failures: 1, last_outcome_at: "2026-11-04T09:00:00+00:00" }, "work/task_inbox": { trust: 0.5, support: 0, successes: 0, failures: 0, last_outcome_at: null } }, evidence: [], basis: "completion-rate only" };
const MET = { subject: "entity:castor", entities: [{ id: "entity:pollux", first_seen: "2026-11-02T10:00:00+00:00", last_seen: "2026-11-03T10:00:00+00:00", interactions: 2, kinds: {} }], humans: [{ id: "person:laurent", first_seen: "2026-11-01T10:00:00+00:00", last_seen: "2026-11-04T09:00:00+00:00", interactions: 5, kinds: {} }], not_counted: { "participant of another kind (not an entity or a human)": 1 } };

// The settings body scrolls inside its modal: one shot at its top, one at its bottom (the actions).
async function shoot(page, name) {
  if (!shots) return;
  const body = page.locator(".wsp_body");
  await body.evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ path: `${shots}/${name}-top.png` });
  await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${shots}/${name}-bottom.png` });
}

try {
  for (const viewport of [{ name: "desktop", width: 1280, height: 860, touch: false }, { name: "phone", width: 400, height: 860, touch: true }]) {
    for (const scenario of ["no-voice", "chosen"]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.touch, hasTouch: viewport.touch, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      const seen = { put: [], download: [] };
      page.on("pageerror", (error) => errors.push(String(error)));
      const current = scenario === "no-voice" ? REVS[1] : REVS[3];
      await page.route("**/*", async (route) => {
        const request = route.request(), url = new URL(request.url()), p = url.pathname;
        if (url.origin !== origin) return route.abort("blockedbyclient");
        if (!p.startsWith("/api/")) return route.continue();
        const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (p === "/api/connection/gateway") return json({ ok: true, has_session: true, gateway_url: origin, gateway: { ok: true, principal: { user_id: "laurent", admin: true } } });
        if (p === "/api/gateway/entities") return json({ entities: [{ name: "Castor", slug: "castor", entity_id: "entity:castor", identity: current }] });
        if (p.endsWith("/castor/identity") && request.method() === "PUT") {
          seen.put.push(request.postDataJSON());
          return json({ detail: MISSING, error: { reason_code: "model_not_downloaded", size_mb: 330, download: { method: "POST", path: "/api/gateway/models/download", body: { provider: "kokoro", artifact: "kokoro-big" } } } }, 409);
        }
        if (p.endsWith("/castor/identity")) {
          const rev = url.searchParams.get("rev");
          return json(view(rev ? REVS[rev] : current));
        }
        if (p.endsWith("/castor/voice")) return json(current.voice ? { ...current.voice, source: "identity" } : { provider: null, model: null, voice: null, source: "identity", note: NO_VOICE });
        if (p.endsWith("/castor/access")) return json({ entity: "castor", can_configure: true, as: "admin", reason: null });
        if (p.endsWith("/castor/track-record")) return json(TRACK);
        if (p.endsWith("/castor/reputation")) return json(REPUTATION);
        if (p.endsWith("/castor/acquaintances")) return json(MET);
        if (p === "/api/gateway/models/download") { seen.download.push(request.postDataJSON()); return json({ ok: true, job: { id: "job-1" } }); }
        if (p === "/api/gateway/voice/voices") return json({ providers: ["openai"], tts_providers: ["openai"], tts_models_by_provider: { openai: ["tts-1"] }, items: ["alloy", "nova"].map((id) => ({ id, provider: "openai", label: id })) });
        if (p.endsWith("/operator/auth")) return json({ authorized: true, user_id: "laurent", admin: true });
        if (p.endsWith("/replay")) return route.fulfill({ contentType: "application/x-ndjson", body: "" });
        if (p.endsWith("/replay/stream")) return route.fulfill({ contentType: "text/event-stream", body: ": keepalive\n\n" });
        if (p.includes("/embeddings")) return json({ detail: "Embeddings unavailable" }, 503);
        return json({});
      });
      await page.goto(`${origin}/?entity=castor`);
      await page.locator(".ec_settings_btn").click();
      await page.locator(".wsp_tab", { hasText: "identity" }).click();
      const pane = page.getByTestId("identity-settings");
      await pane.waitFor();
      await page.getByTestId("identity-avatar").waitFor();
      assert.equal(await page.getByTestId("identity-avatar").getAttribute("data-style"), current.avatar.style, "the avatar draws the recorded design");
      assert.equal(await page.getByTestId("identity-avatar").getAttribute("data-color"), current.avatar.color, "in the recorded colour");
      if (scenario === "no-voice") {
        // Recorded absence: the gateway's sentence, word for word; the picker names no voice; Save waits.
        await page.getByTestId("identity-no-voice").filter({ hasText: NO_VOICE }).waitFor();
        assert.equal((await page.getByTestId("identity-no-voice").textContent()).trim(), NO_VOICE);
        assert.equal(await page.getByTestId("identity-save").isDisabled(), true, "nothing to save without a voice");
        assert.match(await pane.textContent(), /Choose a voice to save\./);
        await shoot(page, `identity-no-voice-${viewport.name}`);
      } else {
        assert.equal(await page.getByTestId("identity-no-voice").count(), 0, "a recorded voice shows no absence sentence");
        // History: every revision, newest first.
        await page.locator(".idn_history > summary").click();
        await page.getByTestId("identity-history").waitFor();
        const revs = await page.locator(".idn_history_row").evaluateAll((rows) => rows.map((row) => Number(row.getAttribute("data-rev"))));
        assert.deepEqual(revs, [3, 2, 1], "history newest first");
        assert.match(await page.locator(".idn_history_row").first().textContent(), /New voice/);
        assert.match(await page.locator(".idn_history_row").last().textContent(), /Default look, no voice.*by the gateway/s);
        // A design from the catalog (only those the Watch draws), drawn at once in the new colour.
        await page.locator(`.idn_field [aria-label="Avatar design"]`).first().click();
        assert.equal(await page.getByRole("option", { name: "Woven orb" }).count(), 0, "a design the Watch cannot draw is not offered");
        await page.getByRole("option", { name: "Watch Halo", exact: true }).click();
        await page.locator('input[aria-label="Avatar colour"]').fill("#aa33cc");
        await page.waitForFunction(() => document.querySelector('[data-testid="identity-avatar"]')?.getAttribute("data-style") === "watch-halo" && document.querySelector('[data-testid="identity-avatar"]')?.getAttribute("data-color") === "#aa33cc");
        // One Save, the whole record, once; the refusal word for word with its Download; no retry.
        await page.getByTestId("identity-save").click();
        await page.getByTestId("identity-status").filter({ hasText: "kokoro-big" }).waitFor();
        assert.equal((await page.getByTestId("identity-status").textContent()).trim(), MISSING, "the refusal is the gateway's sentence");
        await page.waitForTimeout(400);
        assert.equal(seen.put.length, 1, "one save, never retried");
        assert.deepEqual(seen.put[0], { avatar: { style: "watch-halo", color: "#aa33cc" }, voice: { provider: "openai", model: "tts-1", voice: "nova" } });
        assert.equal((await page.getByTestId("identity-download").textContent()).trim(), "Download (330 MB)");
        await shoot(page, `identity-refused-${viewport.name}`);
        await page.getByTestId("identity-download").click();
        await page.getByTestId("identity-status").filter({ hasText: "Downloading the voice model" }).waitFor();
        assert.deepEqual(seen.download, [{ provider: "kokoro", artifact: "kokoro-big" }]);
        assert.equal(seen.put.length, 1, "the download does not save");
        // Track record: counts, trust with its support, "No experience yet", plain basis, who it met.
        await page.locator(".wsp_tab", { hasText: "track record" }).click();
        await page.getByTestId("trust-by-task").waitFor();
        const counts = await page.getByTestId("track-record-counts").textContent();
        for (const want of ["Sessions4", "Runs7", "Successes5", "Failures1", "Tokens40,420"]) assert.ok(counts.replace(/\s+/g, "").includes(want), `${want} in ${counts}`);
        assert.match(await page.getByTestId("trust-overall").textContent(), /Trust 0\.75 over 6 outcomes/);
        const kinds = await page.getByTestId("trust-by-task").textContent();
        assert.match(kinds, /Visits.*Trust 0\.75 over 6 outcomes · 5 succeeded, 1 failed/s);
        assert.match(kinds, /Tasks left for it.*No experience yet/s);
        assert.match(await page.getByTestId("trust-basis").textContent(), /nobody has judged the quality of the work yet/);
        assert.match(await page.getByTestId("met-people").textContent(), /laurent.*5 times/s);
        assert.match(await page.getByTestId("met-entities").textContent(), /pollux.*2 times/s);
        const text = (await page.getByTestId("track-record").textContent()).toLowerCase();
        for (const jargon of ["ledger", "basis", "run_id", "completion-rate"]) assert.ok(!text.includes(jargon), `no "${jargon}" on the page`);
        await shoot(page, `track-record-${viewport.name}`);
      }
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(width <= viewport.width + 1, `${viewport.name}: no horizontal scroll (${width}px)`);
      assert.deepEqual(errors, [], "no page errors");
      await context.close();
    }
  }
  console.log("identity e2e: OK");
} finally {
  await browser.close();
  server.close();
}

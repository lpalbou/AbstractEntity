// Voice in a visit — browser check (round 7 R7.1). Exits non-zero on any failed check.
//
// Drives the BUILT app (node bin/cli.js) against the isolated fixture gateway
// (abstractcode/web/e2e/gateway_fixture.py: a real gateway, no model, no keys).
// Like scripts/space.screens.mjs, the entity reads the fixture cannot serve (roster,
// card, the open visit and its transcript, the demo life) are answered in the
// browser. Voice is FAKE at the three model routes only:
//   - POST /entities/castor/voice/tts/stream -> JSON Lines with sine-wave WAV segments
//   - POST /runs/{run}/audio/transcribe       -> a fixed transcript (faster-whisper / large-v3), after 2.2 s
//   - GET  /voice/defaults                    -> output.voice supertonic/supertonic-3, input.voice faster-whisper/large-v3
// The recording upload (POST /attachments/upload) goes to the REAL fixture gateway.
// Chromium runs with a fake microphone, so recording works headless.
//
//   node scripts/voice.e2e.mjs --app http://127.0.0.1:18736 --gateway http://127.0.0.1:18737 \
//        [--playwright <dir with node_modules/@playwright/test>] [--shots <dir>]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const APP = arg("app", "http://127.0.0.1:18736");
const GATEWAY = arg("gateway", "http://127.0.0.1:18737");
const SHOTS = arg("shots");
const PW = arg("playwright");
const { chromium } = PW ? createRequire(path.join(PW, "package.json"))("@playwright/test") : await import("@playwright/test");

const USER = "web-tester";
const TOKEN = "abstractcode-e2e-only";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const DEMO_LIFE = fs.readFileSync(path.join(HERE, "..", "public", "demo", "castor.ndjson"), "utf8");
const RUN = "run-voice-demo";
const REPLY = "The fix was one line in the site block. Next time, check the access log first.";

function sineWav(seconds = 0.4, hz = 440, rate = 24000) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), 44 + i * 2);
  return buf.toString("base64");
}

const MOCKS = {
  roster: { entities: [{ name: "castor", slug: "castor", entity_id: "ent-castor", handle: "castor@local" }] },
  card: { name: "castor", entity_id: "ent-castor", born: "2026-07-01T09:00:00Z", age_days: 91, identity: { values: [], purposes: [], traits: [], limits: [] } },
  visit: { open: true, run_id: RUN, session_id: "sess-voice", visit_id: "visit-voice", turn_n: 1, status: "waiting" },
  transcript: {
    run_id: RUN, visit_id: "visit-voice", status: "waiting", turn_n: 1, participants: [USER, "castor"],
    turns: [
      { role: "user", content: "Why does jellyfin keep dropping behind caddy?" },
      { role: "assistant", content: REPLY },
    ],
  },
  voice: { provider: null, model: null, voice: null, source: "unset", effective: { provider: "supertonic", model: "supertonic-3", voice: "M3", source: "gateway-default" } },
  defaults: {
    tts: { route: "output.voice", configured: true, provider: "supertonic", model: "supertonic-3", voice: "M3" },
    stt: { route: "input.voice", configured: true, provider: "faster-whisper", model: "large-v3" },
    source: "capability_defaults",
  },
  // The catalog deliberately lists openai first (what the engine reports when a key exists): the UI must still name the routes.
  catalog: { tts_providers: ["openai", "supertonic"], stt_providers: ["openai", "faster-whisper"], active_tts_provider: "supertonic", active_stt_provider: "faster-whisper", items: [] },
};

let failures = 0;
const report = [];
function check(name, ok, detail = "") {
  report.push({ check: name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const seen = { tts: [], upload: [], transcribe: [] };

async function installRoutes(page) {
  const origin = new URL(APP).origin;
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== origin) return route.abort("blockedbyclient"); // hermetic: nothing leaves the app origin
    const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/api/gateway/entities" && req.method() === "GET") return json(MOCKS.roster);
    if (p === "/api/gateway/voice/defaults") return json(MOCKS.defaults);
    if (p === "/api/gateway/voice/voices") return json(MOCKS.catalog);
    if (p === "/api/gateway/entities/castor/voice" && req.method() === "GET") return json(MOCKS.voice);
    if (p === "/api/gateway/entities/castor/voice/tts/stream" && req.method() === "POST") {
      seen.tts.push({ at: Date.now(), body: JSON.parse(req.postData() || "{}") });
      const wav = sineWav();
      const lines = [
        { type: "start", child_run_id: "tts-child" },
        { type: "segment", index: 0, text: "The fix was one line in the site block.", audio_b64: wav },
        { type: "segment", index: 1, text: "Next time, check the access log first.", audio_b64: sineWav(3.0, 330) },
        { type: "done", metrics: { ttfb_s: 0.31, rtf: 0.12, device: "mps" } },
      ];
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", headers: { "X-Voice-Source": "gateway-default" }, body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n" });
    }
    if (p === "/api/gateway/attachments/upload" && req.method() === "POST") {
      // The real fixture gateway stores the recording; we only observe its answer.
      const resp = await route.fetch();
      const body = await resp.text();
      seen.upload.push({ status: resp.status(), body });
      return route.fulfill({ response: resp, body });
    }
    const tr = p.match(/^\/api\/gateway\/runs\/([^/]+)\/audio\/transcribe$/);
    if (tr && req.method() === "POST") {
      seen.transcribe.push({ run: decodeURIComponent(tr[1]), body: JSON.parse(req.postData() || "{}") });
      await new Promise((r) => setTimeout(r, 2200));
      return json({ text: "bonjour castor", provider: "faster-whisper", model: "large-v3", duration_ms: 2100 });
    }
    const ent = p.match(/^\/api\/gateway\/entities\/castor\/(card|visit|visit\/run-voice-demo\/transcript)$/);
    if (ent && req.method() === "GET") return json(ent[1] === "card" ? MOCKS.card : ent[1] === "visit" ? MOCKS.visit : MOCKS.transcript);
    const replay = p.match(/^\/api\/gateway\/entities\/([^/]+)\/replay$/);
    if (replay) {
      const since = Number(url.searchParams.get("since_seq") || "0");
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: since === 0 ? DEMO_LIFE : "" });
    }
    return route.continue();
  });
}

async function signIn(page) {
  const dialog = page.getByRole("dialog", { name: "Gateway connection" });
  const connected = page.locator(".af-topbar__pill--connected");
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await dialog.isVisible().catch(() => false)) break;
    if (await connected.isVisible().catch(() => false)) return;
    await page.waitForTimeout(150);
  }
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.locator(".af-topbar__pill").click();
    await dialog.waitFor({ state: "visible", timeout: 15000 });
  }
  await page.locator("#gateway-session-url").fill(GATEWAY);
  await page.locator("#gateway-session-user").fill(USER);
  await page.locator("#gateway-session-token").fill(TOKEN);
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 15000 });
  await connected.waitFor({ state: "visible", timeout: 15000 });
}

async function openChat(page) {
  await page.goto(`${APP}/?entity=castor`, { waitUntil: "domcontentloaded" });
  await signIn(page);
  await page.locator(".entity_canvas_wrap").waitFor({ state: "visible", timeout: 30000 });
  const tab = page.locator(".st_tab", { hasText: "Chat" }).first();
  await tab.waitFor({ state: "attached", timeout: 10000 });
  if (!((await tab.getAttribute("class")) || "").includes("st_tab_active")) await tab.dispatchEvent("click");
  await page.locator('[data-voice="dictate"]').first().waitFor({ state: "visible", timeout: 20000 });
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const metrics = [];
try {
  // ---- functional pass (1440, dark)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
    const page = await ctx.newPage();
    await installRoutes(page);
    await page.addInitScript(() => localStorage.setItem("abstractentity_chat_session:castor", "run-voice-demo"));
    await openChat(page);
    check("composer shows the microphone in an open visit", await page.locator('[data-voice="dictate"]').first().isVisible());

    // The fixture gateway has no embedding route (503): the Cognitive Monitor
    // says so in one sentence with the console link — never the raw JSON body.
    const note = page.locator('[data-monitor-note="embeddings"]').first();
    await note.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    const noteText = ((await note.textContent().catch(() => "")) || "").trim();
    check("monitor: embeddings missing reads as one sentence", noteText.startsWith("Embeddings are not configured on this gateway, so the cognitive monitor cannot run."), noteText.slice(0, 160));
    const setupHref = (await note.locator("a").getAttribute("href").catch(() => "")) || "";
    check("monitor: links to the console's embedding route setup", setupHref.endsWith("/console#defaults"), setupHref);
    check("no raw {\"detail\": …} body anywhere on the page", !((await page.locator("body").innerText()) || "").includes('{"detail"'));

    // Speak a reply: the entity lane, no voice field, sentence segments, Stop.
    const speak = page.getByRole("button", { name: "Speak (TTS)" }).last();
    await speak.click();
    await page.getByRole("button", { name: "Stop spoken reply" }).waitFor({ state: "visible", timeout: 10000 });
    const tts = seen.tts[0];
    check("speaking posts to the entity-owned streaming lane", Boolean(tts));
    check("the request names no provider/model/voice (his own voice speaks)", tts && !("provider" in tts.body) && !("voice" in tts.body) && !("model" in tts.body), JSON.stringify(tts?.body));
    check("the reply text is what is spoken", tts?.body?.text === REPLY);
    await page.getByRole("button", { name: "Stop spoken reply" }).click();
    await page.getByRole("button", { name: "Stop spoken reply" }).waitFor({ state: "hidden", timeout: 5000 });
    check("Stop ends the spoken reply", true);

    // Dictate: hold the microphone ~1.2 s, release -> upload (real fixture) -> transcribe (fake, 2.2 s).
    const mic = page.locator('[data-voice="dictate"]').first();
    const box = await mic.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.locator("[data-voice-status]", { hasText: "Recording…" }).waitFor({ state: "visible", timeout: 5000 });
    check("holding the microphone records (Recording… shown)", true);
    await page.waitForTimeout(1200);
    await page.mouse.up();
    const status = page.locator("[data-voice-status]");
    await status.filter({ hasText: "Transcribing…" }).waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(1100);
    const line = (await status.textContent()) || "";
    check("Transcribing… shows elapsed time and the gateway default route", /^Transcribing… [1-9]\d* s · faster-whisper \/ large-v3$/.test(line.trim()), line);
    await shot(page, "dark-1440-chat-transcribing");
    await status.waitFor({ state: "detached", timeout: 15000 });
    const draft = await page.locator("textarea").last().inputValue();
    check("the transcript lands in the composer", draft.includes("bonjour castor"), draft);
    const up = seen.upload[0];
    const upBody = up ? JSON.parse(up.body) : {};
    check("the recording reached the real gateway upload", up?.status === 200 && Boolean(upBody.run_id), up ? `${up.status} ${up.body.slice(0, 120)}` : "no upload");
    const t = seen.transcribe[0];
    check("transcription runs on the run the upload named (the entity voice scope)", t && t.run === upBody.run_id && t.run === "session_memory_entity_voice_castor", t?.run);
    check("transcription names no route: the gateway default STT runs", t && !("provider" in t.body) && !("model" in t.body) && Boolean(t.body.audio_artifact), JSON.stringify(t?.body));

    // Settings -> voice: his voice + the listener half (kit AfVoiceSection), routes named truthfully.
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator(".ec_settings_btn").click();
    await page.locator(".wsp_tab", { hasText: /voice/i }).first().click();
    const section = page.locator('[data-testid="listener-voice-settings"]');
    await section.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(800);
    const sectionText = (await section.textContent()) || "";
    check("listener settings name the STT gateway default", sectionText.includes("faster-whisper / large-v3"), sectionText.slice(0, 200));
    check("no 'openai' anywhere in the voice settings", !/openai/i.test((await page.locator(".wsp_voice").textContent()) || ""));
    check("the text→speech override row is not offered here", !(await section.locator('.af-override[data-setting="tts"]').isVisible()));
    const pickerText = (await page.locator('[data-testid="entity-voice-picker"]').textContent()) || "";
    check("his voice names the gateway default with the kit wording", pickerText.includes("Gateway default · supertonic / supertonic-3 · M3"), pickerText.slice(0, 200));
    await shot(page, "dark-1440-settings-voice");
    await ctx.close();
  }

  // ---- captures (1440 / 390, light + dark) + overflow metrics
  for (const theme of ["dark", "light"]) {
    for (const vp of [{ name: "1440", width: 1440, height: 900 }, { name: "390", width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, permissions: ["microphone"], isMobile: vp.name === "390", hasTouch: vp.name === "390" });
      const page = await ctx.newPage();
      await installRoutes(page);
      await page.addInitScript((th) => {
        localStorage.setItem("abstractentity_chat_session:castor", "run-voice-demo");
        localStorage.setItem("af_appearance_abstractentity_v1", JSON.stringify({ theme: th }));
      }, theme);
      await openChat(page);
      await page.locator('[data-voice="dictate"]').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      metrics.push({ theme, viewport: vp.name, screen: "chat", overflow_px: await overflow(page) });
      await shot(page, `${theme}-${vp.name}-chat`);
      await page.locator(".ec_settings_btn").click();
      await page.locator(".wsp_tab", { hasText: /voice/i }).first().click();
      await page.locator('[data-testid="listener-voice-settings"]').waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(700);
      metrics.push({ theme, viewport: vp.name, screen: "settings-voice", overflow_px: await overflow(page) });
      await shot(page, `${theme}-${vp.name}-settings-voice`);
      await page.locator('[data-testid="listener-voice-settings"]').scrollIntoViewIfNeeded();
      await shot(page, `${theme}-${vp.name}-settings-voice-listener`);
      await ctx.close();
    }
  }
  for (const m of metrics) check(`no horizontal overflow: ${m.theme} ${m.viewport} ${m.screen}`, m.overflow_px <= 0, `${m.overflow_px}px`);
} catch (e) {
  check("run completed", false, String(e?.stack || e).slice(0, 400));
} finally {
  await browser.close();
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, "metrics.json"), JSON.stringify({ failures, report, metrics }, null, 2));
}
console.log(failures ? `${failures} FAILED` : "ALL PASS");
process.exit(failures ? 1 : 0);

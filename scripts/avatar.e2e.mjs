// Real built Entity app, deterministic gateway route doubles, no model or external traffic.
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
let opened = false, working = false, question = null, finishTurn;
const update = { id: "brief-1", text: "I found the supported CSV format.", run_id: "visit-actor", session_id: "visit-session", source_call_ids: ["source-call-1"], iteration: 1 };
const seen = { open: [], guidance: [], answer: [], decisions: [], commands: [], state: 0 };
const accepted = [];
const publicQuestions = [];
let historyOmitted = 0;
let historySequence = 1;
const historyOrder = () => [`2026-11-01T10:00:${String(historySequence).padStart(2, "0")}Z`, "visit-actor", historySequence++];
const life = readFileSync(resolve(root, "public/demo/castor.ndjson"), "utf8");
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (!p.startsWith("/api/")) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/api/connection/gateway") return json({ ok: true, has_session: true, gateway_url: origin, gateway: { ok: true, principal: { user_id: "avatar-owner", admin: true } } });
    if (p === "/api/gateway/entities") return json({ entities: [{ name: "castor", slug: "castor", entity_id: "castor" }] });
    if (p.endsWith("/operator/auth")) return json({ authorized: true, user_id: "avatar-owner", admin: true });
    if (p.endsWith("/replay")) return route.fulfill({ contentType: "application/x-ndjson", body: url.searchParams.get("since_seq") === "0" ? life : "" });
    if (p.endsWith("/replay/stream")) return route.fulfill({ contentType: "text/event-stream", body: ": keepalive\n\n" });
    if (p.endsWith("/card")) return json({ name: "castor", entity_id: "castor", identity: { values: [], purposes: [], traits: [], limits: [] } });
    if (p.endsWith("/substrate")) return json({ provider: "test", model: "fixture" });
    if (p.endsWith("/workspace/file")) return json({ written: true, path: request.postDataJSON().path, size: 12 });
    if (p.endsWith("/visit/open")) { opened = true; seen.open.push(request.postDataJSON()); return json({ run_id: "visit-root", session_id: "visit-session" }); }
    if (p.endsWith("/visit")) return json({ open: opened, run_id: opened ? "visit-root" : undefined, status: "waiting" });
    if (p.endsWith("/visit/visit-root/state")) {
      seen.state += 1;
      if (question?.reason === "user") {
        const id = `visit-actor:${question.details.question.id}:question`;
        if (!publicQuestions.some((row) => row.id === id)) publicQuestions.push({ id, role: "assistant", kind: "question", text: question.prompt, run_id: question.run_id, source: "wait", wait_key: question.wait_key, question: question.details.question, order: historyOrder() });
      }
      return json({ run_id: "visit-root", session_id: "visit-session", status: working ? "running" : "waiting", public_updates: working ? [update, { ...update, id: "private", text: "```diary visibility=private\nPRIVATE diary update\n```" }] : [], public_messages: accepted, public_questions: publicQuestions, public_questions_omitted: historyOmitted, pending_question: question?.reason === "user" ? question : null, pending_wait: question });
    }
    if (p.endsWith("/visit/visit-root/turn")) {
      working = true;
      await new Promise((resolve) => { finishTurn = resolve; });
      working = false;
      return json({ run_id: "visit-root", status: "waiting", reply: "The CSV result is ready.\n```diary\nPRIVATE final diary\n```", tools_ran: [], tool_details: [] });
    }
    if (p.endsWith("/visit/visit-root/guidance")) {
      seen.guidance.push(request.postDataJSON());
      if (seen.guidance.length === 1) return json({ detail: { code: "temporarily_busy", message: "The actor is busy; retry this correction" } }, 409);
      const body = request.postDataJSON();
      accepted.push({ id: "visit-actor:guidance:2", role: "user", kind: "guidance", text: body.display_text, run_id: "visit-actor", session_id: "visit-session" });
      return json({ accepted: true, seq: 2, run_id: "visit-actor" });
    }
    if (p.endsWith("/visit/visit-root/answer")) {
      const body = request.postDataJSON(); seen.answer.push(body);
      publicQuestions.push({ id: `visit-actor:${question.details.question.id}:answer`, role: "user", kind: "answer", text: body.response, run_id: question.run_id, source: "resume", wait_key: body.wait_key, question_id: question.details.question.id, order: historyOrder() });
      question = null; return json({ accepted: true });
    }
    if (p.endsWith("/visit/visit-root/decision")) { seen.decisions.push(request.postDataJSON()); question = null; return json({ accepted: true }); }
    if (p.endsWith("/commands")) { seen.commands.push(request.postDataJSON()); return json({ accepted: false }, 403); }
    if (p.endsWith("/visit/visit-root/transcript")) return json({ run_id: "visit-root", turns: [] });
    if (p.endsWith("/voice/defaults")) return json({ tts: { configured: false }, stt: { configured: false } });
    if (p.includes("/embeddings")) return json({ detail: "Embeddings unavailable" }, 503);
    return json({});
  });
  await page.goto(`${origin}/?entity=castor`);
  const chatTab = page.locator(".st_tab", { hasText: "Chat" }).first();
  await chatTab.waitFor({ state: "visible", timeout: 20_000 });
  await chatTab.click();
  const modes = page.getByRole("group", { name: "Conversation view" });
  await modes.getByRole("button", { name: "Chat", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Avatar conversation").count(), 0);
  assert.equal(seen.state, 0, "default Chat does not read the new projection");
  await modes.getByRole("button", { name: "Avatar", exact: true }).click();
  await page.getByRole("button", { name: "visit Castor", exact: true }).click();
  await page.getByLabel("Avatar conversation").waitFor();
  assert.deepEqual(seen.open, [{ conversation: true }]);
  const composer = page.locator(".chat_drawer .pc-composer textarea");
  const send = page.locator(".chat_drawer .pc-composer").getByRole("button", { name: "Send", exact: true });
  await page.locator(".side_tabs_emphasized").waitFor();
  const focusedWidth = await page.locator(".side_tabs").evaluate((node) => node.getBoundingClientRect().width);
  assert(focusedWidth >= 1400, "Avatar centers the conversation across the main scene");
  await page.locator('.chat_drawer input[type="file"]').setInputFiles({ name: "format.txt", mimeType: "text/plain", buffer: Buffer.from("CSV format") });
  await page.locator(".cd_file_chip").getByText("format.txt", { exact: false }).waitFor();
  await composer.fill("Draft with a file");
  await modes.getByRole("button", { name: "Chat", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.side_tabs')?.classList.contains('side_tabs_emphasized'));
  assert((await page.locator(".side_tabs").evaluate((node) => node.getBoundingClientRect().width)) < 600, "Chat restores its saved technical pane width");
  assert.equal(await composer.inputValue(), "Draft with a file");
  assert.equal(await page.locator(".cd_file_chip").count(), 1);
  await modes.getByRole("button", { name: "Avatar", exact: true }).click();
  assert.equal(await composer.inputValue(), "Draft with a file");
  assert.equal(await page.locator(".cd_file_chip").count(), 1);
  await page.locator(".cd_file_x").click();
  await composer.fill("Investigate the supported format");
  await send.click();
  await page.locator(".pc-avatar-conversation__line").getByText(update.text, { exact: true }).waitFor({ timeout: 10_000 });
  assert(!(await page.locator(".chat_drawer").innerText()).includes("PRIVATE"));
  assert(await composer.isEnabled(), "the avatar composer remains available during owned work");
  await composer.fill("Keep CSV format");
  await send.click();
  await page.getByText(/Your message was not sent:/).waitFor();
  assert.equal(await composer.inputValue(), "Keep CSV format");
  await modes.getByRole("button", { name: "Chat", exact: true }).click();
  assert.equal(await composer.inputValue(), "Keep CSV format");
  assert(await composer.isDisabled());
  await modes.getByRole("button", { name: "Avatar", exact: true }).click();
  assert.equal(seen.open.length, 1, "switching modes never restarts the visit");
  await send.click();
  await page.getByText(/Your message was accepted/).waitFor();
  assert.equal(await composer.inputValue(), "");
  assert.deepEqual(seen.guidance.map((body) => body.display_text), ["Keep CSV format", "Keep CSV format"]);
  question = { run_id: "visit-actor", wait_key: "choice-1", reason: "user", prompt: "Choose a separator", allow_free_text: false, choices: ["comma", "tab"], details: { question: { id: "choice-id", purpose: "conversation", importance: "essential" } } };
  await page.locator(".pc-workflow-interaction__prompt").filter({ hasText: "Choose a separator" }).waitFor({ timeout: 10_000 });
  await composer.fill("Retain my draft"); await send.click();
  await page.getByText("Choose one of the question's options above. Your draft is kept here.", { exact: true }).waitFor();
  assert.equal(seen.answer.length, 0);
  assert.equal(await composer.inputValue(), "Retain my draft");
  await page.getByRole("button", { name: "comma", exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('.pc-workflow-interaction__prompt')].some((node) => node.textContent.includes('Choose a separator')));
  question = { run_id: "visit-actor", wait_key: "essential-1", reason: "user", prompt: "Which delimiter should I use?", allow_free_text: true, details: { question: { id: "essential-id", purpose: "conversation", importance: "essential" } } };
  await page.locator(".pc-workflow-interaction__prompt").filter({ hasText: "Which delimiter should I use?" }).waitFor({ timeout: 10_000 });
  await composer.fill("Use commas");
  await send.click();
  await page.waitForFunction(() => [...document.querySelectorAll('.cd_note')].some((node) => node.textContent.includes('Your answer was accepted')));
  assert.deepEqual(seen.answer, [{ wait_key: "choice-1", response: "comma", target_run_id: "visit-actor" }, { wait_key: "essential-1", response: "Use commas", target_run_id: "visit-actor" }]);
  question = { run_id: "visit-actor", wait_key: "approval-1", reason: "tool_approval", details: { kind: "tool_approval", tool_calls: [{ name: "write_file" }] } };
  await page.getByRole("button", { name: "Deny", exact: true }).waitFor({ timeout: 10_000 });
  assert.equal(seen.decisions.length, 0, "waiting never grants permission");
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((node) => node.textContent === 'Deny'));
  assert.deepEqual(seen.decisions, [{ wait_key: "approval-1", approved: false }]);
  assert.equal(seen.commands.length, 0, "driver never falls through to a generic runtime command");
  finishTurn();
  // The answer replaces the live line, once, as a message.
  await page.locator(".pc-avatar-conversation__answer").getByText(/The CSV result is ready/).waitFor();
  assert.equal(await page.locator(".pc-avatar-conversation__line").count(), 0);
  assert(!(await page.locator(".chat_drawer").innerText()).includes("PRIVATE"));
  if (arg("shots")) { mkdirSync(arg("shots"), { recursive: true }); await page.screenshot({ path: resolve(arg("shots"), "entity-avatar-desktop.png") }); }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".side_tabs_drawer").waitFor();
  if (!(await page.getByLabel("Avatar conversation").isVisible())) await chatTab.click();
  assert(await composer.isVisible());
  assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, "phone has no horizontal overflow");
  const phoneScene = await page.locator(".pc-avatar-conversation__answer").evaluate((node) => {
    const caption = node.getBoundingClientRect();
    const composer = document.querySelector('.chat_drawer .pc-composer').getBoundingClientRect();
    const avatar = document.querySelector('.pc-avatar-conversation__scene').getBoundingClientRect();
    const region = document.querySelector('.pc-avatar-conversation').getBoundingClientRect();
    return { captionTop: caption.top, captionBottom: caption.bottom, composerTop: composer.top, composerBottom: composer.bottom, avatarTop: avatar.top, avatarBottom: avatar.bottom, regionTop: region.top, regionBottom: region.bottom, height: innerHeight };
  });
  assert(phoneScene.avatarTop >= phoneScene.regionTop && phoneScene.avatarBottom <= phoneScene.regionBottom, "phone avatar is visible without scrolling");
  assert(phoneScene.captionTop >= phoneScene.regionTop && phoneScene.captionBottom <= Math.min(phoneScene.regionBottom, phoneScene.composerTop), `phone answer stays visible with avatar and composer: ${JSON.stringify(phoneScene)}`);
  assert(phoneScene.composerBottom <= phoneScene.height, "phone composer remains in the visible viewport");
  if (arg("shots")) await page.screenshot({ path: resolve(arg("shots"), "entity-avatar-phone.png") });
  publicQuestions.push(
    { id: "visit-actor:expired-question", role: "assistant", kind: "question", text: "Should the header stay?", run_id: "visit-actor", source: "wait", wait_key: "expired-key", question: { id: "expired-id", importance: "clarification" }, order: historyOrder() },
    { id: "visit-actor:expired-outcome", role: "system", kind: "question_outcome", text: "No answer arrived before the deadline. Continuing with: Keep the header.", run_id: "visit-actor", source: "emit_event", question: { id: "expired-id", outcome: "expired", fallback: "Keep the header." }, order: historyOrder() },
    { id: "visit-actor:retained", role: "user", kind: "retained_reply", text: "Late answer: remove the header.", run_id: "visit-actor", source: "emit_event", question_id: "expired-id", reply_status: "retained", reason: "question_expired", order: historyOrder() },
    { id: "private-question", role: "assistant", kind: "question", text: "```diary\nPRIVATE restored question\n```", run_id: "visit-actor", source: "wait", wait_key: "private-q" },
  );
  historyOmitted = 2;
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.reload();
  await page.getByLabel("Avatar conversation").waitFor({ state: "attached" });
  if (!(await page.getByLabel("Avatar conversation").isVisible())) await page.locator(".st_tab", { hasText: "Chat" }).first().click();
  await page.getByLabel("Avatar conversation").waitFor();
  await page.getByText("Some earlier exchanges are not shown in this view.", { exact: true }).waitFor();
  // The Avatar view shows the current exchange only (no history pane): the retained late reply
  // is the person's latest message, so nothing of the earlier exchange is on screen.
  assert.equal(await page.locator(".pc-avatar-conversation__line, .pc-avatar-conversation__answer").count(), 0);
  assert(await page.locator(".pc-avatar-conversation__scene").isVisible(), "the avatar is shown");
  assert((await page.locator(".pc-avatar-conversation__status").innerText()).trim().length > 0, "the avatar's state is shown");
  assert(!(await page.locator(".chat_drawer").innerText()).includes("PRIVATE"));
  assert.equal(publicQuestions.filter((row) => row.role === "user" && row.text === "Keep the header.").length, 0, "an expired fallback is not a human answer");
  if (arg("shots")) await page.screenshot({ path: resolve(arg("shots"), "entity-avatar-question-history.png") });
  assert.deepEqual(errors, []);
  // The separate summoned Flow lane lives in the principal's workflow store.
  // Its existing replay view and ordinary commands are valid; driver commands above are absent.
  const flow = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  let seq = 1, flowDone = false, flowQuestion = null;
  const flowSeen = { summons: [], commands: [] };
  const flowMessages = [{ id: "flow-public", text: "I checked the Flow format.", run_id: "flow-actor", role: "assistant", kind: "public_update", source: "emit_event", source_call_ids: ["flow-call"], iteration: 1 }];
  const flowView = () => ({ version: "replay_view_v1", root_run_id: "flow-root", session_id: "flow-session", status: flowDone ? "completed" : "running", display_status: null, cursor: { token: `flow:${seq}`, records: seq, runs: { "flow-root": seq } }, runs: [{ run_id: "flow-root", status: flowDone ? "completed" : "running" }, { run_id: "flow-actor", status: flowDone ? "completed" : "running" }], interaction: flowQuestion, open_waits: flowQuestion ? [flowQuestion] : [], messages: flowMessages, activities: [], artifacts: [], usage: null, warnings: [] });
  await flow.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (!p.startsWith("/api/")) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/api/connection/gateway") return json({ ok: true, has_session: true, gateway_url: origin, gateway: { ok: true, principal: { user_id: "avatar-owner", admin: true } } });
    if (p === "/api/gateway/entities") return json({ entities: [{ name: "castor", slug: "castor", entity_id: "castor" }] });
    if (p.endsWith("/replay")) return route.fulfill({ contentType: "application/x-ndjson", body: url.searchParams.get("since_seq") === "0" ? life : "" });
    if (p.endsWith("/replay/stream")) return route.fulfill({ contentType: "text/event-stream", body: ": keepalive\n\n" });
    if (p.endsWith("/card")) return json({ name: "castor", entity_id: "castor", identity: { values: [], purposes: [], traits: [], limits: [] } });
    if (p.endsWith("/visit")) return json({ open: false });
    if (p.endsWith("/summon")) { flowSeen.summons.push(request.postDataJSON()); return json({ run_id: "flow-root", session_id: "flow-session" }); }
    if (p.endsWith("/runs/flow-root/view")) return json(flowView());
    if (p.endsWith("/runs/flow-root/view/stream")) { await new Promise((resolve) => setTimeout(resolve, 150)); seq += 1; return route.fulfill({ contentType: "text/event-stream", body: `event: view\nid: flow:${seq}\ndata: ${JSON.stringify(flowView())}\n\n` }); }
    if (p.endsWith("/runs/flow-root")) return json({ run_id: "flow-root", status: flowDone ? "completed" : "running", output: flowDone ? { answer: "The Flow CSV result is ready." } : null });
    if (p.endsWith("/commands")) {
      const body = request.postDataJSON(); flowSeen.commands.push(body);
      if (body.type === "inject_guidance") {
        flowMessages.push({ id: "flow-actor:guidance:1", text: body.payload.display_text, role: "user", kind: "guidance", run_id: "flow-actor", session_id: "flow-session" });
        flowQuestion = { kind: "ask_user", run_id: "flow-actor", wait_key: "flow-essential", prompt: "Which Flow delimiter?", allow_free_text: true, details: { question: { id: "flow-question", purpose: "conversation", importance: "essential" } } };
      } else flowQuestion = null;
      return json({ accepted: true, seq: 1 });
    }
    if (p.includes("/embeddings")) return json({ detail: "Embeddings unavailable" }, 503);
    return json({});
  });
  await flow.goto(`${origin}/?entity=castor`);
  await flow.locator(".st_tab", { hasText: "Chat" }).first().click();
  await flow.getByRole("group", { name: "Conversation view" }).getByRole("button", { name: "Avatar", exact: true }).click();
  await flow.getByRole("radio", { name: "flow brain" }).check();
  await flow.getByRole("button", { name: "talk to Castor (flow brain)", exact: true }).click();
  const flowComposer = flow.locator(".chat_drawer .pc-composer textarea");
  const flowSend = flow.locator(".chat_drawer .pc-composer").getByRole("button", { name: "Send", exact: true });
  await flowComposer.fill("Find the supported Flow format"); await flowSend.click();
  await flow.locator(".pc-avatar-conversation__line").getByText("I checked the Flow format.", { exact: true }).waitFor();
  assert.equal(flowSeen.summons[0].input_data._runtime.conversation.enabled, true);
  await flowComposer.fill("Keep the Flow CSV format"); await flowSend.click();
  await flow.getByText("Which Flow delimiter?", { exact: true }).waitFor();
  assert.equal(flowSeen.commands[0].type, "inject_guidance");
  assert.equal(flowSeen.commands[0].run_id, "flow-root");
  assert.equal(flowSeen.commands[0].payload.display_text, "Keep the Flow CSV format");
  await flowComposer.fill("Use Flow commas"); await flowSend.click();
  await flow.getByText("Your answer was accepted.", { exact: true }).waitFor();
  assert.equal(flowSeen.commands[1].run_id, "flow-actor");
  assert.deepEqual(flowSeen.commands[1].payload, { wait_key: "flow-essential", response: "Use Flow commas" });
  flowDone = true;
  await flow.locator(".pc-avatar-conversation__answer").getByText("The Flow CSV result is ready.", { exact: true }).waitFor();
  if (arg("shots")) await flow.screenshot({ path: resolve(arg("shots"), "entity-avatar-flow.png") });
  console.log("Entity built-browser avatar PASS: default Chat, opt-in, privacy, busy correction/refusal/retry, question targeting, mode/draft continuity, final/history; no generic driver commands.");
  console.log("Entity built-browser Flow PASS: existing summoned view, start opt-in, public update, live guidance with human history, exact child question answer and final result.");
  console.log("Entity question reconnect PASS: original question/answer, system expiry, original late-retained reply, omitted-view notice and privacy; no fallback human answer.");
} finally { finishTurn?.(); await browser.close(); await new Promise((resolve) => server.close(resolve)); }

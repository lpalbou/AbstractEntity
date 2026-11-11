// The Cognitive Monitor in the timeline, always on (backlog 0040), mounted for real: the Timeline with
// its monitor (CognitionWavePanel over a ReplyFeed, as the page mounts it) over a small synthetic life,
// with bounded deterministic embedding replies; no gateway, no live writes (every /api call is answered
// here). Checks: no toggle; the one read starts by itself once the life has loaded and never again on a
// scrub or a play head frame; the readings follow the position and the head; a reply's reading lands in
// the same places; no embeddings says so in the bloom's place; three columns (phone: lanes on top), one
// block height whatever the monitor says.
// Run: node scripts/check_cognition_browser.mjs --playwright ../abstractcode/web [--shots <directory>]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createServer } from "vite";
const root = new URL("../", import.meta.url).pathname;
const arg = name => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? "" : process.argv[index + 1]; };
const { chromium } = arg("playwright") ? createRequire(resolve(arg("playwright"), "package.json"))("@playwright/test") : await import("@playwright/test");
const fixtures = JSON.parse(readFileSync(resolve(root, "src/fixtures/cognition_gate_vectors.json")));
const pick = (id) => fixtures.cases.find((row) => row.id === id);
const neutral = pick("neutral_meeting"), joy = pick("joy_control"), fear = pick("fearful_control"), storm = pick("storm_caution_neutral");
// His words in the life: four summaries at indices 5, 15, 25, 35 of forty events (the others are
// lessons, world revisions and dreams: marks on the lanes, nothing to read).
const SAID = { 5: neutral, 15: joy, 25: fear, 35: storm };
const shots = resolve(arg("shots") || resolve(root, "untracked/cognition-browser"));
mkdirSync(shots, { recursive: true });
mkdirSync(resolve(root, "untracked"), { recursive: true });
const temp = mkdtempSync(resolve(root, "untracked/cognition-harness-"));
writeFileSync(resolve(temp, "index.html"), '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><div id="root"></div><script type="module" src="./main.tsx"></script></html>');
writeFileSync(resolve(temp, "main.tsx"), `
import React,{useEffect,useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import {Timeline} from "/src/timeline.tsx";
import {CognitionWavePanel} from "/src/cognition_wave_panel.tsx";
import {createReplyFeed} from "/src/cognition_wave_inline.tsx";
import {foldEnvelopes} from "/src/stream_fold.ts";
import {createPlayhead} from "/src/replay_clock.ts";
import "@abstractframework/ui-kit/theme.css";
import "/src/entity.css";
const SAID=${JSON.stringify(Object.fromEntries(Object.keys(SAID).map((k) => [k, true])))};
const FILL=["lesson","world_model","dream"];
const LIFE=Array.from({length:40},(_,i)=>{const seq=i+1,at=new Date(Date.UTC(2026,6,8,0,i*30)).toISOString(),kind=SAID[i]?"summary":FILL[i%3],id="ex:"+kind+"-"+i;
return {stream:"abstractmemory.replay",stream_version:1,seq,observed_at:at,scope:"life",owner_id:"entity:castor",trace_id:null,turn_id:null,run_id:null,family:"binding",
payload:{record_id:id,scope:"life",owner_id:"entity:castor",search_state:"indexed",prompt_state:"active",lifecycle:"formed",source:"remember",reason:null,observed_at:at,binding_id:"b-"+id,seq},
display:{record_id:id,kind,title:kind+" "+i}};});
const EFFORT={think_ms:24800,tool_rounds:0,memories_recalled:44,memories_formed:1};
function Test(){
const feed=useMemo(createReplyFeed,[]);
const head=useMemo(createPlayhead,[]);
const fold=useMemo(()=>foldEnvelopes(LIFE),[]);
const [ready,setReady]=useState(false);
const [index,setIndex]=useState(39);
const [live,setLive]=useState(false);
const [playing,setPlaying]=useState(false);
const [entity,setEntity]=useState("castor");
const [reply,setReply]=useState(null);
// The chat drawer's part: the reply in view of the open conversation, or none.
useEffect(()=>{feed.set(reply?{latestReply:reply,focusReply:null,focusAt:null,effort:EFFORT,effortKey:"turn-"+reply.length,tools:null}:null);},[feed,reply]);
useEffect(()=>{window.__head=head;},[head]);
const say=(t)=>()=>setReply(t);
return <main style={{boxSizing:"border-box"}}>
<div style={{display:"flex",gap:8,margin:"12px 16px",flexWrap:"wrap"}}>
<button onClick={()=>setReady(true)}>Life loaded</button>
<button onClick={()=>setIndex(2)}>Early</button>
<button onClick={()=>setIndex(7)}>At A</button>
<button onClick={()=>setIndex(27)}>At B</button>
<button onClick={()=>setPlaying(v=>!v)}>Playing</button>
<button onClick={()=>setLive(v=>!v)}>Live</button>
<button onClick={say(${JSON.stringify(neutral.text)})}>Neutral</button>
<button onClick={say(${JSON.stringify(joy.text)})}>Joy</button>
<button onClick={say(null)}>Empty</button>
<button onClick={()=>setEntity("noembed")}>Other entity</button>
</div>
<div style={{height:240}} />
<Timeline envelopes={LIFE} scrubIndex={live?LIFE.length-1:index} playing={playing} speed={100} live={live} liveAvailable inferredSessionSeqs={[]}
 onScrub={setIndex} onTogglePlay={()=>setPlaying(v=>!v)} onSpeed={()=>{}} onToggleLive={()=>setLive(v=>!v)} playhead={head}
 monitor={(seq)=><CognitionWavePanel lifeFold={()=>fold} ready={ready} source={{baseUrl:"",entity}} scrubSeq={seq} live={live} replyFeed={feed}/>} />
</main>}
document.documentElement.classList.add("theme-catppuccin-mocha");
createRoot(document.getElementById("root")).render(<Test/>);
`);
const vectorOf = (text) => (fixtures.cases.find((row) => row.text === text) ?? neutral).vector;
const textOf = (id) => { const i = Number(id.split("-").pop()); return SAID[i]?.text ?? ""; };
const server = await createServer({ root, server: { host: "127.0.0.1", port: 4189, strictPort: true }, logLevel: "error" });
let browser;
const errors = [];
// The harness's answers; `hold` keeps a reply's embed pending until released.
const routeApi = async (page, calls, hold) => page.route("**/api/**", async route => {
  const url = new URL(route.request().url());
  const json = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  if (url.pathname.endsWith("/embedding")) {
    calls.pin.push(url.pathname);
    // No embedder resolved for the other entity: the read stops there (no book, no embed).
    if (url.pathname.includes("/noembed/")) return json({pin:{model_id:fixtures.embedder_id},resolved_embedder:null,match:"unknown"});
    return json({pin:{model_id:fixtures.embedder_id},resolved_embedder:fixtures.embedder_id,match:"match"});
  }
  if (url.pathname.endsWith("/verbatim")) { calls.verbatim.push(url.pathname); return json({record_id:url.pathname.split("/").at(-2),text:textOf(decodeURIComponent(url.pathname.split("/").at(-2)))}); }
  if (url.pathname.endsWith("/embeddings")) {
    const input = route.request().postDataJSON().input;
    const reply = input.length === 1 && (input[0] === neutral.text || input[0] === joy.text) && calls.corpusDone;
    (reply ? calls.reply : calls.embed).push(input.length);
    if (reply && hold) await new Promise(release => hold.push({ input: input[0], release }));
    return json({model:fixtures.embedder_id,data:input.map((t,i)=>({index:i,embedding:vectorOf(t)}))});
  }
  calls.other.push(url.pathname);
  return json({});
});
const newCalls = () => ({ pin: [], verbatim: [], embed: [], reply: [], other: [], corpusDone: false });
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  const calls = newCalls(), pending = [];
  await routeApi(page, calls, pending);
  await page.goto(`http://127.0.0.1:4189/${relative(root,temp)}/index.html`);
  const waitFor = async pred => { for(let i=0;i<150;i++){if(pred())return;await new Promise(r=>setTimeout(r,20));}throw new Error("harness request did not arrive"); };
  const click = name => page.getByRole("button",{name,exact:true}).click();
  const radar = page.locator(".entity_timeline .et_radar");
  const state = () => radar.getAttribute("data-reading-state");
  const value = (name) => page.evaluate((n) => [...document.querySelectorAll('.et_readings [aria-label="Tone of the phrasing"] .cm_tone_item')].find((e) => e.querySelector(".cm_tone_name")?.textContent === n)?.querySelector(".cm_tone_val")?.textContent ?? null, name);
  const values = () => page.locator('.et_readings [aria-label="Tone of the phrasing"] .cm_tone_val').allTextContents();
  const height = () => page.evaluate(() => Math.round(document.querySelector(".entity_timeline").getBoundingClientRect().height));

  // ALWAYS ON: no toggle in the timeline, the monitor's places drawn; nothing read while the life loads.
  await radar.waitFor();
  assert.equal(await page.locator(".entity_timeline").getByText(/Monitor/).count(), 0, "no Monitor button");
  assert.equal(await page.locator(".entity_timeline button[aria-pressed]").count(), 0, "no toggle in the timeline");
  assert.equal(await page.locator(".et_readings button, .et_radar button").count(), 0, "no button in the monitor");
  assert.equal(await page.getByText("Cognitive Monitor").count(), 0, "no title in the monitor");
  await page.waitForTimeout(300);
  assert.equal(await state(), "idle");
  assert.equal(calls.verbatim.length + calls.embed.length, 0, "nothing read before his life has loaded");
  const heights = { idle: await height() };
  // His life loaded: the one read starts by itself, his book opened once per readable record.
  await click("Life loaded");
  await page.locator('.et_radar[data-reading-state="ready"]').waitFor();
  calls.corpusDone = true;
  const readOnce = { verbatim: calls.verbatim.length, embed: calls.embed.length };
  assert.equal(readOnce.verbatim, 4, "his four readable records, each read once");
  heights.ready = await height();
  console.log(`  read: ${readOnce.verbatim} records, ${readOnce.embed} embed calls (route check included)`);

  // FOLLOWS THE POSITION: a lookup in the one read.
  await click("Early");
  await page.locator(".et_radar_note").getByText("nothing said yet here", { exact: true }).waitFor();
  assert.equal(await value("warmth"), "—", "no words before his first");
  await click("At A");
  await page.waitForFunction(() => document.querySelector('.et_readings [aria-label="Tone of the phrasing"] .cm_tone_val')?.textContent !== "—");
  const atA = await values();
  const moodA = await page.locator(".et_radar .cm_canvas_box").getAttribute("title");
  await page.screenshot({ path: resolve(shots, "entity-cognition-at-a.png") });
  await click("At B");
  await page.waitForFunction((a) => [...document.querySelectorAll('.et_readings [aria-label="Tone of the phrasing"] .cm_tone_val')].map((e) => e.textContent).join() !== a, atA.join());
  const atB = await values();
  const moodB = await page.locator(".et_radar .cm_canvas_box").getAttribute("title");
  await page.screenshot({ path: resolve(shots, "entity-cognition-at-b.png") });
  for (const v of [...atA, ...atB]) assert.match(v, /^[−-]?\d\.\d\d$/, `a signed score, never a mark: ${v}`);
  assert.notDeepEqual(atA, atB, "two positions, two readings");
  assert.match(moodA, /^closest to [a-z]+ \([−-]?\d\.\d\d\)$/, "the bloom's hover names the closest register (by name) and its similarity");
  console.log(`  at A: ${moodA} [${atA.join(" ")}]; at B: ${moodB} [${atB.join(" ")}]`);

  // FOLLOWS THE PLAY HEAD: each frame the head moves (the committed position stays early).
  await click("Early");
  await click("Playing");
  const atHead = (i) => page.evaluate(async (idx) => {
    window.__head.set(idx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return [...document.querySelectorAll('.et_readings [aria-label="Tone of the phrasing"] .cm_tone_val')].map((e) => e.textContent);
  }, i);
  assert.deepEqual(await atHead(27), atB, "the head at B: B's reading within two frames");
  assert.deepEqual(await atHead(7), atA, "the head back at A: A's reading within two frames");
  // A 100x sweep, one head position per frame: the readings change as the head passes each utterance.
  const sweep = [];
  for (let i = 0; i < 40; i++) sweep.push((await atHead(i)).join(" "));
  const changes = sweep.filter((v, i) => i > 0 && v !== sweep[i - 1]).length;
  assert.equal(changes, 4, `the sweep shows each of his four utterances as the head passes it (${changes} changes)`);
  await click("Playing");
  await page.evaluate(() => window.__head.set(null));
  assert.deepEqual({ verbatim: calls.verbatim.length, embed: calls.embed.length }, readOnce, "no scrub and no head frame reads again");

  // LIVE, his conversation open: the reply in view, per message, in the same places.
  await click("Live");
  await click("Neutral");
  await page.locator(".et_radar_note").getByText("reading…", { exact: true }).waitFor();
  await waitFor(() => pending.length === 1);
  assert.equal(await page.locator('.et_radar[data-reading-state="conversation"]').count(), 1);
  await click("Joy");
  await waitFor(() => pending.length === 2);
  await click("Neutral");
  assert.equal(pending.length, 2, "A→B→A shares the pending A embed");
  pending[0].release();
  await page.waitForFunction(() => !document.querySelector(".et_radar_note") && document.querySelector('.et_readings [aria-label="Tone of the phrasing"] .cm_tone_val')?.textContent !== "—");
  const neutralReply = await values();
  assert.deepEqual(await page.locator('.et_readings [aria-label="Conduct of this turn"] .cm_tone_name').allTextContents(), ["effort", "action", "attention", "rigor"], "the turn's conduct by name beside the channels");
  pending[1].release();
  await page.waitForTimeout(80);
  assert.deepEqual(await values(), neutralReply, "a late B cannot replace the visible A reading");
  heights.conversation = await height();
  await page.screenshot({ path: resolve(shots, "entity-cognition-reply.png") });
  await click("Joy");
  await page.waitForFunction((a) => [...document.querySelectorAll('.et_readings [aria-label="Tone of the phrasing"] .cm_tone_val')].map((e) => e.textContent).join() !== a, neutralReply.join());
  const joyReply = await values();
  assert.equal(calls.reply.length, 2, "one embed per distinct reply (neutral, joy), never per chunk");
  console.log(`  replies: neutral [${neutralReply.join(" ")}], joy [${joyReply.join(" ")}]`);
  // Live without a reply: his words at the head again (the latest utterance).
  await click("Empty");
  await page.locator('.et_radar[data-reading-state="ready"]').waitFor();
  assert.equal(await page.locator('[aria-label="Conduct of this turn"]').count(), 0, "the conduct goes with the conversation");
  await click("Live");

  // NO EMBEDDINGS: one short line in the bloom's place; his book never opened; the block keeps its height.
  const before = calls.verbatim.length;
  await click("Other entity");
  await page.locator(".et_radar_instead").getByText("no embeddings", { exact: false }).waitFor();
  assert.equal(calls.verbatim.length, before, "no book read without embeddings");
  heights.noEmbeddings = await height();
  await page.screenshot({ path: resolve(shots, "entity-cognition-no-embeddings.png") });
  console.log(`  block height: ${JSON.stringify(heights)}`);
  assert.equal(new Set(Object.values(heights)).size, 1, `one block height whatever the monitor says: ${JSON.stringify(heights)}`);
  await ctx.close();

  // LAYOUT at 1440, 1280 and a 400 px phone with touch: three columns (phone: the lanes on top).
  for (const [width, touch] of [[1440, false], [1280, false], [400, true]]) {
    const lctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
    const lp = await lctx.newPage();
    lp.on("pageerror", error => errors.push(String(error)));
    const lcalls = newCalls();
    await routeApi(lp, lcalls, null);
    const url = `http://127.0.0.1:4189/${relative(root,temp)}/index.html`;
    await lp.goto(url);
    await lp.getByRole("button", { name: "Life loaded", exact: true }).click();
    await lp.locator('.et_radar[data-reading-state="ready"]').waitFor();
    if (width === 1440) {
      // A reload with nothing new reads and embeds nothing: the readings come from this browser's cache.
      const before = { verbatim: lcalls.verbatim.length, embed: lcalls.embed.length, pin: lcalls.pin.length };
      await lp.reload();
      await lp.getByRole("button", { name: "Life loaded", exact: true }).click();
      await lp.locator('.et_radar[data-reading-state="ready"]').waitFor();
      await lp.waitForTimeout(300);
      const reload = { verbatim: lcalls.verbatim.length - before.verbatim, embed: lcalls.embed.length - before.embed, pin: lcalls.pin.length - before.pin };
      console.log(`  first load: ${before.verbatim} record reads, ${before.embed} embed calls; reload: ${JSON.stringify(reload)}`);
      assert.deepEqual(reload, { verbatim: 0, embed: 0, pin: 0 }, "a reload with nothing new asks the gateway nothing");
    }
    await lp.getByRole("button", { name: "At B", exact: true }).click();
    await lp.waitForTimeout(400);
    const layout = await lp.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const block = r(".entity_timeline"), readings = r(".et_readings"), top = r(".et_right_top"), transport = r(".et_right"), rad = r(".et_radar");
      const lanes = [...document.querySelectorAll(".et_lane")].map((e) => e.getBoundingClientRect());
      const track = r(".et_track_wrap");
      const rowEl = document.querySelector('.et_readings [aria-label="Tone of the phrasing"]');
      const tops = [...rowEl.querySelectorAll(".cm_tone_name")].map((c) => Math.round(c.getBoundingClientRect().top));
      const perLine = [...new Set(tops)].map((t) => tops.filter((x) => x === t).length);
      const rgb = (s) => s.match(/[\d.]+/g).map(Number);
      const lum = ([R, G, B]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(R) + 0.7152 * f(G) + 0.0722 * f(B); };
      const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && !(c.length === 4 && c[3] === 0)) return c.slice(0, 3); } return [255, 255, 255]; };
      const contrast = (el) => { const a = lum(rgb(getComputedStyle(el).color).slice(0, 3)), b = lum(bg(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      const box = document.querySelector(".et_radar .cm_canvas_box"), cb = box.getBoundingClientRect();
      const names = [...box.querySelectorAll(".cm_overlay_code")].map((e) => ({ t: e.textContent, r: e.getBoundingClientRect() }));
      const others = [...document.querySelectorAll(".et_readings .cm_tone_name, .et_readings .cm_tone_val, .et_right_top *, .et_right *")].map((e) => ({ t: e.textContent, r: e.getBoundingClientRect() }));
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const R = (x) => Math.round(x);
      return {
        block: R(block.height), blockRight: R(block.right),
        lanesRight: R(Math.max(...lanes.map((l) => l.right), track.right)), lanesBottom: R(Math.max(...lanes.map((l) => l.bottom), track.bottom)),
        readings: { left: R(readings.left), right: R(readings.right), top: R(readings.top), bottom: R(readings.bottom) },
        rights: [R(readings.right), R(top.right), R(transport.right)], topBottom: R(top.bottom), transportTop: R(transport.top), readingsBottom: R(readings.bottom), topTop: R(top.top),
        midLeft: R(Math.min(readings.left, top.left, transport.left)),
        radar: { left: R(rad.left), right: R(rad.right), top: R(rad.top), bottom: R(rad.bottom), width: R(rad.width), height: R(rad.height) },
        perLine, petals: names.length, boxStyleW: parseFloat(box.style.width), boxW: R(cb.width),
        overlaps: names.flatMap((n) => others.filter((o) => hit(n.r, o.r)).map((o) => `${n.t} x ${o.t}`)),
        outOfBox: names.filter((n) => n.r.left < cb.left - 1 || n.r.right > cb.right + 1).map((n) => n.t),
        scroll: document.documentElement.scrollWidth, inner: innerWidth,
        valContrast: Math.min(...[...rowEl.querySelectorAll(".cm_tone_val")].map(contrast)),
      };
    });
    console.log(`  ${width}${touch ? " touch" : ""}: block ${layout.block} px; lanes ..${layout.lanesRight} | middle ${layout.midLeft}..${layout.rights.join("/")} | radar ${layout.radar.left}..${layout.radar.right} (${layout.radar.width}x${layout.radar.height}); names ${layout.petals}, overlaps ${layout.overlaps.length}, channels per line ${layout.perLine.join("+")}, value contrast ${layout.valContrast.toFixed(2)}, scrollWidth ${layout.scroll}/${layout.inner}`);
    assert.equal(layout.petals, 9, `nine register names around the bloom at ${width}`);
    assert.equal(layout.boxW, layout.boxStyleW, `the bloom's box keeps its ${layout.boxStyleW} px at ${width}`);
    assert.deepEqual(layout.outOfBox, [], `the register names stay in the bloom's box at ${width}`);
    assert.deepEqual(layout.overlaps, [], `no register name over a channel or a control at ${width}`);
    assert.deepEqual(layout.perLine, [1, 1, 1, 1, 1], `one channel per line at ${width}`);
    assert.ok(layout.readingsBottom <= layout.topTop + 1 && layout.topBottom <= layout.transportTop + 1, `the channels over Live over the transport at ${width}`);
    assert.ok(layout.scroll <= layout.inner, `no sideways scroll at ${width}`);
    assert.equal(layout.inner, width, `the page keeps its ${width} px width`);
    assert.ok(layout.valContrast >= 4.5, `value contrast ${layout.valContrast.toFixed(2)} at ${width}`);
    if (width >= 768) {
      assert.ok(Math.max(...layout.rights) - Math.min(...layout.rights) <= 1, `the channels, Live and the transport right-aligned at ${width}: ${layout.rights}`);
      assert.ok(Math.abs(layout.readings.left - layout.midLeft) <= 1, `the channels as wide as the middle column at ${width} (no empty space beside them): ${layout.readings.left} vs ${layout.midLeft}`);
      assert.ok(layout.lanesRight < layout.midLeft && Math.max(...layout.rights) < layout.radar.left, `lanes | middle | radar, left to right at ${width}`);
      assert.ok(layout.blockRight - layout.radar.right <= 16, `the radar at the block's right edge at ${width} (${layout.blockRight - layout.radar.right} px)`);
      assert.deepEqual([layout.radar.width, layout.radar.height], [210, 150], `the radar's fixed box at ${width}`);
      assert.ok(layout.block <= 166, `the block keeps the open monitor's height (${layout.block} px) at ${width}`);
    } else {
      assert.ok(layout.readings.top >= layout.lanesBottom && layout.radar.top >= layout.lanesBottom, `the lanes on top on a phone`);
      // The channels hug the bloom; Live and the transport under them at the block's right edge.
      assert.ok(layout.radar.left - layout.readings.right >= 0 && layout.radar.left - layout.readings.right <= 16, `the channels beside the bloom on a phone (${layout.readings.right} | ${layout.radar.left})`);
      assert.ok(layout.topTop >= layout.radar.bottom, `Live under the channels and the bloom on a phone`);
      assert.ok(Math.abs(layout.rights[1] - layout.radar.right) <= 1 && Math.abs(layout.rights[2] - layout.radar.right) <= 1, `Live and the transport at the block's right edge on a phone: ${layout.rights}`);
    }
    await lp.screenshot({ path: resolve(shots, `entity-cognition-layout-${width}${touch ? "-touch" : ""}.png`), fullPage: true });
    await lctx.close();
  }
  assert.deepEqual(errors, []);
  console.log("cognition browser (the monitor always on in the timeline): no toggle, one read once his life loaded, follows the position and the play head with no re-read, replies in the same places (per message, focus race), no embeddings in the bloom's place, one block height, three columns at 1440/1280 and the phone layout at 400 touch passed");
} catch (e) {
  console.log(`page errors: ${JSON.stringify(errors.slice(0, 5))}`);
  throw e;
} finally {
  await browser?.close(); await server.close(); rmSync(temp, { recursive: true, force: true });
}

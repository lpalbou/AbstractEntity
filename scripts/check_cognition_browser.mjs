// The Cognitive Monitor in the timeline (backlog 0032), mounted for real (CognitionWavePanel over a
// ReplyFeed, in the timeline's monitor slot as the page mounts it) with bounded deterministic
// embedding replies; no gateway, no live writes (every /api call is answered here).
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
const neutral = fixtures.cases.find((row) => row.id === "neutral_meeting");
const joy = fixtures.cases.find((row) => row.id === "joy_control");
const shots = resolve(arg("shots") || resolve(root, "untracked/cognition-browser"));
mkdirSync(shots, { recursive: true });
mkdirSync(resolve(root, "untracked"), { recursive: true });
const temp = mkdtempSync(resolve(root, "untracked/cognition-harness-"));
writeFileSync(resolve(temp, "index.html"), '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><div id="root"></div><script type="module" src="./main.tsx"></script></html>');
writeFileSync(resolve(temp, "main.tsx"), `
import React,{useEffect,useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import {CognitionWavePanel} from "/src/cognition_wave_panel.tsx";
import {createReplyFeed} from "/src/cognition_wave_inline.tsx";
import {createFoldState} from "/src/stream_fold.ts";
import "@abstractframework/ui-kit/theme.css";
import "/src/entity.css";
const EFFORT={think_ms:24800,tool_rounds:0,memories_recalled:44,memories_formed:1};
function Test(){
const feed=useMemo(createReplyFeed,[]);
const fold=useMemo(createFoldState,[]);
const [text,setText]=useState(${JSON.stringify(neutral.text)});
const [entity,setEntity]=useState("castor");
const [live,setLive]=useState(true);
// The chat drawer's part: the reply in view of the open conversation, or none.
useEffect(()=>{feed.set(text?{latestReply:text,focusReply:null,focusAt:null,effort:EFFORT,effortKey:"turn-1",tools:null}:null);},[feed,text]);
return <main style={{margin:"30px auto",boxSizing:"border-box"}}>
<div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
<button onClick={()=>setText(${JSON.stringify(neutral.text)})}>Neutral</button>
<button onClick={()=>setText(${JSON.stringify(joy.text)})}>Joy</button>
<button onClick={()=>setText(null)}>Empty</button>
<button onClick={()=>setEntity("mismatch")}>Other entity</button>
<button onClick={()=>setLive(v=>!v)}>Replay</button>
</div>
<div className="entity_timeline et_grid et_monitor_open"><div className="et_monitor_slot" style={{gridRow:"1 / span 5"}}>
<CognitionWavePanel fold={fold} source={{baseUrl:"",entity}} scrubSeq={0} live={live} replyFeed={feed}/>
</div></div>
</main>}
document.documentElement.classList.add("theme-catppuccin-mocha");
createRoot(document.getElementById("root")).render(<Test/>);
`);
const server = await createServer({ root, server: { host: "127.0.0.1", port: 4189, strictPort: true }, logLevel: "error" });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  const errors = [], pending = [];
  let pinRelease;
  page.on("pageerror", error => errors.push(String(error)));
  let pinHeld = false;
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const json = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname.endsWith("/embedding")) {
      // The other entity's pin is held once (its answer lands after the conversation emptied).
      if (url.pathname.includes("/mismatch/")) { if (!pinHeld) { pinHeld = true; await new Promise(resolve => { pinRelease = resolve; }); } return json({pin:{model_id:"different-embedding-space"}}); }
      // The door's embedder resolved (the monitor's read checks it first, corpusPreflight).
      return json({pin:{model_id:fixtures.embedder_id},resolved_embedder:fixtures.embedder_id,match:"match"});
    }
    if (url.pathname.endsWith("/embeddings")) {
      const input = route.request().postDataJSON().input[0];
      // The read's check of the embedding route answers at once (only the replies' embeds are held).
      if (input !== neutral.text && input !== joy.text) return json({model:fixtures.embedder_id,data:[{index:0,embedding:neutral.vector}]});
      await new Promise(resolve => pending.push({input,release:resolve}));
      const item = input === neutral.text ? neutral : joy;
      return json({model:fixtures.embedder_id,data:[{index:0,embedding:item.vector}]});
    }
    return json({});
  });
  await page.goto(`http://127.0.0.1:4189/${relative(root,temp)}/index.html`);
  const waitFor = async pred => { for(let i=0;i<100;i++){if(pred())return;await new Promise(r=>setTimeout(r,20));}throw new Error("harness request did not arrive"); };
  const dock = page.locator(".et_monitor_slot");
  // Live with a conversation: the reply in view, per message; no title, no button, no framing block.
  await dock.locator('[data-reading-state="conversation"]').waitFor();
  assert.equal(await dock.locator("button").count(),0,"no button in the monitor");
  assert.equal(await dock.getByText("Cognitive Monitor").count(),0,"no title in the monitor");
  await page.getByText("reading…", {exact:true}).waitFor();
  await waitFor(()=>pending.length===1);
  await page.screenshot({path:resolve(shots,"entity-cognition-reading.png")});
  await page.getByRole("button",{name:"Joy",exact:true}).click();
  await waitFor(()=>pending.length===2);
  await page.getByRole("button",{name:"Neutral",exact:true}).click();
  assert.equal(pending.length,2,"A→B→A shares the pending A embed");
  pending[0].release();
  const live = page.locator('.cm_panel[data-reading-state="live"]');
  await live.waitFor();
  // The signed tone row: a named group of the five channels, each with its signed score.
  const row = page.getByRole("group",{name:"Tone of the phrasing"});
  const codes = async () => row.locator(".cm_tone_name").allTextContents();
  const values = () => row.locator(".cm_tone_val").allTextContents();
  assert.deepEqual(await codes(),["warmth","tension","reflection","structure","certainty"],"five tone channels by name, in order (no 3-letter code)");
  const neutralValues = await values();
  for (const v of neutralValues) assert.match(v,/^[−-]?\d\.\d\d$/,`a signed score, never a mark: ${v}`);
  pending[1].release();
  await page.waitForTimeout(80);
  assert.deepEqual(await values(),neutralValues,"late B cannot replace the visible A reading");
  await page.screenshot({path:resolve(shots,"entity-cognition-neutral.png")});
  // The bloom's hover names the closest register (the reading's one line has no mood dot any more).
  const mood = () => page.locator(".cm_panel .cm_canvas_box").getAttribute("title");
  const neutralMood = await mood();
  await page.getByRole("button",{name:"Joy",exact:true}).click();
  await page.waitForFunction((t) => document.querySelector(".cm_panel .cm_canvas_box")?.getAttribute("title") !== t, neutralMood);
  await page.waitForTimeout(300);
  console.log(`  neutral: ${neutralMood} [${neutralValues.join(" ")}]; joy: ${await mood()} [${(await values()).join(" ")}]`);
  assert.match(await mood(),/^closest to [a-z]+ \([−-]?\d\.\d\d\)$/,"the bloom's hover names the closest register (by name, no code) and its similarity");
  assert.notDeepEqual(await values(),neutralValues,"the joy control reads differently on the row");
  await page.screenshot({path:resolve(shots,"entity-cognition-joy.png")});
  // The replay: his words at the timeline's position, read by itself on opening (here: nothing
  // readable, the harness's life is empty); the conversation's reading goes.
  await page.getByRole("button",{name:"Replay",exact:true}).click();
  await dock.getByText("nothing readable yet", {exact:true}).waitFor();
  assert.equal(await dock.locator(".cm_panel").count(),0,"on the replay the conversation's reading is not shown");
  await page.screenshot({path:resolve(shots,"entity-cognition-replay.png")});
  // Back to live: the reading mounts again and shows the reply already read, without a second embed.
  await page.getByRole("button",{name:"Replay",exact:true}).click();
  await live.waitFor();
  await page.waitForTimeout(150);
  assert.equal(pending.length,2,"a reply already read is never embedded again (the cache outlives the reading's mount)");
  // Another entity whose home embeds in another space: its pin answers after the conversation
  // emptied; the next reply is never shown as a reading.
  await page.getByRole("button",{name:"Other entity",exact:true}).click();
  await waitFor(()=>Boolean(pinRelease));
  await page.getByRole("button",{name:"Empty",exact:true}).click();
  pinRelease(); await page.waitForTimeout(80);
  await page.getByRole("button",{name:"Neutral",exact:true}).click();
  await page.locator('.cm_panel[data-reading-state="unavailable"]').waitFor();
  await page.getByText("not read",{exact:true}).first().waitFor();
  assert.equal(await page.getByRole("group",{name:"Tone of the phrasing"}).count(),0,"mismatched model shows no tone row");
  // Desktop and phone with touch (coarse pointer, 44 px targets): the five named channels are a column inside the
  // bloom column (never a lone code), the page does not scroll sideways, the values keep a 4.5:1
  // contrast on the dock.
  for (const [width,touch] of [[1440,false],[400,true]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
    const phone = await ctx.newPage();
    phone.on("pageerror", error => errors.push(String(error)));
    await phone.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      const json = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      if (url.pathname.endsWith("/embedding")) return json({pin:{model_id:fixtures.embedder_id},resolved_embedder:fixtures.embedder_id,match:"match"});
      if (url.pathname.endsWith("/embeddings")) { const input = route.request().postDataJSON().input[0]; return json({model:fixtures.embedder_id,data:[{index:0,embedding:(input===neutral.text?neutral:joy).vector}]}); }
      return json({});
    });
    await phone.goto(`http://127.0.0.1:4189/${relative(root,temp)}/index.html`);
    await phone.getByRole("button",{name:"Joy",exact:true}).click();
    await phone.locator('.cm_panel[data-reading-state="live"] .cm_tone_list').waitFor();
    await phone.waitForTimeout(400);
    const layout = await phone.evaluate(() => {
      const rowEl = document.querySelector(".cm_tone_list"), box = document.querySelector(".cw_panel.cw_compact").getBoundingClientRect();
      const tops = [...rowEl.querySelectorAll(".cm_tone_name")].map(c => Math.round(c.getBoundingClientRect().top));
      const perLine = [...new Set(tops)].map(t => tops.filter(x => x === t).length);
      const rgb = s => s.match(/[\d.]+/g).map(Number);
      const lum = ([r,g,b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
      const bg = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length < 4 || c[3] > 0.9) { if (c.length >= 3 && !(c.length === 4 && c[3] === 0)) return c.slice(0,3); } } return [255,255,255]; };
      const contrast = el => { const a = lum(rgb(getComputedStyle(el).color).slice(0,3)), b = lum(bg(el)); return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05); };
      const dockEl = document.querySelector(".et_monitor_slot");
      const monitorEl = document.querySelector(".cw_panel.cw_compact");
      return { perLine, inside: [...rowEl.querySelectorAll(".cm_tone_name, .cm_tone_val")].every(c => { const r = c.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1; }),
        scroll: document.documentElement.scrollWidth, inner: innerWidth, dockScroll: dockEl.scrollWidth, dockWidth: dockEl.clientWidth,
        monitorHeight: Math.round(monitorEl.getBoundingClientRect().height),
        valContrast: Math.min(...[...rowEl.querySelectorAll(".cm_tone_val")].map(contrast)) };
    });
    console.log(`  ${width}${touch ? " touch" : ""}: names per line ${layout.perLine.join("+")}, value contrast ${layout.valContrast.toFixed(2)}, monitor ${layout.monitorHeight} px tall, scrollWidth ${layout.scroll}/${layout.inner}, slot ${layout.dockScroll}/${layout.dockWidth}`);
    assert.ok(layout.inside, `the named channels stay inside the monitor at ${width}`);
    assert.deepEqual(layout.perLine,[1,1,1,1,1],`one channel per line at ${width}: ${layout.perLine}`);
    assert.ok(layout.monitorHeight <= (width >= 768 ? 160 : 260), `the monitor stays within its room (${layout.monitorHeight} px) at ${width}`);
    assert.ok(layout.scroll <= layout.inner, `no sideways scroll at ${width}`);
    assert.equal(layout.inner, width, `the page keeps its ${width} px width (nothing wider forced a zoom-out)`);
    assert.ok(layout.dockScroll <= layout.dockWidth, `the monitor never scrolls sideways at ${width}`);
    assert.ok(layout.valContrast >= 4.5, `value contrast ${layout.valContrast.toFixed(2)} at ${width}`);
    await phone.screenshot({path:resolve(shots,`entity-cognition-joy-${width}${touch?"-touch":""}.png`),fullPage:true});
    await ctx.close();
  }
  assert.deepEqual(errors,[]);
  console.log("cognition browser (the monitor in the timeline): live reply reading, focus race, the five named channels, joy, replay mode, detached mismatch, 1440 + 400 touch layout and contrast passed");
} finally {
  await browser?.close(); await server.close(); rmSync(temp,{recursive:true,force:true});
}

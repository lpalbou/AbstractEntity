// Real CognitionWaveInline mount with bounded deterministic embedding replies; no live writes.
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
const NEUTRAL_READING = "Typical phrasing, no tone stands out — no clear emotion.";
const JOY_READING = "The words lean strongly toward joy (JOY) with a thread of calm (CAL); very assured phrasing.";
const shots = resolve(arg("shots") || resolve(root, "untracked/cognition-browser"));
mkdirSync(shots, { recursive: true });
mkdirSync(resolve(root, "untracked"), { recursive: true });
const temp = mkdtempSync(resolve(root, "untracked/cognition-harness-"));
writeFileSync(resolve(temp, "index.html"), '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><div id="root"></div><script type="module" src="./main.tsx"></script></html>');
writeFileSync(resolve(temp, "main.tsx"), `
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {CognitionWaveInline} from "/src/cognition_wave_inline.tsx";
import "@abstractframework/ui-kit/theme.css";
import "/src/entity.css";
function Test(){
const [text,setText]=useState(${JSON.stringify(neutral.text)});
const [entity,setEntity]=useState("castor");
return <main style={{width:"min(520px, 100%)",margin:"30px auto",boxSizing:"border-box"}}>
<div style={{display:"flex",gap:12,marginBottom:20}}>
<button onClick={()=>setText(${JSON.stringify(neutral.text)})}>Neutral</button>
<button onClick={()=>setText(${JSON.stringify(joy.text)})}>Joy</button>
<button onClick={()=>setText(null)}>Empty</button>
<button onClick={()=>setEntity("mismatch")}>Other entity</button>
</div><CognitionWaveInline baseUrl="" entity={entity} latestReply={text}
 effort={{think_ms:24800,tool_rounds:0,memories_recalled:44,memories_formed:1}} effortKey="turn-1"/>
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
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const json = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname.endsWith("/embedding")) {
      if (url.pathname.includes("/mismatch/")) { await new Promise(resolve => { pinRelease = resolve; }); return json({pin:{model_id:"different-embedding-space"}}); }
      return json({pin:{model_id:fixtures.embedder_id}});
    }
    if (url.pathname.endsWith("/embeddings")) {
      const input = route.request().postDataJSON().input[0];
      await new Promise(resolve => pending.push({input,release:resolve}));
      const item = input === neutral.text ? neutral : joy;
      return json({model:fixtures.embedder_id,data:[{index:0,embedding:item.vector}]});
    }
    return json({});
  });
  await page.goto(`http://127.0.0.1:4189/${relative(root,temp)}/index.html`);
  const waitFor = async pred => { for(let i=0;i<100;i++){if(pred())return;await new Promise(r=>setTimeout(r,20));}throw new Error("harness request did not arrive"); };
  await page.getByText("Reading this reply…", {exact:true}).waitFor();
  await waitFor(()=>pending.length===1);
  await page.screenshot({path:resolve(shots,"entity-cognition-reading.png")});
  await page.getByRole("button",{name:"Joy",exact:true}).click();
  await waitFor(()=>pending.length===2);
  await page.getByRole("button",{name:"Neutral",exact:true}).click();
  assert.equal(pending.length,2,"A→B→A shares the pending A embed");
  pending[0].release();
  // The neutral fixture: emotions gated AND every tone channel typical (outer-tail cutoffs).
  const line = page.locator('.cm_panel[data-reading-state="live"] .cm_reading_line');
  await line.waitFor();
  assert.equal(await line.textContent(),NEUTRAL_READING);
  pending[1].release();
  await page.waitForTimeout(80);
  assert.equal(await line.count(),1,"late B cannot replace the visible A reading");
  assert.equal(await line.textContent(),NEUTRAL_READING,"late B cannot replace the visible A reading");
  // The signed tone row: a named group of five buttons, each named with channel, value and pole.
  const row = page.getByRole("group",{name:"Tone of the phrasing"});
  assert.equal(await row.getByRole("button").count(),5,"five tone channels");
  assert.deepEqual(await row.locator(".cm_tone_val").allTextContents(),["·","·","·","·","·"],"a neutral reply is typical on every channel");
  for (const [i,name] of ["warmth","tension","reflection","structure","certainty"].entries())
    assert.match(await row.getByRole("button").nth(i).getAttribute("aria-label"),new RegExp(`^${name} -?\\d\\.\\d\\d, typical$`));
  await page.screenshot({path:resolve(shots,"entity-cognition-quiet.png")});
  await page.getByRole("button",{name:"Joy",exact:true}).click();
  await page.locator('.cm_mood_dot[title="leaning joy"]').waitFor();
  await page.waitForTimeout(300);
  // Second reply of the session: the session-relative "wanders" clause may follow.
  assert.ok((await line.textContent()).startsWith(JOY_READING.slice(0,-1)),"the joy control names joy, and its strong certainty");
  assert.deepEqual(await row.locator(".cm_tone_val").allTextContents(),["++","·","·","·","++"],"the joy control: very warm and very assured on the row");
  await page.screenshot({path:resolve(shots,"entity-cognition-joy.png")});
  await page.getByRole("button",{name:"Other entity",exact:true}).click();
  await waitFor(()=>Boolean(pinRelease));
  await page.getByRole("button",{name:"Empty",exact:true}).click();
  pinRelease(); await page.waitForTimeout(80);
  await page.getByRole("button",{name:"Neutral",exact:true}).click();
  await page.locator('.cm_panel[data-reading-state="unavailable"]').waitFor();
  await page.getByText("This reply has not been scored.",{exact:true}).waitFor();
  assert.equal(await page.locator(".cm_reading_line").count(),0,"mismatched model never looks like a scored reading");
  assert.equal(await page.getByRole("group",{name:"Tone of the phrasing"}).count(),0,"mismatched model shows no tone row");
  // Phone with touch (coarse pointer, 44 px targets): the row is a 3 + 2 grid inside the bloom
  // column (never a lone code), the page does not scroll sideways, and the tier marks and the
  // reading line keep a 4.5:1 contrast on the panel.
  for (const [width,touch] of [[1440,false],[400,true]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
    const phone = await ctx.newPage();
    phone.on("pageerror", error => errors.push(String(error)));
    await phone.addInitScript(() => { try { localStorage.setItem("abstractentity_cogmon_fold_v1", "0"); } catch {} });
    await phone.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      const json = data => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      if (url.pathname.endsWith("/embedding")) return json({pin:{model_id:fixtures.embedder_id}});
      if (url.pathname.endsWith("/embeddings")) { const input = route.request().postDataJSON().input[0]; return json({model:fixtures.embedder_id,data:[{index:0,embedding:(input===neutral.text?neutral:joy).vector}]}); }
      return json({});
    });
    await phone.goto(`http://127.0.0.1:4189/${relative(root,temp)}/index.html`);
    await phone.getByRole("button",{name:"Joy",exact:true}).click();
    await phone.locator('.cm_panel[data-reading-state="live"] .cm_reading_line').waitFor();
    await phone.waitForTimeout(400);
    const layout = await phone.evaluate(() => {
      const rowEl = document.querySelector(".cm_tone_codes"), box = rowEl.parentElement.getBoundingClientRect();
      const tops = [...rowEl.children].map(c => Math.round(c.getBoundingClientRect().top));
      const perLine = [...new Set(tops)].map(t => tops.filter(x => x === t).length);
      const rgb = s => s.match(/[\d.]+/g).map(Number);
      const lum = ([r,g,b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
      const bg = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length < 4 || c[3] > 0.9) { if (c.length >= 3 && !(c.length === 4 && c[3] === 0)) return c.slice(0,3); } } return [255,255,255]; };
      const contrast = el => { const a = lum(rgb(getComputedStyle(el).color).slice(0,3)), b = lum(bg(el)); return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05); };
      return { perLine, inside: [...rowEl.children].every(c => { const r = c.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1; }),
        scroll: document.documentElement.scrollWidth, inner: innerWidth,
        valContrast: Math.min(...[...rowEl.querySelectorAll(".cm_tone_val")].map(contrast)), lineContrast: contrast(document.querySelector(".cm_reading_line")) };
    });
    console.log(`  ${width}${touch ? " touch" : ""}: codes per line ${layout.perLine.join("+")}, mark contrast ${layout.valContrast.toFixed(2)}, line contrast ${layout.lineContrast.toFixed(2)}, scrollWidth ${layout.scroll}/${layout.inner}`);
    assert.ok(layout.inside, `the tone row stays inside the bloom column at ${width}`);
    assert.ok(!layout.perLine.includes(1) || layout.perLine.length === 1, `no lone tone code at ${width}: ${layout.perLine}`);
    if (touch) assert.deepEqual(layout.perLine,[3,2],"touch: a 3 + 2 grid");
    assert.ok(layout.scroll <= layout.inner, `no sideways scroll at ${width}`);
    assert.ok(layout.valContrast >= 4.5, `tier marks contrast ${layout.valContrast.toFixed(2)} at ${width}`);
    assert.ok(layout.lineContrast >= 4.5, `reading line contrast ${layout.lineContrast.toFixed(2)} at ${width}`);
    await phone.screenshot({path:resolve(shots,`entity-cognition-joy-${width}${touch?"-touch":""}.png`),fullPage:true});
    await phone.getByRole("button",{name:"Neutral",exact:true}).click();
    await phone.waitForFunction(t => document.querySelector(".cm_reading_line")?.textContent?.startsWith(t), NEUTRAL_READING.slice(0,-1));
    await phone.screenshot({path:resolve(shots,`entity-cognition-neutral-${width}${touch?"-touch":""}.png`),fullPage:true});
    await ctx.close();
  }
  assert.deepEqual(errors,[]);
  console.log("cognition browser: reading, focus race, neutral tone row, real joy petals and tone, detached mismatch recovery, 1440 + 400 touch layout and contrast passed");
} finally {
  await browser?.close(); await server.close(); rmSync(temp,{recursive:true,force:true});
}

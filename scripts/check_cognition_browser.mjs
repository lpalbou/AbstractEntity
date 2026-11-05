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
const shots = resolve(arg("shots") || resolve(root, "untracked/cognition-browser"));
mkdirSync(shots, { recursive: true });
mkdirSync(resolve(root, "untracked"), { recursive: true });
const temp = mkdtempSync(resolve(root, "untracked/cognition-harness-"));
writeFileSync(resolve(temp, "index.html"), '<html><div id="root"></div><script type="module" src="./main.tsx"></script></html>');
writeFileSync(resolve(temp, "main.tsx"), `
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {CognitionWaveInline} from "/src/cognition_wave_inline.tsx";
import "@abstractframework/ui-kit/theme.css";
import "/src/entity.css";
function Test(){
const [text,setText]=useState(${JSON.stringify(neutral.text)});
const [entity,setEntity]=useState("castor");
return <main style={{width:520,margin:"30px auto"}}>
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
  await page.getByText("Read complete · no clear emotional tone",{exact:true}).waitFor();
  pending[1].release();
  await page.waitForTimeout(80);
  assert.equal(await page.locator('.cm_panel[data-reading-state="live"] .cm_quiet').count(),1,"late B cannot replace the visible A reading");
  await page.screenshot({path:resolve(shots,"entity-cognition-quiet.png")});
  await page.getByRole("button",{name:"Joy",exact:true}).click();
  await page.locator('.cm_mood_dot[title="leaning joy"]').waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".cm_quiet").count(),0,"emotional positive control shows real petals");
  await page.screenshot({path:resolve(shots,"entity-cognition-joy.png")});
  await page.getByRole("button",{name:"Other entity",exact:true}).click();
  await waitFor(()=>Boolean(pinRelease));
  await page.getByRole("button",{name:"Empty",exact:true}).click();
  pinRelease(); await page.waitForTimeout(80);
  await page.getByRole("button",{name:"Neutral",exact:true}).click();
  await page.locator('.cm_panel[data-reading-state="unavailable"]').waitFor();
  await page.getByText("This reply has not been scored.",{exact:true}).waitFor();
  assert.equal(await page.locator(".cm_quiet").count(),0,"mismatched model never looks like a quiet scored result");
  assert.deepEqual(errors,[]);
  console.log("cognition browser: reading, focus race, quiet, real joy petals and detached mismatch recovery passed");
} finally {
  await browser?.close(); await server.close(); rmSync(temp,{recursive:true,force:true});
}

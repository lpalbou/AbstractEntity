#!/usr/bin/env node
/**
 * One-shot mechanical sweep of src/entity.css toward abstractuic theme
 * compliance (operator 2026-07-15 (b) + adversarial review round 2):
 *
 *  1. FONT SCALE — every `font-size: Npx` literal becomes
 *     `calc(Npx * var(--font-scale, 1))` so the shared Appearance
 *     "Font size" control scales the WHOLE app, not just kit chrome.
 *     Sizes below 10px are floored to 10px (readability floor; the
 *     reviewers found 9px content text on daily surfaces).
 *
 *  2. COLOR TOKENS — hardcoded dark-tuned hex/rgba colors are mapped to
 *     the app's semantic tokens (which alias kit tokens), so the light
 *     themes offered by the shared appearance dialog actually work.
 *     rgba(R,G,B,a) forms become color-mix(in srgb, TOKEN a%, transparent)
 *     preserving the alpha ramp.
 *
 * var(--x, fallback) expressions are protected (placeholder swap) so the
 * :root alias fallbacks are never rewritten. Idempotent by construction:
 * already-swept values contain `var(` or `color-mix(` and no bare literal.
 */
import fs from "node:fs";

const path = new URL("../src/entity.css", import.meta.url).pathname;
let css = fs.readFileSync(path, "utf8");

// ---- protect var(--name, fallback) fallbacks ----
const protectedChunks = [];
css = css.replace(/var\(--[a-zA-Z0-9-]+\s*,\s*[^()]*\)/g, (m) => {
  protectedChunks.push(m);
  return `\u0001${protectedChunks.length - 1}\u0001`;
});

// ---- 1. font-size sweep ----
let fontCount = 0;
css = css.replace(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g, (_m, n) => {
  let v = parseFloat(n);
  if (v < 10) v = 10; // readability floor
  fontCount++;
  return `font-size: calc(${v}px * var(--font-scale, 1))`;
});

// ---- 2a. hex → token ----
const HEX = {
  // text grays (light-on-dark → theme text tokens)
  "#e2e8f0": "var(--text)",
  "#d7e0ee": "var(--text)",
  "#cbd5e1": "var(--text)",
  "#d7dee8": "var(--text)",
  "#a9b6c9": "var(--text-dim)",
  "#8b98ad": "var(--text-dim)",
  "#8a94a6": "var(--text-dim)",
  "#8fa3bd": "var(--text-dim)",
  "#7d8aa0": "var(--text-dim)",
  "#64748b": "var(--text-dim)",
  // dark surfaces
  "#070a12": "var(--bg)",
  "#0b0f16": "var(--bg)",
  "#0d131c": "var(--bg)",
  "#10161e": "var(--bg-panel)",
  "#131a26": "var(--bg-panel)",
  "#131a2a": "var(--bg-panel)",
  "#161e28": "var(--bg-raise)",
  "#232a35": "var(--bg-raise)",
  "#24304a": "var(--line)",
  "#1f2937": "var(--line)",
  // accent / gold family
  "#e8a54a": "var(--accent)",
  "#e8b04b": "var(--accent)",
  "#e8c98a": "color-mix(in srgb, var(--accent) 70%, var(--text))",
  "#d8b45a": "var(--identity)",
  "#d8c07a": "color-mix(in srgb, var(--bond) 75%, var(--text))",
  "#f0c060": "var(--bond)",
  // greens (diary / ok)
  "#7bc98c": "var(--diary)",
  "#7fd18a": "var(--diary)",
  "#6edca0": "var(--diary)",
  // purples (standing / book seal / meets)
  "#b8a8ec": "var(--standing)",
  "#d7ccf5": "color-mix(in srgb, var(--standing) 55%, var(--text))",
  "#c084dd": "var(--standing)",
  "#a58fe0": "var(--adm-stm)",
  // reds (errors ride the scar token; mixed toward text so light themes darken)
  "#e05555": "var(--scar)",
  "#e08b8b": "color-mix(in srgb, var(--scar) 65%, var(--text))",
  "#e0a5a5": "color-mix(in srgb, var(--scar) 55%, var(--text))",
  "#f0a0a0": "color-mix(in srgb, var(--scar) 55%, var(--text))",
  "#ff9c9c": "color-mix(in srgb, var(--scar) 60%, var(--text))",
  // blues / cyan
  "#6ea8d8": "var(--memory)",
  "#9fc3e0": "color-mix(in srgb, var(--memory) 60%, var(--text))",
  "#59c2d8": "var(--adm-stimulus)",
  "#6fd8b0": "var(--adm-both)",
  "#e7b45a": "var(--identity)",
};
let hexCount = 0;
for (const [hex, token] of Object.entries(HEX)) {
  const re = new RegExp(hex.replace("#", "#") , "gi");
  css = css.replace(re, () => {
    hexCount++;
    return token;
  });
}

// ---- 2b. rgba(R,G,B,a) → color-mix over token ----
const RGBA = {
  "125,138,160": "var(--text-dim)",
  "184,168,236": "var(--standing)",
  "110,168,216": "var(--memory)",
  "110,168,254": "var(--memory)",
  "224,85,85": "var(--scar)",
  "232,165,74": "var(--accent)",
  "232,176,75": "var(--accent)",
  "244,162,89": "var(--accent)",
  "240,192,96": "var(--bond)",
  "123,201,140": "var(--diary)",
  "125,216,160": "var(--diary)",
  "10,14,20": "var(--bg)",
  "4,7,11": "var(--bg)",
  "16,22,30": "var(--bg-panel)",
  "16,22,31": "var(--bg-panel)",
  "31,41,55": "var(--line)",
  "255,255,255": "var(--text)",
};
let rgbaCount = 0;
css = css.replace(
  /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/g,
  (m, r, g, b, a) => {
    const key = `${r},${g},${b}`;
    const token = RGBA[key];
    if (!token) return m; // black shadows etc. stay
    rgbaCount++;
    const pct = Math.round(parseFloat(a) * 100);
    if (pct >= 100) return token;
    return `color-mix(in srgb, ${token} ${pct}%, transparent)`;
  },
);

// ---- restore protected fallbacks ----
css = css.replace(/\u0001(\d+)\u0001/g, (_m, i) => protectedChunks[Number(i)]);

fs.writeFileSync(path, css);
console.log(
  `font-size → calc(scale): ${fontCount} | hex → token: ${hexCount} | rgba → color-mix: ${rgbaCount}`,
);

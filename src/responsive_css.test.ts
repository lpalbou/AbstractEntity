/**
 * Guards for the responsive layer (DESIGN v1, review round 4). Each test
 * reads the real stylesheet / index.html and fails when the rule it guards is
 * removed or weakened: the drawer below 1024 px, the sheets below 768 px, the
 * touch block, the keyboard-aware shell, the short-shell full-screen drawer,
 * the graph container threshold and the shared breakpoints.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { DEFAULT_WIDTH } from "./drawer";

const CSS = readFileSync(resolve(__dirname, "entity.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const CANVAS_CSS = readFileSync(resolve(__dirname, "graph_canvas.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const HTML = readFileSync(resolve(__dirname, "..", "index.html"), "utf8");

/** The bodies of every top-level at-rule block whose prelude matches exactly. */
function atBlocks(prelude: string, css: string = CSS): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(prelude + " {", from);
    if (at < 0) return out;
    let depth = 0;
    let i = css.indexOf("{", at);
    const start = i + 1;
    for (; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(css.slice(start, i));
    from = i;
  }
}

/** Every declaration block for `selector` inside a CSS text (the selector
 * alone or as one member of a selector list), joined. */
function rule(text: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[}\\s,])${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "g");
  return [...text.matchAll(re)].map((m) => m[1]).join("\n");
}

describe("responsive layer: side panel", () => {
  it("below 1024 px the open panel overlays the canvas as a drawer with a backdrop", () => {
    const md = atBlocks("@media (max-width: 1023.98px)").join("\n");
    expect(rule(md, ".side_tabs_drawer .st_panel")).toMatch(/position:\s*absolute/);
    expect(rule(md, ".st_backdrop")).toMatch(/position:\s*absolute/);
    expect(rule(md, ".side_tabs.side_tabs_drawer")).toMatch(/width:\s*40px/);
  });

  it("below 768 px / short viewports the rail is a horizontal tab strip", () => {
    const sm = atBlocks("@media (max-width: 767.98px), (max-height: 500px)").join("\n");
    expect(rule(sm, ".side_tabs_drawer .st_rail")).toMatch(/flex-direction:\s*row/);
    expect(sm).toMatch(/writing-mode:\s*horizontal-tb/);
  });

  it("a short shell (keyboard up / landscape phone) turns the open drawer into a full-screen column above the keyboard", () => {
    const blocks = atBlocks("@container entity-shell (max-height: 559.98px)");
    expect(blocks.length).toBe(1);
    const open = rule(blocks[0], ".side_tabs.side_tabs_drawer:not(.side_tabs_collapsed)");
    expect(open).toMatch(/position:\s*fixed/);
    expect(open).toMatch(/bottom:\s*var\(--keyboard-inset,\s*0px\)/);
    expect(rule(blocks[0], ".side_tabs_drawer .cd_thread")).toMatch(/min-height:\s*\d+px/);
    expect(rule(CSS, "#root")).toMatch(/container:\s*entity-shell\s*\/\s*size/);
  });
});

describe("responsive layer: graph canvas", () => {
  it("the canvas overlays adapt by container query, and the threshold spares a docked 1280 px laptop window", () => {
    const m = /@container entity-canvas \(max-width: ([\d.]+)px\)/.exec(CSS);
    expect(m).not.toBeNull();
    const threshold = Number(m![1]);
    // 1280 px window, panel docked at its default width: the labelled layout.
    expect(1280 - DEFAULT_WIDTH).toBeGreaterThan(threshold);
    // iPad landscape (1180) with the panel docked: the lens row no longer fits.
    expect(1180 - DEFAULT_WIDTH).toBeLessThan(threshold);
    const block = atBlocks(`@container entity-canvas (max-width: ${m![1]}px)`)[0];
    expect(block).toContain(".entity_lens_bar");
    expect(block).toContain(".gc_btn_word");
    expect(rule(CSS, ".entity_canvas_wrap")).toMatch(/container:\s*entity-canvas\s*\/\s*inline-size/);
  });

  it("phone-width canvas: the open Context legend ends above the motion buttons and scrolls inside (live verification 2026-11-09)", () => {
    const m = /@container entity-canvas \(max-width: ([\d.]+)px\)/.exec(CSS)!;
    const narrow = atBlocks(`@container entity-canvas (max-width: ${m[1]}px)`).join("\n");
    const canvasNarrow = atBlocks(`@container entity-canvas (max-width: ${m[1]}px)`, CANVAS_CSS).join("\n");
    // One geometry, declared once on the canvas container and read by both.
    const wrap = rule(CSS, ".entity_canvas_wrap");
    expect(wrap).toMatch(/--gc-legend-top:\s*\d+px/);
    expect(wrap).toMatch(/--gc-motion-bottom:\s*\d+px/);
    expect(wrap).toMatch(/--gc-legend-floor:\s*calc\(var\(--tap-min, 32px\) \+ \d+px\)/);
    const legend = rule(canvasNarrow, ".gc_recall_legend");
    expect(legend).toMatch(/top:\s*var\(--gc-legend-top\)/);
    expect(legend).toMatch(/overflow-y:\s*auto/);
    // The base box lets the pointer through to the canvas; open on a phone it takes it, to scroll.
    expect(rule(CANVAS_CSS, ".gc_recall_legend")).toMatch(/pointer-events:\s*none/);
    expect(rule(canvasNarrow, ".gc_recall_legend.gc_rl_open")).toMatch(/pointer-events:\s*auto/);
  });

  it("a short phone canvas (400 × 700, review B1): the legend keeps one summary line and the motion buttons move below it, never under it", () => {
    const m = /@container entity-canvas \(max-width: ([\d.]+)px\)/.exec(CSS)!;
    const narrow = atBlocks(`@container entity-canvas (max-width: ${m[1]}px)`).join("\n");
    const canvasNarrow = atBlocks(`@container entity-canvas (max-width: ${m[1]}px)`, CANVAS_CSS).join("\n");
    const wrap = rule(CSS, ".entity_canvas_wrap");
    const decl = (body: string, prop: string) => new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? "";
    // Evaluate the real declarations for a canvas H px tall and a tap target of `tap` px
    // (32 fine pointer, 44 touch): var() -> value, % -> of H, calc/min/max -> arithmetic.
    const evalCss = (expr: string, vars: Record<string, number>, H: number): number => {
      let js = expr;
      for (let i = 0; i < 4; i++) js = js.replace(/var\((--[\w-]+)(?:,\s*[^()]*)?\)/g, (_, name: string) => `(${vars[name] ?? NaN})`);
      js = js.replace(/(\d+(?:\.\d+)?)%/g, (_, n: string) => `(${(Number(n) / 100) * H})`).replace(/(\d+(?:\.\d+)?)px/g, "$1");
      js = js.replace(/\bcalc\(/g, "(").replace(/\bmin\(/g, "Math.min(").replace(/\bmax\(/g, "Math.max(");
      expect(js, expr).toMatch(/^(?:[\d\s.+\-*/(),]|Math\.(?:min|max))+$/);
      return Function(`return ${js};`)() as number;
    };
    const top = Number(/--gc-legend-top:\s*(\d+)px/.exec(wrap)![1]);
    const mb = Number(/--gc-motion-bottom:\s*(\d+)px/.exec(wrap)![1]);
    const legend = rule(canvasNarrow, ".gc_recall_legend");
    const buttons = rule(narrow, ".gc_motion_controls");
    for (const tap of [32, 44]) {
      const floor = evalCss(/--gc-legend-floor:\s*([^;]+);/.exec(wrap)![1], { "--tap-min": tap }, 0);
      // The floor holds the summary: one tap target (the button's own height on touch) plus padding and border.
      expect(floor).toBeGreaterThanOrEqual(tap + 10);
      const vars = { "--tap-min": tap, "--gc-legend-top": top, "--gc-motion-bottom": mb, "--gc-legend-floor": floor };
      // 159 px: the live 400 × 700 canvas (castor, 2026-11-09); 259: 400 × 800; then taller ones.
      for (const H of [159, 180, 220, 259, 320, 480, 860]) {
        const maxH = evalCss(decl(legend, "max-height"), vars, H);
        const bottom = evalCss(decl(buttons, "bottom"), vars, H);
        const buttonsTop = H - bottom - tap;
        // Never shorter than its summary line…
        expect(maxH, `H=${H} tap=${tap}`).toBeGreaterThanOrEqual(floor);
        // …and the buttons start at least 8 px below the legend's lowest edge: a tap on the summary never lands on freeze.
        expect(buttonsTop - (top + maxH), `H=${H} tap=${tap}`).toBeGreaterThanOrEqual(8);
        // Where the canvas has room, the buttons keep their place.
        if (H - top - floor - 8 - tap >= mb) expect(bottom).toBe(mb);
        // The buttons never leave the canvas.
        if (H >= top + floor + 8 + tap) expect(bottom).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("responsive layer: shell, dialogs, touch", () => {
  it("the shell follows the visible viewport minus the keyboard (never 100vh alone, never the pinch-sensitive --vv-height)", () => {
    const shell = rule(CSS, ".entity_app");
    expect(shell).toMatch(/height:\s*calc\(var\(--vh-full,\s*100vh\)\s*-\s*var\(--keyboard-inset,\s*0px\)\)/);
    expect(shell).not.toMatch(/--vv-height/);
  });

  it("app dialogs become bottom sheets on phones and end above the keyboard", () => {
    const sm = atBlocks("@media (max-width: 767.98px), (max-height: 500px)").join("\n");
    expect(rule(sm, ".ev_backdrop")).toMatch(/align-items:\s*flex-end/);
    expect(rule(sm, ".ev_panel")).toMatch(/border-radius:\s*12px 12px 0 0/);
    expect(rule(CSS, ".ev_backdrop")).toMatch(/bottom:\s*var\(--keyboard-inset,\s*0px\)/);
  });

  it("touch: 44 px targets, 16 px fields, radio/checkbox labels as targets, selects never arrow-less", () => {
    const touch = atBlocks("@media (pointer: coarse)").join("\n");
    expect(touch).toMatch(/#root button,[\s\S]*?\{[^}]*min-height:\s*var\(--tap-min,\s*44px\)/);
    expect(rule(touch, "#root select")).toMatch(/font-size:\s*max\(16px,\s*var\(--font-size-input/);
    const sel = rule(touch, '#root select:not([multiple]):where(:not([size]), [size="1"])');
    expect(sel).toMatch(/appearance:\s*none/);
    // The kit token with an inline fallback: works on ui-kit 0.3.1 and 0.3.2.
    expect(sel).toMatch(/background-image:\s*var\(--af-select-chevron,\s*url\("data:image\/svg\+xml/);
    expect(touch).toMatch(/#root label:has\(> input\[type="radio"\]\)[\s\S]*?min-height:\s*var\(--tap-min/);
  });

  it("only the shared breakpoints are used (480 / 768 / 1024 / 1440 + 500 px tall)", () => {
    const values = [...CSS.matchAll(/@media[^{]*?\((max|min)-(width|height):\s*([\d.]+)px\)/g)].map((m) => `${m[1]}-${m[2]}:${m[3]}`);
    expect(values.length).toBeGreaterThan(0);
    const allowed = new Set(["max-width:479.98", "max-width:767.98", "max-width:1023.98", "max-width:1439.98", "min-width:1440", "max-height:500"]);
    for (const v of values) expect(allowed.has(v), v).toBe(true);
  });

  it("index.html: viewport-fit=cover and resizes-content, pinch-zoom never disabled", () => {
    const meta = /<meta name="viewport" content="([^"]+)"/.exec(HTML)?.[1] ?? "";
    expect(meta).toContain("viewport-fit=cover");
    expect(meta).toContain("interactive-widget=resizes-content");
    expect(meta).not.toMatch(/user-scalable|maximum-scale/);
  });
});

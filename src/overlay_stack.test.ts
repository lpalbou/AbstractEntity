/**
 * The phone overlay stack (castor's second topics night, 2026-11-10: at
 * 400 px the open Topics panel showed about one topic and sat over the
 * see-through Context legend). The rule is a DOM-free mapping
 * (overlay_stack.ts); its wiring into the canvas and the stylesheet that
 * reads it are pinned on the source, and the sheet's geometry is evaluated
 * from the real declarations for the phone canvases measured in the
 * harness (untracked/topics-phone-fix/check.mjs): 400 × 700 is 176 px,
 * 400 × 860 is 336 px.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  movePanel,
  overlayStack,
  PANEL_DOCKED,
  PANEL_GAP,
  PANEL_HEAD_H,
  PANEL_MIN_H,
  PANEL_STORAGE_KEY,
  PANEL_TOP_MIN,
  PANEL_W,
  panelVars,
  parsePanelFloat,
  resizePanel,
  serializePanelFloat,
  type StackLegend,
  type StackTopics,
} from "./overlay_stack";

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const CANVAS = read("graph_canvas.tsx");
const CANVAS_CSS = strip(read("graph_canvas.css"));
const CSS = strip(read("entity.css"));

/** The body of the (first) top-level block opened by `prelude`. */
function block(css: string, prelude: string): string {
  const at = css.indexOf(prelude + " {");
  expect(at, prelude).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let i = css.indexOf("{", at);
  const start = i + 1;
  for (; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}" && --depth === 0) break;
  }
  return css.slice(start, i);
}
/** The declarations of `selector` (the whole selector, first rule) inside `css`. */
function rule(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|[{}])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css);
  expect(m, selector).not.toBeNull();
  return m![1];
}
/** Every declaration block of `selector` inside `css`, joined (a selector declared twice). */
function rules(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`(?:^|[{}])\\s*${esc}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join("\n");
}
const decl = (body: string, prop: string) => new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? "";

/** A declaration's value for a canvas H px tall: var() -> value, % -> of H,
 * calc/min/max/clamp -> arithmetic. */
function evalCss(expr: string, vars: Record<string, string | number>, H: number): number {
  let js = expr;
  for (let i = 0; i < 6; i++) js = js.replace(/var\((--[\w-]+)(?:,\s*[^()]*)?\)/g, (_, name: string) => `(${vars[name] ?? NaN})`);
  js = js.replace(/(\d+(?:\.\d+)?)%/g, (_, n: string) => `(${(Number(n) / 100) * H})`).replace(/(\d+(?:\.\d+)?)px/g, "$1");
  js = js.replace(/\bcalc\(/g, "(").replace(/\bmin\(/g, "Math.min(").replace(/\bmax\(/g, "Math.max(").replace(/\bclamp\(/g, "clampCss(");
  expect(js, expr).toMatch(/^(?:[\d\s.+\-*/(),]|Math\.(?:min|max)|clampCss)+$/);
  return Function("clampCss", `return ${js};`)((lo: number, v: number, hi: number) => Math.max(lo, Math.min(v, hi))) as number;
}

const TOPICS: StackTopics[] = ["none", "line", "open"];
const LEGENDS: StackLegend[] = ["none", "folded", "open"];

describe("the mapping", () => {
  it("the legend and the open panel are never shown together; the panel open on its list is the sheet", () => {
    for (const t of TOPICS) {
      for (const l of LEGENDS) {
        const s = overlayStack(t, l);
        expect(s.topics, `${t}/${l}`).toBe(t === "open" ? "sheet" : t);
        expect(s.legend, `${t}/${l}`).toBe(l === "none" ? "none" : t === "open" ? "aside" : "shown");
        expect(s.legend === "shown" && s.topics === "sheet", `${t}/${l}`).toBe(false);
      }
    }
  });

  it("the legend's own fold state never decides whether it shows (it is kept while it steps aside)", () => {
    for (const t of TOPICS) expect(overlayStack(t, "open").legend).toBe(overlayStack(t, "folded").legend);
  });
});

describe("the canvas wiring", () => {
  it("the legend and the panel render inside the stack, the legend first, with the mapping's attributes", () => {
    const at = CANVAS.indexOf('className="gc_overlay_stack"\n        data-legend={stack.legend}\n        data-topics={stack.topics}\n        style={panelView ? (panelVars(panelFloat, dockTop) as React.CSSProperties) : undefined}\n      >');
    expect(at).toBeGreaterThan(0);
    const legend = CANVAS.indexOf("<ContextLegend recall={recall} open={legendOpen} onToggle={setLegendOpen} />", at);
    const float = CANVAS.indexOf('className="gc_topics_float"', at);
    const panel = CANVAS.indexOf("<TopicsPanel", at);
    expect(legend).toBeGreaterThan(at);
    expect(float).toBeGreaterThan(legend);
    expect(panel).toBeGreaterThan(float);
    // In the float box after the panel: its grip and (open on its list) its corner, then the box and the stack close.
    const tail = CANVAS.slice(panel, CANVAS.indexOf("{/* Motion controls:", panel));
    expect(tail).toMatch(/<div className="gc_tp_grip" aria-hidden="true" [^>]*onPointerDown=\{\(ev\) => startPanelDrag\(ev, "move"\)\}>/);
    expect(tail).toContain('{stack.topics === "sheet" ? (\n            <div className="gc_tp_resize" aria-hidden="true" title="Drag to resize the panel" onPointerDown={(ev) => startPanelDrag(ev, "size")} />');
    expect(tail.match(/<div/g)?.length).toBe(2);
    expect(CANVAS.match(/<ContextLegend /g)?.length).toBe(1);
    expect(CANVAS.match(/<TopicsPanel\b/g)?.length).toBe(1);
  });

  it("the mapping reads the panel open on a list (a note is a line) and the legend's fold", () => {
    expect(CANVAS).toContain("const panelView = showTopics && topicsView ? topicsPanelView ?? topicsView : null;");
    expect(CANVAS).toContain('!panelView ? "none" : topicsOpen && topicsNote(panelView) === null ? "open" : "line",');
    expect(CANVAS).toContain('!(recallShown && recall) ? "none" : legendOpen ? "open" : "folded",');
    expect(CANVAS).toContain("{panelView ? (");
    expect(CANVAS).toContain("{recallShown && recall ? (");
  });
});

describe("the stylesheet", () => {
  const narrow = block(CANVAS_CSS, "@container entity-canvas (max-width: 859.98px)");
  const wrap = rules(CSS, ".entity_canvas_wrap");
  const v = (name: string) => decl(wrap, name);

  it("a wide canvas draws no stack box: the legend keeps its place, the panel floats in its own box", () => {
    expect(decl(rule(CANVAS_CSS, ".gc_overlay_stack"), "display")).toBe("contents");
    // The panel's wide geometry is its float box's (overlay_stack panelVars), docked top-right by default.
    const box = rule(CANVAS_CSS, ".gc_topics_float");
    expect(decl(box, "position")).toBe("absolute");
    expect(decl(box, "top")).toBe("var(--gc-tp-top, 48px)");
    expect(decl(box, "left")).toBe("var(--gc-tp-left, auto)");
    expect(decl(box, "right")).toBe("var(--gc-tp-right, 10px)");
    expect(decl(box, "width")).toBe("var(--gc-tp-w, min(320px, calc(100% - 32px)))");
    expect(decl(box, "max-height")).toBe("calc(100% - var(--gc-tp-top, 48px) - 8px)");
    expect(decl(rule(CANVAS_CSS, '.gc_topics_float[data-docked="true"][data-sized="false"]'), "max-height")).toBe("min(58%, calc(100% - var(--gc-tp-top, 48px) - 12px))");
    const base = rule(CANVAS_CSS, ".gc_topics");
    expect(decl(base, "position")).toBe("relative");
    expect(decl(base, "width")).toBe("100%");
    expect(decl(base, "min-height")).toBe("0");
    // Resized, open on its list: its height (wide only).
    const wide = block(CANVAS_CSS, "@container entity-canvas (min-width: 860px)");
    expect(decl(rule(wide, '.gc_topics_float[data-sized="true"][data-list="true"] > .gc_topics'), "height")).toBe("var(--gc-tp-h)");
    // The Context legend is centred in the width the docked panel leaves.
    const legend = rule(CANVAS_CSS, ".gc_recall_legend");
    expect(decl(legend, "left")).toBe("calc((100% - var(--gc-tp-reserve, 0px)) / 2)");
    expect(decl(legend, "max-width")).toBe("min(760px, calc(100% - var(--gc-tp-reserve, 0px) - 32px))");
  });

  it("a phone keeps the stack: the float box draws nothing, its grip and corner are gone", () => {
    expect(decl(rule(narrow, ".gc_topics_float"), "display")).toBe("contents");
    expect(decl(rule(narrow, ".gc_tp_grip,\n  .gc_tp_resize,\n  .gc_tp_dock"), "display")).toBe("none");
    expect(decl(rule(narrow, '.gc_topics_float .gc_tp_head,\n  .gc_topics_float[data-docked="false"] .gc_tp_head'), "padding-right")).toBe("10px");
    expect(narrow).not.toContain("--gc-tp-");
  });

  it("the grip and the corner are over the panel (it is z 1 in the float box), so a press lands on them", () => {
    expect(decl(rule(CANVAS_CSS, ".gc_topics"), "z-index")).toBe("1");
    expect(Number(decl(rule(CANVAS_CSS, ".gc_tp_grip"), "z-index"))).toBeGreaterThan(1);
    expect(Number(decl(rule(CANVAS_CSS, ".gc_tp_resize"), "z-index"))).toBeGreaterThan(1);
    expect(decl(rule(CANVAS_CSS, ".gc_tp_grip"), "touch-action")).toBe("none");
    expect(decl(rule(CANVAS_CSS, ".gc_tp_resize"), "touch-action")).toBe("none");
  });

  it("the panel is opaque: the kit's surface, never a see-through mix", () => {
    expect(decl(rule(CANVAS_CSS, ".gc_topics"), "background")).toBe("var(--bg-panel)");
    expect(decl(rule(CSS, ":root"), "--bg-panel")).toBe("var(--bg-secondary, #10161e)");
  });

  it("a phone canvas: one column, the legend first, the panel at its foot; the legend steps aside under the sheet", () => {
    const column = rule(narrow, ".gc_overlay_stack");
    expect(decl(column, "position")).toBe("absolute");
    expect(decl(column, "display")).toBe("flex");
    expect(decl(column, "flex-direction")).toBe("column");
    expect(decl(column, "top")).toBe("var(--gc-legend-top)");
    expect(decl(column, "pointer-events")).toBe("none");
    expect(decl(rule(narrow, '.gc_overlay_stack[data-legend="aside"] > .gc_recall_legend'), "display")).toBe("none");
    const panel = rule(narrow, ".gc_topics");
    expect(decl(panel, "position")).toBe("relative");
    expect(decl(panel, "margin-top")).toBe("auto");
    expect(decl(panel, "pointer-events")).toBe("auto");
    expect(decl(panel, "flex")).toBe("none");
    const legend = rule(narrow, ".gc_recall_legend");
    expect(decl(legend, "position")).toBe("relative");
    expect(decl(legend, "transform")).toBe("none");
    expect(decl(legend, "flex")).toBe("none");
    // No absolute placement of either box is left in the phone block (they would leave the column).
    expect(narrow).not.toMatch(/\.gc_topics(?:\.gc_tp_open)?\s*\{[^}]*[;{\s](?:top|bottom|left|right):(?!\s*auto;)/);
    expect(narrow).not.toMatch(/\.gc_recall_legend\s*\{[^}]*\bmax-height:/);
  });

  it("the sheet: under the lens row with room for its head and two rows, else lifted over it to 8 px — never a sliver between", () => {
    const sheet = rule(narrow, '.gc_overlay_stack[data-topics="sheet"]');
    const lensZ = Number(decl(rule(CSS, ".entity_graph_overlay"), "z-index"));
    expect(Number(decl(sheet, "z-index"))).toBeGreaterThan(lensZ);
    expect(decl(sheet, "bottom")).toBe("8px");
    for (const tap of [32, 44]) {
      const vars: Record<string, string | number> = { "--tap-min": tap, "--font-scale": 1 };
      vars["--gc-legend-top"] = evalCss(v("--gc-legend-top"), vars, 0);
      vars["--gc-tp-row"] = evalCss(v("--gc-tp-row"), vars, 0);
      vars["--gc-topics-floor"] = evalCss(v("--gc-topics-floor"), vars, 0);
      vars["--gc-sheet-top"] = evalCss(decl(sheet, "--gc-sheet-top"), vars, 0);
      const floor = vars["--gc-topics-floor"] as number;
      const row = vars["--gc-tp-row"] as number;
      const sheetTop = vars["--gc-sheet-top"] as number;
      // The floor: the head (a tap target) and two rows, each at least a tap target with its padding.
      expect(row).toBeGreaterThanOrEqual(tap + 6);
      expect(floor).toBeGreaterThanOrEqual(tap + 2 * row);
      // Under the lens row (8 px from the top, one tap target tall).
      expect(sheetTop).toBeGreaterThanOrEqual(8 + tap);
      // 159: the live 400 × 700 canvas (castor 2026-11-09); 176: the harness's 400 × 700; 276: 400 × 800; 336: 400 × 860.
      for (const H of [159, 176, 200, 220, 259, 276, 336, 480, 860]) {
        const top = evalCss(decl(sheet, "top"), vars, H);
        expect([8, sheetTop], `H=${H} tap=${tap}`).toContain(top);
        const height = H - top - 8;
        if (H - sheetTop - 8 >= floor) expect(top, `H=${H} tap=${tap}`).toBe(sheetTop);
        if (H - 16 >= floor) expect(height, `H=${H} tap=${tap}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it("a topic in the phone list is its title (two lines at most) and its count, a tap target tall; the summary once focused", () => {
    const row = rule(narrow, '.gc_tp_list .af-disclosure__row[data-depth="0"]:not(:has(.gc_tp_focused))');
    expect(decl(row, "min-height")).toBe("calc(var(--tap-min, 32px) + 6px)");
    expect(decl(row, "align-items")).toBe("center");
    // The floor's row is at least this row.
    expect(v("--gc-tp-row")).toContain("calc(var(--tap-min, 32px) + 6px)");
    expect(decl(rule(narrow, ".gc_tp_topic:not(.gc_tp_focused) .gc_tp_title"), "-webkit-line-clamp")).toBe("2");
    expect(decl(rule(narrow, ".gc_tp_topic:not(.gc_tp_focused) :is(.gc_tp_summary, .gc_tp_verdict)"), "display")).toBe("none");
  });
});

describe("the floating panel (backlog 0017)", () => {
  const canvas = { w: 1040, h: 666 };
  const buttons = { x: 900, y: 10, w: 130, h: 58 };
  const start = { x: 710, y: 76, w: 320, h: 300 };

  it("moves anywhere inside the canvas, below the lens row, its head never under the motion buttons", () => {
    expect(movePanel(start, -400, 100, canvas, buttons)).toEqual({ x: 310, y: 176 });
    // Clamped to the canvas: left, right, the head kept inside at the bottom.
    expect(movePanel(start, -5000, 0, canvas, buttons).x).toBe(0);
    expect(movePanel(start, 5000, 0, canvas, null).x).toBe(canvas.w - start.w);
    expect(movePanel(start, 0, 5000, canvas, null).y).toBe(canvas.h - PANEL_HEAD_H);
    // Never into the lens row's band.
    expect(movePanel(start, -400, -5000, canvas, buttons).y).toBe(PANEL_TOP_MIN);
    // Across the motion buttons' column, it stays below them.
    expect(movePanel(start, 0, -5000, canvas, buttons).y).toBe(buttons.y + buttons.h + PANEL_GAP);
  });

  it("resizes 240-560 px wide and as tall as the canvas lets it; its top-left stays, a docked one keeps its right edge", () => {
    const moved = { x: 300, y: 100, w: 320, h: 300 };
    expect(resizePanel(moved, 100, 50, canvas, false)).toEqual({ x: 300, w: 420, h: 350 });
    expect(resizePanel(moved, 5000, 0, canvas, false).w).toBe(PANEL_W.max);
    expect(resizePanel(moved, -5000, -5000, canvas, false)).toEqual({ x: 300, w: PANEL_W.min, h: PANEL_MIN_H });
    expect(resizePanel(moved, 0, 5000, canvas, false).h).toBe(canvas.h - moved.y - PANEL_GAP);
    // At the canvas's right edge a wider panel grows to the left.
    const edge = { x: 700, y: 100, w: 320, h: 300 };
    const wider = resizePanel(edge, 150, 0, canvas, false);
    expect(wider.w).toBe(470);
    expect(wider.x + wider.w).toBe(canvas.w - PANEL_GAP);
    // Docked (right 10 px): its right edge stays where it is, it grows to the left.
    const docked = resizePanel(start, 120, 40, canvas, true);
    expect(docked).toEqual({ x: 590, w: 440, h: 340 });
    expect(docked.x + docked.w).toBe(start.x + start.w);
    // A canvas narrower than the panel: as wide as it.
    expect(resizePanel({ x: 0, y: 60, w: 300, h: 200 }, 400, 0, { w: 280, h: 400 }, false)).toEqual({ x: 0, w: 272, h: 200 });
  });

  it("is remembered under one versioned key; a value of another shape is none", () => {
    expect(PANEL_STORAGE_KEY).toBe("abstractentity_topics_panel_v1");
    const f = { at: { x: 310, y: 176 }, w: 420, h: 350 };
    expect(parsePanelFloat(serializePanelFloat(f))).toEqual(f);
    expect(parsePanelFloat(serializePanelFloat(PANEL_DOCKED))).toEqual(PANEL_DOCKED);
    expect(parsePanelFloat(null)).toBeNull();
    expect(parsePanelFloat("{not json")).toBeNull();
    expect(parsePanelFloat(JSON.stringify({ x: 1, y: 2 }))).toBeNull();
    expect(parsePanelFloat(JSON.stringify({ at: { x: "1", y: 2 }, w: null, h: null }))).toBeNull();
    // A width stored out of range comes back inside it.
    expect(parsePanelFloat(JSON.stringify({ at: null, w: 9000, h: null }))?.w).toBe(PANEL_W.max);
  });

  it("docked, it sits top-right under the motion buttons and the Context legend leaves it its width; moved, wherever it was put, clamped", () => {
    const docked = panelVars(PANEL_DOCKED, 76);
    expect(docked).toEqual({
      "--gc-tp-top": "76px",
      "--gc-tp-left": "auto",
      "--gc-tp-right": "10px",
      "--gc-tp-w": "min(320px, calc(100% - 32px))",
      "--gc-tp-h": "auto",
      "--gc-tp-reserve": "calc(min(320px, calc(100% - 32px)) + 20px)",
    });
    const moved = panelVars({ at: { x: 310, y: 176 }, w: 420, h: 350 }, 76);
    expect(moved["--gc-tp-left"]).toBe("max(0px, min(310px, calc(100% - 420px)))");
    expect(moved["--gc-tp-top"]).toBe(`max(${PANEL_TOP_MIN}px, min(176px, calc(100% - ${PANEL_HEAD_H}px)))`);
    expect(moved["--gc-tp-right"]).toBe("auto");
    expect(moved["--gc-tp-h"]).toBe("350px");
    expect(moved["--gc-tp-reserve"]).toBe("0px");
    // The clamps, evaluated: a canvas that shrank to 600 x 300 keeps it inside.
    expect(evalCss(moved["--gc-tp-left"].replace("100%", "600px"), {}, 0)).toBe(180);
    expect(evalCss(moved["--gc-tp-top"], {}, 150)).toBe(150 - PANEL_HEAD_H);
    expect(evalCss(moved["--gc-tp-top"], {}, 80)).toBe(PANEL_TOP_MIN);
    expect(evalCss(moved["--gc-tp-top"], {}, 666)).toBe(176);
  });

  it("the canvas measures its docked top under the motion buttons, moves it by its grip, puts it back with one control (never a double-click on the fold head)", () => {
    expect(CANVAS).toContain("const measure = () => setDockTop(Math.round(el.offsetTop + el.offsetHeight + PANEL_GAP));");
    expect(CANVAS).toContain('<div ref={motionRef} className="gc_motion_controls">');
    // Review F1: a double-click on the head (the panel's fold button) folded and unfolded it.
    const box = CANVAS.slice(CANVAS.indexOf('className="gc_topics_float"'), CANVAS.indexOf("{/* Motion controls:"));
    expect(box).not.toContain("onDoubleClick");
    expect(box).toContain('<div className="gc_tp_grip" aria-hidden="true" title="Drag to move the panel" onPointerDown={(ev) => startPanelDrag(ev, "move")}>');
    expect(box).toMatch(/\{panelFloat\.at !== null \? \([\s\S]*?<button type="button" className="gc_tp_dock" title="Put the panel back at the top right" onClick=\{\(\) => setPanelFloat\(\{ \.\.\.panelFloatRef\.current, at: null \}\)\}>\s*put back\s*<\/button>\s*\) : null\}/);
    // Over the panel, left of the grip; the moved head leaves it room.
    expect(decl(rule(CANVAS_CSS, ".gc_tp_dock"), "right")).toBe("var(--tap-min, 32px)");
    expect(Number(decl(rule(CANVAS_CSS, ".gc_tp_dock"), "z-index"))).toBeGreaterThan(1);
    expect(decl(rule(CANVAS_CSS, '.gc_topics_float[data-docked="false"] .gc_tp_head'), "padding-right")).toBe("calc(var(--tap-min, 32px) + 72px)");
    // While it moves: the stack's custom properties, no state; let go: kept and remembered.
    expect(CANVAS).toContain("for (const [k, v] of Object.entries(panelVars(next, dockTopRef.current))) stackEl.style.setProperty(k, v);");
    expect(CANVAS).toContain("if (next !== from) setPanelFloat(next);");
    expect(CANVAS).toContain("localStorage.setItem(PANEL_STORAGE_KEY, serializePanelFloat(f));");
    expect(CANVAS).toContain("handle.setPointerCapture(pointer);");
  });
});

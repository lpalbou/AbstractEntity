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
  CONTEXT_BAND_GAP,
  CONTEXT_BAND_MIN,
  CONTEXT_BOX_MAX,
  contextBand,
  legendReserve,
  moveFloat,
  movePanel,
  overlayStack,
  PANEL_DOCKED,
  PANEL_GAP,
  PANEL_HEAD_H,
  PANEL_MIN_H,
  PANEL_DRAG_SLOP,
  PANEL_STORAGE_KEY,
  PANEL_W,
  panelVars,
  parsePanelFloat,
  resizeFloat,
  resizePanel,
  serializePanelFloat,
  topReserve,
  type PanelDock,
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
  it("the legend renders in the stack; the panel's box sits in the stack on a phone, over the page (portaled) on a wide canvas", () => {
    const at = CANVAS.indexOf('className="gc_overlay_stack"\n        data-legend={stack.legend}\n        data-topics={stack.topics}\n        style={\n          panelView || contextAt');
    expect(at).toBeGreaterThan(0);
    const legend = CANVAS.indexOf("<ContextLegend recall={recall} open={legendOpen} onToggle={setLegendOpen} />", at);
    const inline = CANVAS.indexOf("{pagePanel ? null : panelBox}", at);
    expect(legend).toBeGreaterThan(at);
    expect(inline).toBeGreaterThan(legend);
    expect(CANVAS).toContain("{pagePanel && panelBox && panelHost ? createPortal(panelBox, panelHost) : null}");
    // The box: the panel, then (over the page only) its grip, its "put back" once moved, its corner while open on its list.
    const box = CANVAS.slice(CANVAS.indexOf("  const panelBox = panelView ? ("), CANVAS.indexOf("  return (\n    <>\n      <canvas"));
    expect(box.indexOf("<TopicsPanel")).toBeGreaterThan(box.indexOf('className="gc_topics_float"'));
    expect(box).toContain('{pagePanel ? (\n        <div className="gc_tp_grip" aria-hidden="true" title="Drag to move the panel (or drag its title bar)">');
    expect(box).toContain("{pagePanel && panelFloat.at !== null ? (");
    expect(box).toContain('{pagePanel && stack.topics === "sheet" ? <div className="gc_tp_resize" aria-hidden="true" title="Drag to resize the panel" /> : null}');
    expect(box).toContain("onPointerDown={startPanelDrag}");
    expect(CANVAS.match(/<ContextLegend /g)?.length).toBe(1);
    expect(CANVAS.match(/<TopicsPanel\b/g)?.length).toBe(1);
  });

  it("over the page only on a wide, shown canvas (the stack draws no box there); portaled into the app's root, never silently elsewhere", () => {
    expect(CANVAS).toContain('setPagePanel(shown && getComputedStyle(stackEl).display === "contents");');
    expect(CANVAS).toContain("const shown = wr.width > 0 && wr.height > 0;");
    expect(CANVAS).toContain('const host = wrap.closest("#root");');
    expect(CANVAS).toContain('console.error("#SEAM the graph is not inside #root: the Topics panel cannot float over the page");');
    // Measured before paint and again when the canvas or the motion buttons resize, or the window does.
    const eff = CANVAS.slice(CANVAS.indexOf("  useLayoutEffect(() => {\n    const wrap = canvasRef.current?.parentElement;"), CANVAS.indexOf("  // The page panel lives outside the canvas's host"));
    expect(eff).toContain("ro?.observe(wrap);");
    expect(eff).toContain("ro?.observe(motion);");
    expect(eff).toContain('window.addEventListener("resize", measure);');
    expect(eff).toContain("top: Math.round(mr.bottom - hr.top + PANEL_GAP)");
  });

  it("the mapping reads the panel open on a list (a note is a line) and the legend's fold", () => {
    expect(CANVAS).toContain("const panelView = showTopics && topicsView ? topicsPanelView ?? topicsView : null;");
    expect(CANVAS).toContain('!panelView ? "none" : topicsOpen && topicsNote(panelView) === null ? "open" : "line",');
    expect(CANVAS).toContain('!(recallShown && recall) ? "none" : legendOpen ? "open" : "folded",');
    expect(CANVAS).toContain("const panelBox = panelView ? (");
    expect(CANVAS).toContain("{recallShown && recall ? (");
  });
});

describe("the stylesheet", () => {
  const narrow = block(CANVAS_CSS, "@container entity-canvas (max-width: 859.98px)");
  const wrap = rules(CSS, ".entity_canvas_wrap");
  const v = (name: string) => decl(wrap, name);

  it("a wide canvas draws no stack box: the legend keeps its place, the panel floats over the page in its own box", () => {
    expect(decl(rule(CANVAS_CSS, ".gc_overlay_stack"), "display")).toBe("contents");
    // The panel's box: fixed over the page (overlay_stack panelVars), above the drawer, under the cards and the kit's layers.
    const box = rule(CANVAS_CSS, ".gc_topics_float");
    expect(decl(box, "position")).toBe("fixed");
    expect(decl(box, "top")).toBe("var(--gc-tp-top, 48px)");
    expect(decl(box, "left")).toBe("var(--gc-tp-left, auto)");
    expect(decl(box, "right")).toBe("var(--gc-tp-right, 10px)");
    expect(decl(box, "width")).toBe("var(--gc-tp-w, 320px)");
    expect(decl(box, "max-height")).toBe("var(--gc-tp-maxh, calc(100% - 56px))");
    expect(Number(decl(box, "z-index"))).toBeLessThan(60);
    const base = rule(CANVAS_CSS, ".gc_topics");
    expect(decl(base, "position")).toBe("relative");
    expect(decl(base, "width")).toBe("100%");
    expect(decl(base, "min-height")).toBe("0");
    // Resized, open on its list: its height.
    expect(decl(rule(CANVAS_CSS, '.gc_topics_float[data-page="true"][data-sized="true"][data-list="true"] > .gc_topics'), "height")).toBe("var(--gc-tp-h)");
    // Its head bar moves it: a grab cursor, the browser never takes the press for a scroll, no text selected.
    const head = rule(CANVAS_CSS, '.gc_topics_float[data-page="true"] .gc_tp_head');
    expect(decl(head, "cursor")).toBe("grab");
    expect(decl(head, "touch-action")).toBe("none");
    expect(decl(head, "user-select")).toBe("none");
    // The Context box: at the top controls' level in the measured band, else under the top row in the width the docked panel leaves.
    const legend = rule(CANVAS_CSS, ".gc_recall_legend");
    expect(decl(legend, "top")).toBe("var(--gc-rl-top, 48px)");
    expect(decl(legend, "left")).toBe("var(--gc-rl-centre, calc((100% - var(--gc-tp-top-reserve, 0px)) / 2))");
    expect(decl(legend, "max-width")).toBe("var(--gc-rl-max, min(760px, calc(100% - var(--gc-tp-top-reserve, 0px) - 32px)))");
    expect(decl(legend, "z-index")).toBe("var(--gc-rl-z, auto)");
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

  it("the sheet's panel takes the whole column; its head keeps its height, its body alone scrolls (an opened list shows what the canvas allows)", () => {
    const sheetPanel = rule(narrow, '.gc_overlay_stack[data-topics="sheet"] .gc_topics.gc_tp_open');
    expect(decl(sheetPanel, "flex")).toBe("1 1 auto");
    expect(decl(rule(narrow, '.gc_overlay_stack[data-topics="sheet"] .gc_tp_head'), "flex")).toBe("none");
    // Folded (a line) it keeps its own height, never grown.
    expect(decl(rule(narrow, ".gc_topics"), "flex")).toBe("none");
    // The panel is a column; the body is the part that takes the rest and scrolls.
    expect(decl(rule(CANVAS_CSS, ".gc_topics"), "flex-direction")).toBe("column");
    const body = rule(CANVAS_CSS, ".gc_tp_body");
    expect(decl(body, "flex")).toBe("1");
    expect(decl(body, "min-height")).toBe("0");
    expect(decl(body, "overflow-y")).toBe("auto");
    // Nothing else in the phone block scrolls the panel or caps its body.
    expect(narrow).not.toMatch(/\.gc_tp_body[^{]*\{[^}]*max-height/);
    expect(narrow).not.toMatch(/\.gc_topics[^{]*\{[^}]*overflow-y:\s*auto/);
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

describe("the floating panel (backlog 0017, 0027)", () => {
  const view = { w: 1440, h: 900 };
  // Docked at the canvas's top right (its right edge 10 px inside the canvas's, 1050).
  const start = { x: 730, y: 168, w: 320, h: 392 };
  const dock: PanelDock = { top: 168, right: 1050, canvasW: 1060, canvasBottom: 768, canvasH: 675, viewW: 1440 };

  it("moves anywhere in the window (over the drawer and the timeline too), its head kept inside", () => {
    expect(movePanel(start, -600, 200, view)).toEqual({ x: 130, y: 368 });
    // Over the side drawer: the window, not the canvas, is the limit.
    expect(movePanel(start, 500, 0, view)).toEqual({ x: 1120, y: 168 });
    expect(movePanel(start, 5000, 0, view).x).toBe(view.w - start.w);
    expect(movePanel(start, -5000, 0, view).x).toBe(0);
    expect(movePanel(start, 0, -5000, view).y).toBe(0);
    expect(movePanel(start, 0, 5000, view).y).toBe(view.h - PANEL_HEAD_H);
    expect(PANEL_DRAG_SLOP).toBeGreaterThan(0);
    expect(PANEL_DRAG_SLOP).toBeLessThanOrEqual(6);
  });

  // THE CORNER'S RULE: the edge under the pointer is the edge that moves, and no other edge moves.
  it("review F2: moved, the corner moves the right and bottom edges only; the left edge never moves, the width stops at the window's edge", () => {
    const moved = { x: 300, y: 100, w: 320, h: 300 };
    expect(resizePanel(moved, 100, 50, view, false, 768)).toEqual({ w: 420, h: 350 });
    expect(resizePanel(moved, 5000, 0, view, false, 768).w).toBe(PANEL_W.max);
    expect(resizePanel(moved, -5000, -5000, view, false, 768)).toEqual({ w: PANEL_W.min, h: PANEL_MIN_H });
    expect(resizePanel(moved, 0, 5000, view, false, 768).h).toBe(view.h - PANEL_GAP - moved.y);
    // The review's case: the panel's right edge at the window's (the drawer collapsed), +80 px on the corner.
    const atEdge = { at: { x: 1070, y: 168 }, w: 320, h: 392 };
    const box = { x: 1070, y: 168, w: 320, h: 392 };
    const after = resizeFloat(atEdge, box, 80, 0, view, 768);
    expect(after.at).toEqual({ x: 1070, y: 168 }); // the left edge did not move (it moved -38 px before)
    expect(1070 + (after.w ?? 0)).toBeLessThanOrEqual(view.w - PANEL_GAP); // the right edge stopped at the window's
    expect(after.w).toBe(view.w - PANEL_GAP - 1070);
    // Moved flush to the window's edge (a move may reach it): +80 px leaves it as it is, never narrower.
    const flush = resizeFloat({ at: { x: 1120, y: 168 }, w: 320, h: 512 }, { x: 1120, y: 168, w: 320, h: 512 }, 80, 0, view, 768);
    expect(flush).toEqual({ at: { x: 1120, y: 168 }, w: 320, h: 512 });
    // Room on the right: the right edge follows the pointer, nothing else moves.
    const roomy = resizeFloat({ at: { x: 300, y: 100 }, w: 320, h: 300 }, { x: 300, y: 100, w: 320, h: 300 }, 80, 40, view, 768);
    expect(roomy).toEqual({ at: { x: 300, y: 100 }, w: 400, h: 340 });
  });

  it("review F1: docked, the corner moves the bottom edge only and the panel stays docked (its reserves kept)", () => {
    const docked = resizeFloat(PANEL_DOCKED, start, 80, 120, view, dock.canvasBottom);
    expect(docked.at).toBeNull();
    expect(docked.w).toBeNull(); // its width, the dock's: the right edge is the dock and cannot move
    expect(docked.h).toBe(start.h + 120);
    // Pulled to the canvas's foot, never past it.
    expect(resizeFloat(PANEL_DOCKED, start, 0, 5000, view, dock.canvasBottom).h).toBe(dock.canvasBottom - PANEL_GAP - start.y);
    // So both legends keep leaving it its width, and no "put back" (it never moved).
    expect(legendReserve(docked, true)).not.toBe("0px");
    expect(topReserve(docked)).not.toBe("0px");
    // A docked panel resized earlier keeps its width.
    expect(resizeFloat({ at: null, w: 460, h: 300 }, { ...start, w: 460, h: 300 }, 80, 0, view, dock.canvasBottom)).toEqual({ at: null, w: 460, h: 300 });
    expect(decl(rule(CANVAS_CSS, '.gc_topics_float[data-docked="true"] .gc_tp_resize'), "cursor")).toBe("ns-resize");
  });

  it("review F3: a move never changes the height (open on its list it keeps the height it had at the press)", () => {
    const nudged = moveFloat(PANEL_DOCKED, start, -10, 0, view, true);
    expect(nudged.at).toEqual({ x: start.x - 10, y: start.y });
    expect(nudged.h).toBe(start.h); // 392 docked; no window-tall jump on release
    expect(panelVars(nudged, dock)["--gc-tp-h"]).toBe(`${start.h}px`);
    // A height of its own is kept; folded (its head) it gets none.
    expect(moveFloat({ at: { x: 1, y: 1 }, w: 400, h: 500 }, start, 5, 5, view, true).h).toBe(500);
    expect(moveFloat(PANEL_DOCKED, { ...start, h: 34 }, 20, 20, view, false).h).toBeNull();
    expect(moveFloat(PANEL_DOCKED, start, 20, 20, view, true).w).toBeNull();
  });

  it("is remembered under one versioned key (v2: window px; a v1 value, canvas px, is never read)", () => {
    expect(PANEL_STORAGE_KEY).toBe("abstractentity_topics_panel_v2");
    expect(CANVAS).not.toContain("abstractentity_topics_panel_v1");
    const f = { at: { x: 310, y: 176 }, w: 420, h: 350 };
    expect(parsePanelFloat(serializePanelFloat(f))).toEqual(f);
    expect(parsePanelFloat(serializePanelFloat(PANEL_DOCKED))).toEqual(PANEL_DOCKED);
    expect(parsePanelFloat(null)).toBeNull();
    expect(parsePanelFloat("{not json")).toBeNull();
    expect(parsePanelFloat(JSON.stringify({ x: 1, y: 2 }))).toBeNull();
    expect(parsePanelFloat(JSON.stringify({ at: { x: "1", y: 2 }, w: null, h: null }))).toBeNull();
    expect(parsePanelFloat(JSON.stringify({ at: null, w: 9000, h: null }))?.w).toBe(PANEL_W.max);
  });

  it("docked: at the canvas's top right under the motion buttons, 58 % of the canvas at most; moved: where it was put, clamped to the window", () => {
    expect(panelVars(PANEL_DOCKED, dock)).toEqual({
      "--gc-tp-top": "168px",
      "--gc-tp-left": "auto",
      "--gc-tp-right": "390px",
      "--gc-tp-w": "320px",
      "--gc-tp-h": "auto",
      "--gc-tp-maxh": `${Math.round(0.58 * 675)}px`,
    });
    // A narrow canvas: the default width leaves it 32 px (never under PANEL_W.min).
    expect(panelVars(PANEL_DOCKED, { ...dock, canvasW: 300 })["--gc-tp-w"]).toBe("268px");
    expect(panelVars(PANEL_DOCKED, { ...dock, canvasW: 200 })["--gc-tp-w"]).toBe(`${PANEL_W.min}px`);
    // Put back after a resize: its size kept, as tall as the canvas lets it.
    const back = panelVars({ at: null, w: 460, h: 600 }, dock);
    expect(back["--gc-tp-w"]).toBe("460px");
    expect(back["--gc-tp-maxh"]).toBe(`${768 - 168 - PANEL_GAP}px`);
    const moved = panelVars({ at: { x: 310, y: 176 }, w: 420, h: 350 }, dock);
    expect(moved["--gc-tp-left"]).toBe("max(0px, min(310px, calc(100% - 420px)))");
    expect(moved["--gc-tp-top"]).toBe(`max(0px, min(176px, calc(100% - ${PANEL_HEAD_H}px)))`);
    expect(moved["--gc-tp-right"]).toBe("auto");
    expect(moved["--gc-tp-h"]).toBe("350px");
    // The clamps, evaluated: a window that shrank to 600 x 150 keeps its head inside.
    expect(evalCss(moved["--gc-tp-left"].replace("100%", "600px"), {}, 0)).toBe(180);
    expect(evalCss(moved["--gc-tp-top"], {}, 150)).toBe(150 - PANEL_HEAD_H);
    expect(evalCss(moved["--gc-tp-top"], {}, 900)).toBe(176);
    // The Context legend leaves the docked panel its width, none once it is moved.
    expect(topReserve(PANEL_DOCKED)).toBe("calc(min(320px, calc(100% - 32px)) + 20px)");
    expect(topReserve({ at: null, w: 460, h: null })).toBe("calc(460px + 20px)");
    expect(topReserve({ at: { x: 1, y: 1 }, w: 460, h: null })).toBe("0px");
  });

  it("the kinds legend at the canvas's foot ends before a docked panel open on its list, at any width it was resized to (review F2)", () => {
    expect(legendReserve(PANEL_DOCKED, true)).toBe("calc(min(320px, calc(100% - 32px)) + 20px)");
    expect(legendReserve({ at: null, w: 560, h: 592 }, true)).toBe("calc(560px + 20px)");
    expect(legendReserve({ at: null, w: 560, h: 592 }, false)).toBe("0px");
    expect(legendReserve({ at: { x: 200, y: 300 }, w: 560, h: 592 }, true)).toBe("0px");
    expect(legendReserve(null, true)).toBe("0px");
    // entity.css: the rule reads it on the wrap (no :has(.gc_topics): the panel floats outside the wrap).
    const wide = block(CSS, "@container entity-canvas (min-width: 860px)");
    expect(wide).not.toContain(":has(.gc_topics)");
    const maxW = decl(rule(wide, ".entity_canvas_wrap > .entity_legend"), "max-width");
    expect(maxW).toBe("min(calc(100% - 200px), calc(100% - var(--gc-tp-reserve, 0px) - 20px))");
    const W = 1040;
    const at = (reserve: number) => evalCss(maxW.replace(/100%/g, `${W}px`), { "--gc-tp-reserve": reserve }, 0);
    expect(12 + at(560 + 20)).toBeLessThan(W - 10 - 560);
    expect(12 + at(evalCss("min(320px, calc(1040px - 32px)) + 20px", {}, 0))).toBeLessThan(W - 10 - 320);
    expect(at(0)).toBe(W - 200);
    expect(CANVAS).toContain('const footReserve = legendReserve(panelView ? panelFloat : null, stack.topics === "sheet");');
    expect(CANVAS).toContain('wrap.style.setProperty("--gc-tp-reserve", footReserve);');
  });

  it("a press: the grip moves at once, the head bar once the pointer travels (else its click folds), the corner resizes, put back stays a click", () => {
    const drag = CANVAS.slice(CANVAS.indexOf("  const startPanelDrag = (ev: React.PointerEvent<HTMLElement>) => {"), CANVAS.indexOf("  const focusTopicRef = useRef(focusTopic);"));
    expect(drag).toContain('const mode = !target || target.closest(".gc_tp_dock") ? null : target.closest(".gc_tp_resize") ? "size" : target.closest(".gc_tp_grip") ? "move" : target.closest(".gc_tp_head") ? "head" : null;');
    expect(drag).toContain("if (Math.hypot(last.x - x0, last.y - y0) < PANEL_DRAG_SLOP) return;");
    expect(drag).toContain("box.setPointerCapture(pointer);");
    // One paint per frame; a move is a transform (no layout), never a re-render per move.
    expect(drag).toContain("if (!frame) frame = requestAnimationFrame(paint);");
    expect(drag).toContain("box.style.transform = `translate(${at.x - start.x}px, ${at.y - start.y}px)`;");
    expect(drag).not.toMatch(/setPanelFloat\(next\);[\s\S]*const onMove/);
    expect(drag.indexOf("if (next !== from) setPanelFloat(next);")).toBeGreaterThan(drag.indexOf("const onEnd"));
    // A resize follows the corner's rule (resizeFloat: docked stays docked), a move keeps the height (moveFloat).
    expect(drag).toContain("next = resizeFloat(from, start, dx, dy, view, dock.canvasBottom);");
    expect(drag).toContain("next = moveFloat(from, start, dx, dy, view, openList);");
    expect(drag).toContain('const openList = box.dataset.list === "true";');
    expect(drag).not.toContain('box.dataset.docked = "false";\n      } else {');
    // The click that ends a head move is not a fold.
    expect(CANVAS).toMatch(/onClickCapture=\{\(ev\) => \{\n\s+\/\/ The click that ends a move from the head bar is not a fold\.\n\s+if \(!panelDraggedRef\.current\) return;\n\s+panelDraggedRef\.current = false;\n\s+ev\.stopPropagation\(\);\n\s+ev\.preventDefault\(\);/);
    expect(CANVAS).toContain('<button type="button" className="gc_tp_dock" title="Put the panel back at the top right" onClick={() => setPanelFloat({ ...panelFloatRef.current, at: null })}>');
    expect(CANVAS).toContain("localStorage.setItem(PANEL_STORAGE_KEY, serializePanelFloat(f));");
    // The titles' overlay rects see the page panel (it is outside the canvas's host) and its moves.
    expect(CANVAS).toContain('const overlays = new OverlayRects(canvas, () => floatRef.current?.querySelector(".gc_topics") ?? null);');
    expect(CANVAS).toContain("overlaysRef.current?.invalidate();");
    // Framing reads the panel's live box wherever it is.
    expect(CANVAS.match(/const panelEl = floatRef\.current\?\.querySelector\("\.gc_topics"\);/g)?.length).toBe(2);
    expect(decl(rule(CANVAS_CSS, ".gc_tp_dock"), "right")).toBe("var(--tap-min, 32px)");
    expect(decl(rule(CANVAS_CSS, '.gc_topics_float[data-docked="false"] .gc_tp_head'), "padding-right")).toBe("calc(var(--tap-min, 32px) + 72px)");
  });
});

describe("the Context box at the top controls' level (operator 2026-11-11)", () => {
  it("centred in the band between the top row's last button and the motion buttons (or the docked panel), at most 760 px", () => {
    // castor at 1440 x 900: the top row ends at 255 - 93 (canvas px 162); the docked panel starts at 730 - 0.
    expect(contextBand(162, 637)).toEqual({ centre: Math.round((162 + 12 + 637 - 12) / 2), max: 637 - 12 - 162 - 12 });
    expect(contextBand(100, 2000)).toEqual({ centre: 1050, max: CONTEXT_BOX_MAX });
    expect(CONTEXT_BAND_GAP).toBe(12);
  });

  it("a band too narrow: none (it keeps its place under the top row)", () => {
    expect(contextBand(500, 500 + 2 * CONTEXT_BAND_GAP + CONTEXT_BAND_MIN - 1)).toBeNull();
    expect(contextBand(500, 500 + 2 * CONTEXT_BAND_GAP + CONTEXT_BAND_MIN)).not.toBeNull();
    expect(contextBand(600, 300)).toBeNull();
  });

  it("the canvas measures it when the canvas, the motion buttons or the top row's buttons change, never per frame, and only on a wide canvas", () => {
    const eff = CANVAS.slice(CANVAS.indexOf("  const [contextAt, setContextAt]"), CANVAS.indexOf("  // The page panel lives outside the canvas's host"));
    expect(eff).toContain('if (getComputedStyle(stackEl).display !== "contents") {');
    expect(eff).toContain("const next = contextBand(topRowRight, rightLimit);");
    expect(eff).toContain("ro?.observe(canvas);");
    expect(eff).toContain("ro?.observe(motion);");
    expect(eff).toContain("mo?.observe(overlay, { childList: true, subtree: true });");
    expect(eff).toContain('console.error("#SEAM no .entity_graph_overlay over the graph: the Context box keeps its place under the top row");');
    expect(eff).toContain("}, [panelFloat, panelDock, pagePanel]);");
    // Its vars on the stack (the box's own --gc-rl-*), at the top controls' 10 px, above the top row's stretched box.
    expect(CANVAS).toContain('...(contextAt ? { "--gc-rl-top": "10px", "--gc-rl-centre": `${contextAt.centre}px`, "--gc-rl-max": `${contextAt.max}px`, "--gc-rl-z": "6" } : {}),');
    expect(decl(rule(CSS, ".entity_graph_overlay"), "top")).toBe("10px");
  });
});

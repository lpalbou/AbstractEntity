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

import { overlayStack, type StackLegend, type StackTopics } from "./overlay_stack";

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
    const at = CANVAS.indexOf('<div className="gc_overlay_stack" data-legend={stack.legend} data-topics={stack.topics}>');
    expect(at).toBeGreaterThan(0);
    const legend = CANVAS.indexOf("<ContextLegend recall={recall} open={legendOpen} onToggle={setLegendOpen} />", at);
    const panel = CANVAS.indexOf("<TopicsPanel", at);
    const close = CANVAS.indexOf("</div>", panel);
    expect(legend).toBeGreaterThan(at);
    expect(panel).toBeGreaterThan(legend);
    // Nothing else opens a div between the panel and the stack's end.
    expect(CANVAS.slice(panel, close)).not.toContain("<div");
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

  it("a wide canvas draws no stack box: the legend and the panel keep their own places", () => {
    expect(decl(rule(CANVAS_CSS, ".gc_overlay_stack"), "display")).toBe("contents");
    // The panel's wide geometry (bottom-right) is its base rule's.
    const base = rule(CANVAS_CSS, ".gc_topics");
    expect(decl(base, "position")).toBe("absolute");
    expect(decl(base, "right")).toBe("10px");
    expect(decl(base, "bottom")).toBe("12px");
    expect(decl(base, "width")).toBe("min(320px, calc(100% - 32px))");
    expect(decl(base, "max-height")).toBe("58%");
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

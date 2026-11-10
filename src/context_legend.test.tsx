/**
 * The Context legend (operator live test 2026-11-09: "when i click on
 * context, it shows [rings: …] but i am unsure how to interpret it?"): the
 * ring colours in his words, the lit lines (the grey-to-green fill is the graph's legend's only). Rendered
 * with react-dom/server from a real fold's recall; the wiring into the
 * canvas and the graph's key is pinned on the source.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContextLegend } from "./context_legend";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { recallEmphasis, TRAVELLED_DIRECTION } from "./recall_emphasis";

function env(seq: number, family: ReplayEnvelope["family"], payload: Record<string, unknown>, extra: Partial<ReplayEnvelope> = {}): ReplayEnvelope {
  return { stream: "abstractmemory.replay", stream_version: 1, seq, family, observed_at: "2026-11-09T10:00:00+00:00", scope: "life", owner_id: "entity:test", trace_id: null, turn_id: null, run_id: null, payload, ...extra } as ReplayEnvelope;
}
const binding = (seq: number, id: string, kind: string): ReplayEnvelope =>
  env(seq, "binding", { record_id: id, scope: "life", owner_id: "entity:test", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq }, { display: { record_id: id, kind, title: id } as ReplayEnvelope["display"] });

function recall() {
  const fold = foldEnvelopes([
    binding(1, "ex:value-a", "value"),
    binding(2, "ex:memory-b", "memory"),
    binding(3, "ex:memory-c", "memory"),
    binding(4, "ex:memory-d", "memory"),
    env(10, "trace", { trace_id: "tr1", trace_kind: "reconstruct", need: { cue_text: "who are you?" }, selected: ["ex:value-a", "ex:memory-b", "ex:memory-c", "ex:memory-d"], admissions: { "ex:value-a": "self", "ex:memory-b": "stm", "ex:memory-c": "stimulus", "ex:memory-d": "both" }, candidates: [], dropped: [], seq: 10 }, { trace_id: "tr1" }),
  ]);
  return recallEmphasis(fold, 10)!;
}

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

describe("ContextLegend", () => {
  it("counts the rings in the summary and, open, says what each colour means in his words", () => {
    const html = renderToStaticMarkup(<ContextLegend recall={recall()} open onToggle={() => {}} />);
    expect(html).toMatch(/^<div class="gc_recall_legend gc_rl_open">/);
    const summary = text(html.match(/<button[\s\S]*?<\/button>/)![0]);
    expect(summary).toBe("4 memories recalled for this turn:1 present by right·1 continuity·2 matched");
    const key = text(html.slice(html.indexOf('class="gc_rl_key"')));
    expect(key).toContain("present by right:memories he always keeps in mind");
    expect(key).toContain("continuity:memories that followed from the last ones");
    expect(key).toContain("matched:memories found for this message");
    expect(key).toContain("lit lines: the path he travelled to reach each one, in the colour of its ring");
    // The fill (dark grey -> green) is said by the graph's legend at the bottom only (operator 2026-11-10:
    // "remove the line about fill dark grey … because it's in the legend at the bottom").
    expect(key).not.toMatch(/fill|rarely used|most used|ranked within his own life/);
    expect(html).not.toContain("gc_rl_scale");
    // Each ring row carries its class colour.
    for (const cls of ["self", "stm", "matched"]) expect(html).toContain(`<i class="gc_rl_ring gc_rl_${cls}" aria-hidden="true"></i><span class="gc_rl_name">`);
  });

  it("the lit lines' row says their direction in words (operator 2026-11-09)", () => {
    const html = renderToStaticMarkup(<ContextLegend recall={recall()} open onToggle={() => {}} />);
    expect(TRAVELLED_DIRECTION).toBe("from what he held in mind → to what he recalled");
    expect(html).toContain(`<span class="gc_rl_more">${TRAVELLED_DIRECTION}</span>`);
  });

  it("every row reads without a tooltip: the lit lines carry their meaning as a visible line (review N4)", () => {
    const html = renderToStaticMarkup(<ContextLegend recall={recall()} open onToggle={() => {}} />);
    const rows = html.match(/<div class="gc_rl_row"[^>]*>[\s\S]*?<\/div>/g)!;
    expect(rows).toHaveLength(4);
    for (const row of rows.slice(3)) expect(row).toMatch(/<span class="gc_rl_more">[^<]+<\/span>/);
  });

  it("the fold control is a real disclosure: a button with aria-expanded controlling the key, never a live region (review S3)", () => {
    for (const open of [true, false]) {
      const html = renderToStaticMarkup(<ContextLegend recall={recall()} open={open} onToggle={() => {}} />);
      const button = html.match(/<button[^>]*>/)![0];
      expect(button).toContain('type="button"');
      expect(button).toContain(`aria-expanded="${open}"`);
      const controls = /aria-controls="([^"]+)"/.exec(button)![1];
      const key = new RegExp(`<div class="gc_rl_key" id="${controls.replace(/[:]/g, "\\$&")}"( hidden="")?>`).exec(html);
      expect(key, html).not.toBeNull();
      expect(Boolean(key![1])).toBe(!open);
      // The control itself is never a status (no live re-announcement at every step).
      expect(button).not.toMatch(/role=|aria-live/);
      expect(html).not.toContain("<summary");
      // The count is said by a quiet live region of its own, empty until the scrub settles.
      expect(html).toContain('<span class="gc_rl_live" role="status" aria-live="polite"></span>');
    }
    const css = fs.readFileSync(path.join(__dirname, "graph_canvas.css"), "utf8");
    expect(css).toMatch(/\.gc_rl_key\[hidden\]\s*\{\s*display:\s*none;/);
  });

  it("a click on the summary asks to flip the fold", () => {
    const src = fs.readFileSync(path.join(__dirname, "context_legend.tsx"), "utf8");
    expect(src).toContain('<button type="button" className="gc_rl_summary" aria-expanded={open} aria-controls={keyId} onClick={() => onToggle(!open)}>');
  });

  it("the count is announced once, after the scrub settles (one timer per change, the last one wins)", async () => {
    const { useSettledText: hook, LEGEND_ANNOUNCE_MS } = await import("./context_legend");
    expect(LEGEND_ANNOUNCE_MS).toBeGreaterThanOrEqual(500);
    expect(hook).toBeTypeOf("function");
    const src = fs.readFileSync(path.join(__dirname, "context_legend.tsx"), "utf8");
    expect(src).toContain("const timer = window.setTimeout(() => setSaid(text), ms);");
    expect(src).toContain("return () => window.clearTimeout(timer);");
    expect(src).toContain("}, [text, ms]);");
    expect(src).toContain("const announced = useSettledText(recallLegendText(recall));");
  });

  it("folded, it keeps the counted summary (the phone default)", () => {
    const html = renderToStaticMarkup(<ContextLegend recall={recall()} open={false} onToggle={() => {}} />);
    expect(html).toMatch(/^<div class="gc_recall_legend">/);
    expect(html).toContain("4 memories recalled for this turn");
  });
});

describe("wiring", () => {
  const canvas = fs.readFileSync(path.join(__dirname, "graph_canvas.tsx"), "utf8");
  const view = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");

  it("the canvas shows the legend where the recall line lived, open on a wide screen, folded on a phone", () => {
    expect(canvas).toContain("<ContextLegend recall={recall} open={legendOpen} onToggle={setLegendOpen} />");
    expect(canvas).toContain("useState(() => !narrowViewport())");
    expect(canvas).toContain('window.matchMedia("(max-width: 599.98px)")');
  });

  it("the canvas paints the usage scale on memories and lines, and lights the travelled paths in their ring colour", () => {
    expect(canvas).toContain("const usage = useMemo(() => usageScale(fold, temporal), [fold, temporal]);");
    expect(canvas).toContain("const place = usage.nodes.get(node.id) ?? 0;");
    expect(canvas).toContain("usageRgb(usageMix(place), CANVAS_THEME.cold, CANVAS_THEME.warm)");
    expect(canvas).toContain("if (place > TOP_DECILE) {");
    expect(canvas).toContain("ctx.fillStyle = rgbaOf(fill, 1);");
    expect(canvas).toContain("const place = usage.edges.get(e.key) ?? 0;");
    expect(canvas).toContain("usageStroke(look.mix, focusLit ? Math.min(1, Math.max(FOCUS_EDGE_FLOOR, look.alpha * FOCUS_LIT_GAIN)) : look.alpha, focusLit)");
    expect(canvas).toContain('const focusLit = driver === "focus" && emphasis !== null && emphasis.has(e.a) && emphasis.has(e.b);');
    expect(canvas).toContain("const travelled = driver === \"recall\" && recall ? recall.travelled : null;");
    expect(canvas).toContain("edgeDimTarget(emphasis, travelled, a, b, pairKey)");
    expect(canvas).toContain("ADMISSION_COLORS[RECALL_RING_ADMISSION[path]]");
    // The old temporal-warmth green is gone from the canvas.
    expect(canvas).not.toMatch(/nodeWarmth|pairWarmth|edgeWarmthShown|nodeGlowShown/);
  });

  it("the graph's key names the one scale (no 'warm together' / 'warm now' left)", () => {
    // The key lives in the graph's legend (graph_canvas_legend.tsx), which the view renders.
    const legend = fs.readFileSync(path.resolve(__dirname, "graph_canvas_legend.tsx"), "utf8");
    expect(legend).toContain("{USAGE_LOW} → {USAGE_HIGH}");
    expect(legend).toContain("title={USAGE_TITLE}");
    expect(view).toContain("<GraphLegend extraKinds={extraKinds} relationTypes={relationTypes} warmthAge={warmthAge} picked={legendPick} onPick={setLegendPick} />");
    for (const src of [view, legend]) expect(src).not.toMatch(/warm together|warm now|warmthLegendTitles/);
  });
});

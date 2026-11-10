/**
 * THE GRAPH'S LEGEND (operator 2026-11-10, Entity backlog 0004: "at most 2
 * lines at the bottom, never more; interactive — click a legend item, show
 * where those nodes/edges are"). What a pick lights (legendIds), the
 * markup (two rows, pressed toggles), the view's wiring and the CSS that
 * keeps it to two lines.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GraphLegend, legendIds, nextPick, pickKey, type LegendPick } from "./graph_canvas_legend";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");
const VIEW = read("entity_view.tsx");
const CSS = read("graph_canvas.css");

function binding(seq: number, id: string, kind: string, title: string, extra: Record<string, unknown> = {}): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "binding",
    observed_at: "2026-11-10T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:castor",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { record_id: id, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    display: { record_id: id, kind, title, graph_id: id, ...extra } as ReplayEnvelope["display"],
  } as ReplayEnvelope;
}

const FOLD = foldEnvelopes([
  binding(1, "ex:value-1", "value", "honesty"),
  binding(2, "ex:episode-2", "episode", "exchange: the bridges", { edges: [{ target_graph_id: "ex:dream-4", relation: "written_amid" }] }),
  binding(3, "ex:diary-3", "diary", "the mirrors held", { diary: true }),
  binding(4, "ex:dream-4", "dream", "a night's reweave"),
  binding(5, "ex:dream-5", "dream", "another night", { edges: [{ target_graph_id: "ex:episode-2", relation: "summarizes" }] }),
  binding(6, "ex:lesson-6", "lesson", "keep the record honest"),
]);
const ids = (p: LegendPick) => [...legendIds(FOLD, p)].sort();

describe("legendIds", () => {
  it("a class lights its memories (identity, memory, diary)", () => {
    expect(ids({ kind: "class", key: "identity" })).toEqual(["ex:value-1"]);
    expect(ids({ kind: "class", key: "memory" })).toEqual(["ex:episode-2"]);
    expect(ids({ kind: "class", key: "diary" })).toEqual(["ex:diary-3"]);
  });

  it("a kind lights the records of that kind (a diary entry is folded as kind diary: never a lesson's)", () => {
    expect(ids({ kind: "kind", key: "dream" })).toEqual(["ex:dream-4", "ex:dream-5"]);
    expect(ids({ kind: "kind", key: "lesson" })).toEqual(["ex:lesson-6"]);
    expect(ids({ kind: "kind", key: "interest" })).toEqual([]);
    // An engine record of that kind is never lit (it is the engine's, not a memory).
    const engine = { ...FOLD, nodes: new Map([...FOLD.nodes, ["ex:lesson-9", { ...FOLD.nodes.get("ex:lesson-6")!, id: "ex:lesson-9", bookkeeping: true }]]) } as typeof FOLD;
    expect([...legendIds(engine, { kind: "kind", key: "lesson" })]).toEqual(["ex:lesson-6"]);
  });

  it("a relation lights the two ends of each born-linked edge of that type", () => {
    expect(ids({ kind: "relation", key: "written_amid" })).toEqual(["ex:dream-4", "ex:episode-2"]);
    expect(ids({ kind: "relation", key: "summarizes" })).toEqual(["ex:dream-5", "ex:episode-2"]);
    expect(ids({ kind: "relation", key: "mentions" })).toEqual([]);
  });

  it("a feeling, a scar, a bond light the diamond of a free target or the record it is about", () => {
    const fold = { ...FOLD, standings: new Map([
      ["person:ada", { target_id: "person:ada", scars: [{}], bonds: [], positive: 0, negative: 1 }],
      ["ex:episode-2", { target_id: "ex:episode-2", scars: [], bonds: [{}], positive: 1, negative: 0 }],
    ]) } as unknown as typeof FOLD;
    expect([...legendIds(fold, { kind: "class", key: "standing" })].sort()).toEqual(["ex:episode-2", "standing:person:ada"]);
    expect([...legendIds(fold, { kind: "class", key: "scar" })]).toEqual(["standing:person:ada"]);
    expect([...legendIds(fold, { kind: "class", key: "bond" })]).toEqual(["ex:episode-2"]);
  });
});

const render = (picked: LegendPick | null) =>
  renderToStaticMarkup(<GraphLegend extraKinds={["summary", "dream", "world_model"]} relationTypes={["written_amid", "summarizes"]} warmthAge="2h" picked={picked} onPick={() => {}} />);

describe("the legend's markup", () => {
  it("two rows: the memories, then the lines and colours", () => {
    const html = render(null);
    const rows = [...html.matchAll(/class="gc_lg_row gc_lg_row_(\w+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(["kinds", "lines"]);
    const kinds = html.slice(html.indexOf("gc_lg_row_kinds"), html.indexOf("gc_lg_row_lines"));
    for (const w of ["identity", "memory", "diary", "feeling", "scar", "bond", "summary", "dream", "world"]) expect(kinds).toContain(`${w}</button>`);
    const lines = html.slice(html.indexOf("gc_lg_row_lines"));
    expect(lines).toContain("rarely used → most used");
    // The amber flash of a line just travelled (Q2: the canvas drew it, the legend never said it).
    expect(lines).toMatch(/<span class="lg_edge" title="An amber line: two memories he used together a moment ago\. It fades as he goes on\."><i class="gc_lg_flash" aria-hidden="true"><\/i>just travelled<\/span>/);
    expect(lines.indexOf("just travelled")).toBeGreaterThan(lines.indexOf("rarely used → most used"));
    expect(lines).toContain("last selection 2h ago");
    expect(lines).toContain("written_amid</button>");
  });

  it("the amber swatch is the canvas's flash colour (the accent it resolves for a line just used)", () => {
    expect(CSS).toMatch(/\.gc_lg_flash \{[^}]*background: var\(--ea-accent\);/);
    const canvas = read("graph_canvas.tsx");
    expect(canvas).toContain('assign("accent", "--ea-accent");');
    expect(canvas).toContain("ctx.strokeStyle = rgbaOf(CANVAS_THEME.accent, 0.18 + recent * 0.45);");
  });

  it("every memory item and relation type is a pressed toggle; the usage key, the amber line and the age are not", () => {
    const html = render(null);
    expect([...html.matchAll(/<button[^>]*aria-pressed="false"/g)]).toHaveLength(6 + 3 + 2);
    expect(html).not.toMatch(/<button[^>]*>[^<]*<i class="gc_rl_scale"/);
    const on = render({ kind: "kind", key: "dream" });
    expect([...on.matchAll(/aria-pressed="true"/g)]).toHaveLength(1);
    expect(on).toMatch(/aria-pressed="true" title="Showing where his dream records are — click again \(or Escape\) to let go"/);
    expect(pickKey({ kind: "relation", key: "mentions" })).toBe("relation:mentions");
  });

  it("a click picks an item; a second click on it lets go; another item replaces it", () => {
    const dream: LegendPick = { kind: "kind", key: "dream" };
    const memory: LegendPick = { kind: "class", key: "memory" };
    expect(nextPick(null, dream)).toEqual(dream);
    expect(nextPick(dream, { kind: "kind", key: "dream" })).toBeNull();
    expect(nextPick(dream, memory)).toEqual(memory);
    // A kind and a relation of the same name are two items.
    expect(nextPick({ kind: "relation", key: "dream" }, dream)).toEqual(dream);
    // Each item's click goes through it to the view.
    const src = read("graph_canvas_legend.tsx");
    expect(src).toContain("const toggle = (p: LegendPick) => onPick(nextPick(picked, p));");
    expect(src).toContain("onClick={() => toggle(p)}");
  });
});

describe("the view lights a pick and frames it", () => {
  it("the pick is one more intersecting emphasis source, its ids once per fold", () => {
    expect(VIEW).toContain("const legendSet = useMemo(() => (legendPick ? legendIds(fold, legendPick) : null), [fold, legendPick]);");
    expect(VIEW).toContain("if (legendSet !== null) sources.push(legendSet);");
    expect(VIEW).toContain("}, [searchIds, topicFilter, legendSet]);");
  });

  it("a pick frames what it lights", () => {
    expect(VIEW).toContain('const focusToken = !debouncedSearch && !legendToken ? "" : `${debouncedSearch}|${legendToken}`;');
  });

  it("the view renders the legend component (no inline legend left)", () => {
    expect(VIEW).toContain("<GraphLegend extraKinds={extraKinds} relationTypes={relationTypes} warmthAge={warmthAge} picked={legendPick} onPick={setLegendPick} />");
    expect(VIEW).not.toContain('<div className="entity_legend">');
  });
});

describe("two lines at most", () => {
  it("wide canvas: a column of two rows, each one line that scrolls sideways", () => {
    expect(CSS).toMatch(/\.entity_legend\.gc_legend2 \{\n\s+flex-direction: column;\n\s+flex-wrap: nowrap;/);
    const row = CSS.slice(CSS.indexOf(".gc_lg_row {"), CSS.indexOf("}", CSS.indexOf(".gc_lg_row {")));
    expect(row).toContain("flex-wrap: nowrap;");
    expect(row).toContain("overflow-x: auto;");
    expect(row).toContain("white-space: nowrap;");
  });

  it("phone-width canvas: its one scrollable row (the rows dissolve into it)", () => {
    const legend = CSS.slice(CSS.indexOf("/* THE LEGEND (graph_canvas_legend.tsx"));
    const narrow = legend.slice(legend.indexOf("@container entity-canvas (max-width: 859.98px) {"));
    expect(narrow).toMatch(/\.entity_legend\.gc_legend2 \{\n\s+flex-direction: row;/);
    expect(narrow).toMatch(/\.gc_lg_row \{\n\s+display: contents;/);
  });

  it("touch: a phone row is one 44 px target tall and the motion buttons stand above it", () => {
    const touch = CSS.slice(CSS.lastIndexOf("@media (pointer: coarse) {"));
    expect(touch).toMatch(/\.entity_legend\.gc_legend2 \{\n\s+padding-block: 0;/);
    expect(touch).toContain(".entity_canvas_wrap:has(> .gc_legend2) {\n    --gc-motion-bottom: calc(var(--tap-min, 44px) + 18px);");
  });
});

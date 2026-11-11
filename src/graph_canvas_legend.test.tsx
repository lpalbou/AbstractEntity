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
import { describe, expect, it, vi } from "vitest";

import { FitRowView, fitCount, GraphLegend, legendIds, nextPick, pickKey, type FitItem, type LegendPick } from "./graph_canvas_legend";
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
    // The lit lines (the recall's paths), said here only (operator 2026-11-11), after the amber line; a key, not a toggle.
    // Its words short in the row (round-6 review F2: the whole sentence was cut mid-word in the one scrolling line); the
    // sentence is its hover and its accessible name.
    expect(lines).toMatch(/<span class="lg_edge" title="lit lines: his path to each recalled memory, in its ring&#x27;s colour\. [^"]+" aria-label="lit lines: his path to each recalled memory, in its ring&#x27;s colour"><i class="gc_rl_line" aria-hidden="true"><\/i>lit lines<\/span>/);
    expect(lines.indexOf("lit lines:")).toBeGreaterThan(lines.indexOf("just travelled"));
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
  it("wide canvas: a column of two rows, each one line, never a sideways scroll that hides a key half", () => {
    expect(CSS).toMatch(/\.entity_legend\.gc_legend2 \{\n\s+flex-direction: column;\n\s+flex-wrap: nowrap;/);
    const row = CSS.slice(CSS.indexOf(".gc_lg_row {"), CSS.indexOf("}", CSS.indexOf(".gc_lg_row {")));
    expect(row).toContain("flex-wrap: nowrap;");
    expect(row).toContain("white-space: nowrap;");
    expect(row).not.toMatch(/overflow/);
    // A key being measured is out of the flow and out of sight; the rest of a row opens above it.
    const off = CSS.slice(CSS.indexOf(".gc_lg_off {"), CSS.indexOf("}", CSS.indexOf(".gc_lg_off {")));
    expect(off).toContain("position: absolute;");
    expect(off).toContain("visibility: hidden;");
    const pop = CSS.slice(CSS.indexOf(".gc_lg_pop {"), CSS.indexOf("}", CSS.indexOf(".gc_lg_pop {")));
    expect(pop).toContain("bottom: calc(100% + 8px);");
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

describe("a row never cuts a key: what fits whole shows, the rest is one '+N more' away (review round 6b F5)", () => {
  it("fitCount: every key when they fit; else as many whole keys as leave room for the chip", () => {
    expect(fitCount([100, 80, 60], 252, 70, 6)).toBe(3); // 100+6+80+6+60 = 252: they fit, no chip
    expect(fitCount([100, 80, 60], 251, 70, 6)).toBe(1); // 70+106 = 176, +86 = 262 > 251: one, then the chip
    expect(fitCount([100, 80, 60], 251, 40, 6)).toBe(2); // 40+106+86 = 232 <= 251: two and the chip
    expect(fitCount([300], 200, 60, 6)).toBe(0); // nothing fits whole: the chip alone
    expect(fitCount([], 100, 60, 6)).toBe(0);
  });

  const onClick = vi.fn();
  const items: FitItem[] = ["identity", "memory", "diary", "lesson", "world"].map((w) => ({
    key: w,
    node: (
      <button type="button" className="gc_lg_item" onClick={() => onClick(w)}>
        {w}
      </button>
    ),
  }));
  const view = (shown: number | null, open: boolean) =>
    renderToStaticMarkup(<FitRowView className="gc_lg_row" label="kinds" items={items} shown={shown} open={open} popId="pop" onMore={() => {}} />).replace(/<!-- -->/g, "");

  it("the keys that fit show whole; the rest are in the chip's count, none half in the row", () => {
    const html = view(3, false);
    expect(html.match(/data-fit=""/g)).toHaveLength(3);
    expect(html).toMatch(/>\+2 more<\/button>/);
    expect(html).not.toContain(">lesson<");
    expect(html).not.toContain(">world<");
  });

  it("opened, the chip lists the rest, the same keys (a toggle still toggles)", () => {
    const html = view(3, true);
    const pop = html.slice(html.indexOf('class="gc_lg_pop"'));
    expect(pop).toContain('role="group" aria-label="More of the kinds"');
    expect(pop).toContain(">lesson</button>");
    expect(pop).toContain(">world</button>");
    expect(html).toContain('aria-expanded="true" aria-controls="pop"');
    // The popover's keys are the row's own elements: the same click.
    const rest = items.slice(3).map((it) => it.node as React.ReactElement<{ onClick(): void }>);
    rest[0].props.onClick();
    expect(onClick).toHaveBeenCalledWith("lesson");
  });

  it("everything fits: no chip at all; measuring: every key in the flow, the chip out of it", () => {
    expect(view(5, false)).not.toContain("gc_lg_more");
    const measuring = view(null, false);
    expect(measuring.match(/data-fit=""/g)).toHaveLength(5);
    expect(measuring).toContain('class="gc_lg_more_wrap gc_lg_off"');
  });

  it("the legend's two rows are fitting rows (kinds and lines), measured on resize and on the panel's reserve, never per frame", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "graph_canvas_legend.tsx"), "utf8");
    expect(src).toContain('<FitRow className="gc_lg_row gc_lg_row_kinds" label="kinds"');
    expect(src).toContain('<FitRow className="gc_lg_row gc_lg_row_lines" label="lines"');
    expect(src).toContain("ro?.observe(wrap);");
    expect(src).toContain('mo?.observe(wrap, { attributes: true, attributeFilter: ["style"] });');
    expect(src).not.toMatch(/requestAnimationFrame/);
  });
});

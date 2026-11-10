/**
 * The usage scale (operator live test 2026-11-09: "the gradient should be
 * from dark grey (rarely visited node) to green (highly visited node) … all
 * the graph is visited, so nothing pops up"). DOM-free: the quantile
 * normalization on plain items, then on a real fold (bindings, recalls,
 * their usage events), never on hand-made fold objects.
 */
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { computeTemporalActivation } from "./temporal_activation";
import fs from "node:fs";
import path from "node:path";

import {
  coldOf,
  EDGE_ALPHA_CEILING,
  EDGE_BRIGHT_MAX,
  EDGE_GREEN_FROM,
  EDGE_GREEN_MAX,
  EDGE_QUIET_ALPHA,
  edgeTiers,
  FOCUS_EDGE_FLOOR,
  quantileRanks,
  TOP_DECILE,
  USAGE_HIGH,
  USAGE_LOW,
  USAGE_TITLE,
  usageEdgeStyle,
  usageMix,
  usageRgb,
  usageScale,
  type UsageItem,
} from "./graph_usage";

const items = (rows: Array<[string, number, number]>): Array<UsageItem<string>> => rows.map(([id, count, warmth]) => ({ id, count, warmth }));

describe("quantileRanks (the normalization)", () => {
  it("a uniform count still spreads over the whole scale, by recency (warmth)", () => {
    // Ten memories each used ONCE, in ten different turns: warmth falls
    // with each turn back. Raw counts are all equal; the ranks are not.
    const rows: Array<[string, number, number]> = Array.from({ length: 10 }, (_, i) => [`m${i}`, 1, 8 / (1 + i / 20)]);
    const t = quantileRanks(items(rows));
    expect(t.get("m0")).toBe(1); // the newest use: the green end
    expect(t.get("m9")).toBeCloseTo(0.1, 10); // the oldest: the grey end
    const ordered = rows.map(([id]) => t.get(id)!);
    for (let i = 1; i < ordered.length; i++) expect(ordered[i]).toBeLessThan(ordered[i - 1]);
    // Even steps: full contrast, no wash; only the newest is in the top decile.
    expect(t.get("m5")).toBeCloseTo(0.5, 10);
    expect(ordered.filter((x) => usageMix(x) >= 0.75)).toHaveLength(1);
  });

  it("one dominant memory never flattens the rest (rank, not raw count)", () => {
    const rows: Array<[string, number, number]> = [["hub", 300, 0], ...Array.from({ length: 9 }, (_, i): [string, number, number] => [`m${i + 1}`, i + 1, 0])];
    const t = quantileRanks(items(rows));
    expect(t.get("hub")).toBe(1);
    // The others keep an even spread from 0.1 up to 0.9 — a min-max on the
    // raw counts would squeeze them all under 0.03.
    for (let i = 1; i <= 9; i++) expect(t.get(`m${i}`)).toBeCloseTo(i / 10, 10);
  });

  it("ties on count AND warmth share their average rank; a lone item is the top", () => {
    const t = quantileRanks(items([["a", 2, 1], ["b", 2, 1], ["c", 1, 0], ["d", 3, 0]]));
    expect(t.get("c")).toBeCloseTo(0.25, 10);
    expect(t.get("a")).toBeCloseTo(0.625, 10);
    expect(t.get("b")).toBeCloseTo(0.625, 10);
    expect(t.get("d")).toBe(1);
    expect(quantileRanks(items([["only", 4, 0]])).get("only")).toBe(1);
    expect(quantileRanks([]).size).toBe(0);
  });

  it("the count leads; warmth only orders equal counts", () => {
    const t = quantileRanks(items([["often-cold", 9, 0], ["once-hot", 1, 25]]));
    expect(t.get("often-cold")).toBe(1);
    expect(t.get("once-hot")).toBeCloseTo(0.5, 10);
  });
});

function env(seq: number, family: ReplayEnvelope["family"], payload: Record<string, unknown>, extra: Partial<ReplayEnvelope> = {}): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family,
    observed_at: "2026-11-09T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload,
    ...extra,
  } as ReplayEnvelope;
}

const binding = (seq: number, id: string, kind = "memory"): ReplayEnvelope =>
  env(seq, "binding", { record_id: id, scope: "life", owner_id: "entity:test", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq }, { display: { record_id: id, kind, title: id } as ReplayEnvelope["display"] });
const selected = (seq: number, id: string, trace: string): ReplayEnvelope =>
  env(seq, "event", { kind: "selected", scope: "life", owner_id: "entity:test", record_id: id, pair_ids: null, weight: 8, matched: true, event_id: `e${seq}`, seq }, { trace_id: trace });
const coSelected = (seq: number, a: string, b: string, trace: string): ReplayEnvelope =>
  env(seq, "event", { kind: "co_selected", scope: "life", owner_id: "entity:test", record_id: null, pair_ids: [a, b], weight: 4, event_id: `e${seq}`, seq }, { trace_id: trace });

describe("usageScale on a real fold (per home, over the loaded window)", () => {
  it("never used = 0 (dark grey); a home where each memory was used once spreads by recency", () => {
    const envs = [
      binding(1, "ex:memory-a"),
      binding(2, "ex:memory-b"),
      binding(3, "ex:memory-c"),
      binding(4, "ex:memory-never"),
      selected(10, "ex:memory-a", "t1"),
      selected(20, "ex:memory-b", "t2"),
      selected(30, "ex:memory-c", "t3"),
      coSelected(31, "ex:memory-a", "ex:memory-c", "t3"),
      coSelected(32, "ex:memory-b", "ex:memory-c", "t3"),
      coSelected(40, "ex:memory-a", "ex:memory-b", "t4"),
    ];
    const fold = foldEnvelopes(envs);
    const u = usageScale(fold, computeTemporalActivation(fold.attention));
    expect(u.nodes.get("ex:memory-never")).toBe(0);
    // Used once each: the newest use (c) is the green end, the oldest (a)
    // a step above never used.
    expect(u.nodes.get("ex:memory-c")).toBe(1);
    expect(u.nodes.get("ex:memory-b")).toBeCloseTo(2 / 3, 10);
    expect(u.nodes.get("ex:memory-a")).toBeCloseTo(1 / 3, 10);
    // Lines: each used once; the newest (t4) on top, the two t3 lines tied.
    const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
    expect(u.edges.get(key("ex:memory-a", "ex:memory-b"))).toBe(1);
    expect(u.edges.get(key("ex:memory-a", "ex:memory-c"))).toBeCloseTo(0.5, 10);
    expect(u.edges.get(key("ex:memory-b", "ex:memory-c"))).toBeCloseTo(0.5, 10);
  });

  it("only his most used tenth reaches the green step (Castor-shaped: a few hubs, a long tail)", () => {
    const envs: ReplayEnvelope[] = [];
    let seq = 1;
    for (let i = 0; i < 40; i++) envs.push(binding(seq++, `ex:memory-${i}`));
    // memory i is used i+1 times, over the turns.
    for (let i = 0; i < 40; i++) for (let k = 0; k <= i; k++) envs.push(selected(seq++, `ex:memory-${i}`, `t${k}`));
    const fold = foldEnvelopes(envs);
    const u = usageScale(fold, computeTemporalActivation(fold.attention));
    const top = [...u.nodes.entries()].filter(([, t]) => usageMix(t) >= 0.75).map(([id]) => id);
    expect(top.sort()).toEqual(["ex:memory-36", "ex:memory-37", "ex:memory-38", "ex:memory-39"]);
    expect(u.nodes.get("ex:memory-39")).toBe(1);
  });

  it("engine bookkeeping is no memory: always 0", () => {
    const envs = [
      env(1, "binding", { record_id: "ex:claim-k", scope: "life", owner_id: "entity:test", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: "b1", seq: 1 }, {
        display: { record_id: "ex:claim-k", kind: "claim", title: "engram marker", bookkeeping: true } as unknown as ReplayEnvelope["display"],
      }),
      selected(2, "ex:claim-k", "t1"),
    ];
    const fold = foldEnvelopes(envs);
    const node = fold.nodes.get("ex:claim-k")!;
    expect(node.bookkeeping).toBe(true);
    expect(usageScale(fold, computeTemporalActivation(fold.attention)).nodes.get("ex:claim-k")).toBe(0);
  });
});

describe("the ramp: dark grey -> green, the top decile pops", () => {
  it("usageMix stays grey below the top decile and steps to green inside it", () => {
    expect(usageMix(0)).toBe(0);
    expect(usageMix(0.5)).toBeLessThan(0.15);
    expect(usageMix(TOP_DECILE)).toBeLessThanOrEqual(0.3);
    expect(usageMix(TOP_DECILE + 1e-9)).toBeCloseTo(0.85, 6);
    expect(usageMix(1)).toBe(1);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      expect(usageMix(t)).toBeGreaterThanOrEqual(prev);
      prev = usageMix(t);
    }
  });

  it("a trail he has not walked much is the one dark grey; the upper third turns green steeply; the top tenth is bright and wider (backlog 0025)", () => {
    const tiers = edgeTiers(2368); // castor's trails
    expect(tiers).toEqual({ green: EDGE_GREEN_FROM, bright: TOP_DECILE });
    // Bottom two thirds: one dark grey, thin, never green.
    for (const t of [0, 0.01, 0.3, 0.5, EDGE_GREEN_FROM]) expect(usageEdgeStyle(t, tiers)).toEqual({ mix: 0, alpha: EDGE_QUIET_ALPHA, width: 0.8 });
    expect(EDGE_QUIET_ALPHA).toBeGreaterThanOrEqual(0.06);
    expect(EDGE_QUIET_ALPHA).toBeLessThanOrEqual(0.08);
    // The upper third climbs on a square: half way through it, a quarter of its rise.
    const half = usageEdgeStyle((EDGE_GREEN_FROM + TOP_DECILE) / 2, tiers);
    expect(half.mix).toBeCloseTo(0.55 / 4, 6);
    expect(half.alpha).toBeLessThan(0.11);
    expect(usageEdgeStyle(TOP_DECILE, tiers).alpha).toBeCloseTo(0.2, 6);
    // The top tenth steps up: bright, wider, never past the ceiling.
    const step = usageEdgeStyle(TOP_DECILE + 1e-9, tiers);
    expect(step.alpha).toBeGreaterThanOrEqual(0.45);
    expect(step.mix).toBeGreaterThanOrEqual(0.85);
    expect(step.width).toBeGreaterThan(1.3);
    const top = usageEdgeStyle(1, tiers);
    expect(top.mix).toBe(1);
    expect(top.alpha).toBe(EDGE_ALPHA_CEILING);
    expect(top.width).toBeCloseTo(2.6, 9);
    // Monotone in all three.
    let prev = { mix: -1, alpha: -1, width: -1 };
    for (let t = 0; t <= 1.0001; t += 0.005) {
      const cur = usageEdgeStyle(Math.min(1, t), tiers);
      expect(cur.mix).toBeGreaterThanOrEqual(prev.mix);
      expect(cur.alpha).toBeGreaterThanOrEqual(prev.alpha);
      expect(cur.width).toBeGreaterThanOrEqual(prev.width);
      prev = cur;
    }
  });

  it("the tiers are capped in count: a life of 25 000 trails lights at most 300 bright and 1 000 in green, its mean opacity stays low", () => {
    const tiers = edgeTiers(25000);
    const looks = Array.from({ length: 25000 }, (_, i) => usageEdgeStyle((i + 1) / 25000, tiers));
    expect(looks.filter((x) => x.alpha >= 0.45)).toHaveLength(EDGE_BRIGHT_MAX);
    expect(looks.filter((x) => x.mix > 0)).toHaveLength(EDGE_GREEN_MAX);
    const mean = looks.reduce((a, x) => a + x.alpha, 0) / looks.length;
    expect(mean).toBeLessThan(0.08);
    // A small life keeps the relative tiers (upper third, top tenth).
    expect(edgeTiers(600)).toEqual({ green: EDGE_GREEN_FROM, bright: TOP_DECILE });
    expect(edgeTiers(0)).toEqual({ green: EDGE_GREEN_FROM, bright: TOP_DECILE });
  });

  it("the canvas draws both line kinds with it: born-linked lines and quiet trails the same dark grey, a hovered memory's lines lit to a floor", () => {
    const canvas = fs.readFileSync(path.resolve(__dirname, "graph_canvas.tsx"), "utf8");
    expect(canvas).toContain("ctx.strokeStyle = rgbaOf(CANVAS_THEME.dim, seLit ? FOCUS_EDGE_FLOOR : EDGE_QUIET_ALPHA);");
    expect(canvas).toContain("const c = usageRgb(mix, CANVAS_THEME.dim, CANVAS_THEME.warm);");
    expect(canvas).toContain("const look = usageEdgeStyle(place, usage.edgeTiers);");
    expect(canvas).toContain("ctx.strokeStyle = usageStroke(look.mix, focusLit ? Math.min(1, Math.max(FOCUS_EDGE_FLOOR, look.alpha * FOCUS_LIT_GAIN)) : look.alpha);");
    expect(canvas).toContain("ctx.lineWidth = look.width;");
    expect(canvas).not.toContain("rgbaOf(CANVAS_THEME.dim, 0.16)");
    expect(FOCUS_EDGE_FLOOR).toBeGreaterThan(EDGE_QUIET_ALPHA * 4);
  });

  it("the ends: dark grey on a dark theme, green at the top", () => {
    const cold = coldOf([11, 15, 20], [226, 232, 240]);
    expect(cold).toEqual([71, 76, 82]);
    expect(usageRgb(0, cold, [110, 220, 160])).toEqual(cold);
    expect(usageRgb(1, cold, [110, 220, 160])).toEqual([110, 220, 160]);
    // On a light theme the rarely used end is a quiet light grey.
    const light = coldOf([250, 250, 250], [20, 20, 20]);
    expect(light[0]).toBeGreaterThan(180);
  });

  it("the legend words", () => {
    expect(USAGE_LOW).toBe("rarely used");
    expect(USAGE_HIGH).toBe("most used");
    expect(USAGE_TITLE).toMatch(/^Colour of a memory and of a line between two memories: how much he has used it, ranked within his own life/);
    expect(USAGE_TITLE).toMatch(/his most used tenth is bright green/);
  });
});

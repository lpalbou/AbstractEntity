/**
 * THE TOPIC SPOTLIGHT (operator's second test round 2026-11-10: "an
 * activated topic must be clearly more visible — today barely"). The pure
 * numbers (graph_canvas_spotlight.ts), then the canvas held to them on its
 * source (the canvas draws in a RAF loop; no DOM in the tests).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { seamRows } from "./graph_canvas";
import type { FoldState } from "./stream_fold";

import {
  circleLit,
  litRowsCache,
  litRowsOnScreen,
  litRowsSpotCache,
  litTopicKey,
  MEMBER_RING,
  MISSED_TOPIC_DIM,
  OTHER_TOPIC_DIM,
  SPOTLIGHT_VEIL,
  TOPIC_GLOW,
  TOPIC_LIT,
  TOPIC_REST,
  topicCircleStyle,
  topicDimTarget,
  veilAlpha,
} from "./graph_canvas_spotlight";

const CANVAS = fs.readFileSync(path.resolve(__dirname, "graph_canvas.tsx"), "utf8");

describe("the lit topic", () => {
  it("is the hovered one before the focused one, else none", () => {
    expect(litTopicKey(null, null)).toBeNull();
    expect(litTopicKey(null, "k1")).toBe("k1");
    expect(litTopicKey("k2", "k1")).toBe("k2");
    expect(litTopicKey("k2", null)).toBe("k2");
  });

  it("stays at full strength; every other circle dims to OTHER_TOPIC_DIM while one is lit", () => {
    expect(topicDimTarget({ lit: true, anyLit: true, emphasis: true, emphasisHits: false })).toBe(1);
    expect(topicDimTarget({ lit: false, anyLit: true, emphasis: false, emphasisHits: false })).toBe(OTHER_TOPIC_DIM);
    // Another lit topic outranks a lens hit: the spotlight is on one circle.
    expect(topicDimTarget({ lit: false, anyLit: true, emphasis: true, emphasisHits: true })).toBe(OTHER_TOPIC_DIM);
    expect(OTHER_TOPIC_DIM).toBeLessThan(MISSED_TOPIC_DIM);
  });

  it("no topic lit: a circle the emphasis misses dims as before, the rest stay", () => {
    expect(topicDimTarget({ lit: false, anyLit: false, emphasis: true, emphasisHits: false })).toBe(MISSED_TOPIC_DIM);
    expect(topicDimTarget({ lit: false, anyLit: false, emphasis: true, emphasisHits: true })).toBe(1);
    expect(topicDimTarget({ lit: false, anyLit: false, emphasis: false, emphasisHits: false })).toBe(1);
  });

  it("is painted clearly stronger than a circle at rest (was fill 0.09, ring 0.75 x 2 px)", () => {
    const rest = topicCircleStyle(0);
    const lit = topicCircleStyle(1);
    expect(rest).toEqual({ fill: TOPIC_REST.fill, stroke: TOPIC_REST.stroke, width: TOPIC_REST.width, glow: 0 });
    expect(lit).toEqual({ fill: TOPIC_LIT.fill, stroke: TOPIC_LIT.stroke, width: TOPIC_LIT.width, glow: TOPIC_GLOW.alpha });
    expect(lit.fill).toBeGreaterThanOrEqual(0.15);
    expect(lit.stroke).toBe(1);
    expect(lit.width).toBeGreaterThanOrEqual(3);
    expect(lit.glow).toBeGreaterThan(0);
    // At rest, readable without a hover (was 0.055 / 0.3).
    expect(rest.fill).toBeGreaterThan(0.055);
    expect(rest.stroke).toBeGreaterThan(0.3);
  });

  it("eases between rest and lit (monotone, clamped)", () => {
    let prev = topicCircleStyle(0);
    for (const g of [0.25, 0.5, 0.75, 1]) {
      const s = topicCircleStyle(g);
      expect(s.fill).toBeGreaterThan(prev.fill);
      expect(s.stroke).toBeGreaterThan(prev.stroke);
      expect(s.width).toBeGreaterThan(prev.width);
      expect(s.glow).toBeGreaterThan(prev.glow);
      prev = s;
    }
    expect(topicCircleStyle(-1)).toEqual(topicCircleStyle(0));
    expect(topicCircleStyle(2)).toEqual(topicCircleStyle(1));
  });

  it("the veil is the strongest gain's, none at rest", () => {
    expect(veilAlpha([])).toBe(0);
    expect(veilAlpha([0, 0])).toBe(0);
    expect(veilAlpha([0.5, 1])).toBe(SPOTLIGHT_VEIL);
    expect(veilAlpha([0.5])).toBeCloseTo(SPOTLIGHT_VEIL / 2);
    expect(SPOTLIGHT_VEIL).toBeGreaterThan(0.3);
  });

  it("its memories' set is rebuilt only when the lit topic or the seating changes", () => {
    const rowsOf = litRowsCache();
    const seat = new Map([["k1", ["r1", "r2"]], ["k2", ["r3"]]]);
    const a = rowsOf("k1", seat, 1);
    expect([...(a ?? [])]).toEqual(["r1", "r2"]);
    expect(rowsOf("k1", seat, 1)).toBe(a);
    expect([...(rowsOf("k2", seat, 1) ?? [])]).toEqual(["r3"]);
    const b = rowsOf("k2", new Map([["k2", ["r3", "r4"]]]), 2);
    expect([...(b ?? [])]).toEqual(["r3", "r4"]);
    expect(rowsOf(null, seat, 2)).toBeNull();
    expect(rowsOf("k1", null, 3)).toBeNull();
  });
});

describe("the canvas draws the spotlight", () => {
  it("lights the focused topic (topics on, served) through one eased gain per circle", () => {
    expect(CANVAS).toContain("const litKey = topicsOn && seated ? litTopicKey(");
    expect(CANVAS).toContain("const lit = circleLit(circle.id, rowsLit, litKey);");
    expect(CANVAS).toContain("const hd = easedDim(`topic:${circle.id}`, topicDimTarget({ lit, anyLit: rowsLit ? rowsLit.circles.size > 0 : litKey !== null, emphasis: emphasis !== null, emphasisHits: hits }));");
    expect(CANVAS).toContain("const gain = 1 - easedDim(`topiclit:${circle.id}`, lit ? 0 : 1);");
    expect(CANVAS).toContain("ctx.fillStyle = hexAlpha(color, style.fill * hd);");
  });

  it("rings every memory of the lit topic in its colour", () => {
    const at = CANVAS.indexOf("// THE SPOTLIGHT: the lit topic's memory, ringed in its colour");
    expect(at).toBeGreaterThan(0);
    const block = CANVAS.slice(at, at + 800);
    expect(block).toContain(": litHalo && litRows !== null && litRows.has(node.id) ? litHalo : null;");
    expect(block).toContain("if (ringHalo && ringHalo.gain > 0) {");
    expect(block).toContain("ctx.arc(p.x, p.y, r + MEMBER_RING.gap, 0, Math.PI * 2);");
    expect(block).toContain("hexAlpha(ringHalo.color, MEMBER_RING.alpha * ringHalo.gain)");
    expect(MEMBER_RING.alpha).toBeGreaterThan(0.8);
  });

  it("veils everything but the lit circles after the memories, then draws their ring and glow over it", () => {
    const veil = CANVAS.indexOf("// THE SPOTLIGHT'S VEIL");
    const nodes = CANVAS.indexOf("// Memory nodes (");
    const labels = CANVAS.indexOf("// Topic LABELS go last, on top");
    expect(nodes).toBeGreaterThan(0);
    expect(veil).toBeGreaterThan(nodes);
    expect(labels).toBeGreaterThan(veil);
    const block = CANVAS.slice(veil, labels);
    expect(block).toContain('ctx.fill("evenodd");');
    expect(block).toContain("veilAlpha(easing.map((hl) => hl.gain))");
    expect(block).toContain("ctx.arc(hl.cx, hl.cy, hl.r + TOPIC_GLOW.gap, 0, Math.PI * 2);");
    expect(block).toContain("ctx.lineWidth = style.width;");
  });

  it("places the lit topic's title first and tints its plate (the placement re-runs when the lit topic changes)", () => {
    expect(CANVAS).toContain("const order = litHalo ? [litHalo, ...topicHalos.filter((hl) => hl !== litHalo)] : topicHalos;");
    expect(CANVAS).toMatch(/const titlesKey = `[^`]*\|\$\{litKey\}`;/);
    expect(CANVAS).toContain("ctx.strokeStyle = hexAlpha(halo.color, 0.55 + 0.45 * halo.gain);");
  });
});

describe("the rows the Topics panel lights (onHoverRows: a path's two memories, a memory type's in a topic)", () => {
  const circleOfRow = new Map([["a", "k1"], ["b", "k1"], ["c", "k2"], ["d", "k3"]]);

  it("are exactly the ids given, with the circles that hold them; a memory in no circle adds none", () => {
    const of = litRowsSpotCache();
    const ids = new Set(["a", "c", "waiting"]);
    const spot = of(ids, circleOfRow, 1);
    expect(spot?.rows).toBe(ids);
    expect(spot?.circles).toEqual(new Set(["k1", "k2"]));
    expect(of(null, circleOfRow, 1)).toBeNull();
    expect(of(ids, null, 1)).toBeNull();
  });

  it("are rebuilt only when the panel's set or the seating changes (never per frame)", () => {
    const of = litRowsSpotCache();
    const ids = new Set(["a"]);
    const first = of(ids, circleOfRow, 1);
    expect(of(ids, circleOfRow, 1)).toBe(first);
    expect(of(ids, circleOfRow, 2)).not.toBe(first);
    const other = new Set(["a"]);
    expect(of(other, circleOfRow, 2)?.rows).toBe(other);
  });

  it("light the canvas only when one of their circles is on it (or they sit in no circle)", () => {
    const of = litRowsSpotCache();
    const spot = of(new Set(["a", "c"]), circleOfRow, 1)!;
    expect(litRowsOnScreen(spot, (k) => k === "k2")).toBe(true);
    expect(litRowsOnScreen(spot, () => false)).toBe(false);
    expect(litRowsOnScreen(of(new Set(["waiting"]), circleOfRow, 2)!, () => false)).toBe(true);
  });

  it("light the circles that hold them instead of the lit topic; none lit: the lit topic's", () => {
    const spot = litRowsSpotCache()(new Set(["c"]), circleOfRow, 1);
    expect(circleLit("k2", spot, "k1")).toBe(true);
    expect(circleLit("k1", spot, "k1")).toBe(false);
    expect(circleLit("k1", null, "k1")).toBe(true);
    expect(circleLit("k2", null, "k1")).toBe(false);
    expect(circleLit("k1", null, null)).toBe(false);
  });

  it("an id that is not a graph node id says so loudly (the panel broke the seam)", () => {
    const fold = { nodes: new Map([["a", {}], ["c", {}]]) } as unknown as Pick<FoldState, "nodes">;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(seamRows(fold, ["a", "c"], "onHoverRows")).toEqual(["a", "c"]);
    expect(err).not.toHaveBeenCalled();
    seamRows(fold, ["a", "ex:episode-1"], "onFrameRows");
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toBe("#SEAM onFrameRows: 1 of 2 ids are not graph node ids");
    err.mockRestore();
  });
});

describe("the canvas lights and frames the panel's rows", () => {
  it("the panel's two props are wired at its mount", () => {
    const mount = CANVAS.slice(CANVAS.indexOf("<TopicsPanel"), CANVAS.indexOf("colorOf={(n) => KIND_COLORS[nodeClass(n)] ?? KIND_COLORS.unknown}"));
    expect(mount).toContain('hoverRowsRef.current = ids === null ? null : new Set(seamRows(fold, ids, "onHoverRows"));');
    expect(mount).toContain('onFrameRows={(ids) => frameRows(seamRows(fold, ids, "onFrameRows"))}');
  });

  it("the rows win over the hovered topic: the emphasis is exactly their set (a line lit only when both ends are)", () => {
    expect(CANVAS).toContain("const rowsSpot = topicsOn && seated && placement ? litRowsSpotOf(hoverRowsRef.current, seated.circleOfRow, pc.gen) : null;");
    expect(CANVAS).toContain("filter: searchIds !== null || rowsLit !== null,");
    // After every other trigger has set it (a hovered topic included), before the dims are eased.
    const at = CANVAS.indexOf("if (rowsLit) emphasis = rowsLit.rows;");
    expect(at).toBeGreaterThan(CANVAS.indexOf("emphasis = near;"));
    expect(at).toBeLessThan(CANVAS.indexOf("const nodeDim = (id: string) => easedDim(id, emphasis && !emphasis.has(id) ? DIMMED_NODE : 1);"));
    // The lines: the emphasis rule (recall_emphasis.edgeDimTarget), no travelled set under a filter.
    expect(CANVAS).toContain("const travelled = driver === \"recall\" && recall ? recall.travelled : null;");
  });

  it("onFrameRows glides to their box in the part the panel leaves free", () => {
    const at = CANVAS.indexOf("  const frameRows = (ids: string[]) => {");
    expect(at).toBeGreaterThan(0);
    const block = CANVAS.slice(at, CANVAS.indexOf("  const focusTopicRef = useRef(focusTopic);"));
    expect(block).toContain('canvas.parentElement?.querySelector(".gc_topics")');
    expect(block).toContain("const pose = framePointsPose(points, { w: rect.width, h: rect.height }, freeCentre({ w: rect.width, h: rect.height }, panel));");
    expect(block).toContain("if (pose) moveCamera(pose);");
    expect(block).not.toMatch(/cam\.(x|y|zoom) =/);
  });
});

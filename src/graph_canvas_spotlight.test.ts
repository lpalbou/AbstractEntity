/**
 * THE TOPIC SPOTLIGHT (operator's second test round 2026-11-10: "an
 * activated topic must be clearly more visible — today barely"). The pure
 * numbers (graph_canvas_spotlight.ts), then the canvas held to them on its
 * source (the canvas draws in a RAF loop; no DOM in the tests).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  litRowsCache,
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
    expect(CANVAS).toContain("const hd = easedDim(`topic:${circle.id}`, topicDimTarget({ lit, anyLit: litKey !== null, emphasis: emphasis !== null, emphasisHits: hits }));");
    expect(CANVAS).toContain("const gain = 1 - easedDim(`topiclit:${circle.id}`, lit ? 0 : 1);");
    expect(CANVAS).toContain("ctx.fillStyle = hexAlpha(color, style.fill * hd);");
  });

  it("rings every memory of the lit topic in its colour", () => {
    const at = CANVAS.indexOf("// THE SPOTLIGHT: the lit topic's memory, ringed in its colour.");
    expect(at).toBeGreaterThan(0);
    const block = CANVAS.slice(at, at + 500);
    expect(block).toContain("litRows.has(node.id)");
    expect(block).toContain("ctx.arc(p.x, p.y, r + MEMBER_RING.gap, 0, Math.PI * 2);");
    expect(block).toContain("hexAlpha(litHalo.color, MEMBER_RING.alpha * litHalo.gain)");
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

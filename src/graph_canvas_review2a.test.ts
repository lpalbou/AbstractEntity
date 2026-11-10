/**
 * Review 2026-11-10 (untracked/adversarial-round2a-2026-11-10/FINDINGS.md) on
 * topics round 2 (a)-(c): the blocker (a hovered topic off-screen veiled the
 * whole graph with nothing lit) and the should-fixes (the 400 x 700 framing
 * strip, the lit topic's missing title; the member click's teleport is pinned
 * in graph_canvas_camera.test.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { FREE_MIN_H, FREE_MIN_W, freeCentre } from "./graph_canvas";
import { circleMeetsCanvas, litPlateFallback, plateInDisc } from "./graph_canvas_spotlight";

const CANVAS = fs.readFileSync(path.resolve(__dirname, "graph_canvas.tsx"), "utf8");

describe("a hovered topic lights only when its circle is on the canvas (the blocker)", () => {
  it("circleMeetsCanvas: inside, overlapping an edge, or off every side", () => {
    expect(circleMeetsCanvas({ x: 500, y: 300 }, 40, 1000, 600)).toBe(true);
    expect(circleMeetsCanvas({ x: -30, y: 300 }, 40, 1000, 600)).toBe(true);
    expect(circleMeetsCanvas({ x: 1700, y: 300 }, 40, 1000, 600)).toBe(false);
    expect(circleMeetsCanvas({ x: 500, y: -666 }, 400, 1000, 600)).toBe(false);
    expect(circleMeetsCanvas({ x: -41, y: 300 }, 40, 1000, 600)).toBe(false);
    expect(circleMeetsCanvas({ x: 500, y: 641 }, 40, 1000, 600)).toBe(false);
    // A framed circle bigger than the canvas still meets it.
    expect(circleMeetsCanvas({ x: 500, y: 300 }, 3000, 1000, 600)).toBe(true);
  });

  it("the canvas counts a hover only for a circle on screen, so no veil falls over a graph with nothing lit", () => {
    expect(CANVAS).toContain("const hoverOnScreen = hoverCircle ? circleMeetsCanvas(toScreen(hoverCircle.x, hoverCircle.y), hoverCircle.r * cam.zoom, w, h) : false;");
    expect(CANVAS).toContain("const hoveredTopic = topicsOn && seated && hoverOnScreen && hoverTopicRef.current !== null");
  });
});

describe("freeCentre refuses a sliver (400 x 700: an 8 px strip at the left edge)", () => {
  it("the folded head at the top of a short phone canvas: the band under it, never the 8 px strip", () => {
    // 400 x 700: canvas 384 x 159, lens band 48, the folded head 46..90 across the width.
    const at = freeCentre({ w: 384, h: 159 }, { x: 8, y: 46, w: 368, h: 44 });
    expect(at.w).toBeGreaterThanOrEqual(FREE_MIN_W);
    expect(at).toEqual({ x: 192, y: 90 + 69 / 2, w: 384, h: 69 });
  });

  it("no part wide and tall enough: the whole canvas below the lens row", () => {
    expect(freeCentre({ w: 384, h: 120 }, { x: 8, y: 46, w: 368, h: 44 })).toEqual({ x: 192, y: 48 + 72 / 2, w: 384, h: 72 });
    expect(FREE_MIN_W).toBe(120);
    expect(FREE_MIN_H).toBe(40);
  });

  it("the three parts compete by area (left, above, below)", () => {
    // A panel low on a phone: above wins over below.
    expect(freeCentre({ w: 384, h: 400 }, { x: 8, y: 300, w: 368, h: 44 })).toEqual({ x: 192, y: 48 + 126, w: 384, h: 252 });
    // A panel high on a phone: below wins.
    expect(freeCentre({ w: 384, h: 400 }, { x: 8, y: 60, w: 368, h: 44 })).toEqual({ x: 192, y: 104 + 148, w: 384, h: 296 });
  });
});

describe("the lit topic's title is always drawn once framed", () => {
  it("litPlateFallback: just inside the circle's top edge, held inside the canvas and below the lens row", () => {
    const bounds = { w: 1000, h: 600 };
    expect(litPlateFallback({ cx: 500, cy: 300, r: 200 }, 180, 34, bounds, 82)).toEqual({ x: 410, y: 108, w: 180, h: 34 });
    // Its top edge above the canvas: below the lens row.
    expect(litPlateFallback({ cx: 500, cy: 300, r: 2000 }, 180, 34, bounds, 82)).toEqual({ x: 410, y: 82, w: 180, h: 34 });
    // Near an edge: held inside.
    expect(litPlateFallback({ cx: 990, cy: 300, r: 200 }, 180, 34, bounds, 82).x).toBe(812);
    expect(litPlateFallback({ cx: 2, cy: 300, r: 200 }, 180, 34, bounds, 82).x).toBe(8);
    expect(litPlateFallback({ cx: 500, cy: 900, r: 100 }, 180, 34, bounds, 82).y).toBe(558);
  });

  it("plateInDisc: another topic's title inside the lit circle is not drawn", () => {
    expect(plateInDisc({ x: 400, y: 300, w: 100, h: 20 }, { cx: 450, cy: 310, r: 50 })).toBe(true);
    expect(plateInDisc({ x: 600, y: 300, w: 100, h: 20 }, { cx: 450, cy: 310, r: 50 })).toBe(false);
  });

  it("the canvas falls back for the lit title only (its circle on screen), and skips other titles inside the lit disc", () => {
    expect(CANVAS).toContain("const at = rect ?? (halo === litHalo && circleMeetsCanvas({ x: halo.cx, y: halo.cy }, halo.r, cssW, cssH) ? litPlateFallback(halo, w, h, { w: cssW, h: cssH }, 82) : null);");
    expect(CANVAS).toContain("if (litHalo && halo !== litHalo && plateInDisc(at, litHalo)) continue;");
  });
});

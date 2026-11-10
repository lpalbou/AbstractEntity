/**
 * Where a topic's title goes on the canvas: wrapped onto two lines at most
 * (never cut mid-word at a fixed count; the hover card has the whole
 * title), just outside its circle, never over a memory, another title, an
 * overlay band or off the canvas.
 */
import { describe, expect, it } from "vitest";

import { placeTopicLabel, wrapTopicLabel } from "./topic_labels";

describe("placeTopicLabel", () => {
  const base = { halo: { cx: 300, cy: 300, r: 50 }, w: 80, h: 18, placed: [], bounds: { w: 800, h: 800 } };
  it("prefers just above the circle", () => {
    expect(placeTopicLabel({ ...base, nodes: [] })).toEqual({ x: 260, y: 228, w: 80, h: 18 });
  });

  it("moves below, then beside, when a node sits there — never over a node", () => {
    const below = placeTopicLabel({ ...base, nodes: [{ x: 300, y: 236, r: 5 }] })!;
    expect(below.y).toBe(354);
    const right = placeTopicLabel({ ...base, nodes: [{ x: 300, y: 236, r: 5 }, { x: 300, y: 362, r: 5 }] })!;
    expect(right.x).toBe(356);
    const left = placeTopicLabel({ ...base, nodes: [{ x: 300, y: 236, r: 5 }, { x: 300, y: 362, r: 5 }, { x: 390, y: 300, r: 5 }] })!;
    expect(left.x).toBe(164);
  });

  it("never over another title, a blocked band or off the canvas; null when nowhere is free", () => {
    const taken = placeTopicLabel({ ...base, nodes: [], placed: [{ x: 250, y: 220, w: 100, h: 30 }] })!;
    expect(taken.y).toBe(354);
    expect(placeTopicLabel({ ...base, nodes: [], blocked: (rc) => rc.y < 300 })!.y).toBe(354);
    expect(placeTopicLabel({ ...base, halo: { cx: 30, cy: 30, r: 20 }, nodes: [] })!.x).toBeGreaterThanOrEqual(2);
    expect(placeTopicLabel({ ...base, nodes: [], blocked: () => true })).toBeNull();
  });
});

describe("wrapTopicLabel", () => {
  const m = (t: string) => t.length * 6; // 6 px per character
  it("one line when it fits", () => {
    expect(wrapTopicLabel("The harbour archive", 220, m)).toEqual({ lines: ["The harbour archive"], complete: true });
  });

  it("an authored title wraps at a space onto a second line, nothing left out", () => {
    const r = wrapTopicLabel("Humanitarian needs in East Africa and the response plan", 220, m);
    expect(r.complete).toBe(true);
    expect(r.lines).toHaveLength(2);
    expect(r.lines.join(" ")).toBe("Humanitarian needs in East Africa and the response plan");
  });

  it("a title longer than two lines says so ('…'); the card shows the rest", () => {
    const r = wrapTopicLabel("aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeeeeeeeee", 72, m);
    expect(r.lines).toHaveLength(2);
    expect(r.complete).toBe(false);
    expect(r.lines[1].endsWith("…")).toBe(true);
    for (const l of r.lines) expect(m(l)).toBeLessThanOrEqual(72);
  });
});

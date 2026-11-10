/**
 * THE TOPIC HOVER (operator 2026-11-10, Entity backlog 0002: "hovering a
 * topic in the panel should highlight its community in the graph and dim
 * the rest"). The controller (topics_panel.topicHover) on fake timers, then
 * the panel and the canvas held to it on their source (no DOM in the tests).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { HOVER_INTENT_MS, type HoverIntentTimers } from "./hover_intent";
import { topicHover } from "./topics_panel";

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");
const PANEL = read("topics_panel.tsx");
const CANVAS = read("graph_canvas.tsx");

function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: HoverIntentTimers = {
    set(fn, ms) {
      const id = next++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear(id) {
      pending.delete(id);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending]) {
      if (t.at <= now) {
        pending.delete(id);
        t.fn();
      }
    }
  };
  return { timers, advance };
}

function setup() {
  const { timers, advance } = fakeTimers();
  const emitted: Array<string | null> = [];
  const h = topicHover((k) => emitted.push(k), timers);
  return { h, advance, emitted };
}

describe("topicHover", () => {
  it("lights a topic once the mouse has rested on it for the hover intent (150 ms)", () => {
    const { h, advance, emitted } = setup();
    h.pointerOver("k1", "mouse");
    advance(HOVER_INTENT_MS - 1);
    expect(emitted).toEqual([]);
    advance(1);
    expect(emitted).toEqual(["k1"]);
    expect(HOVER_INTENT_MS).toBe(150);
  });

  it("a sweep across the rows lights nothing", () => {
    const { h, advance, emitted } = setup();
    for (const k of ["k1", "k2", "k3", "k4"]) {
      h.pointerOver(k, "mouse");
      advance(40);
    }
    h.pointerLeave("mouse");
    advance(1000);
    expect(emitted).toEqual([]);
  });

  it("moving to another topic keeps the lit one until the new one has rested", () => {
    const { h, advance, emitted } = setup();
    h.pointerOver("k1", "mouse");
    advance(200);
    h.pointerOver("k2", "mouse");
    advance(100);
    expect(emitted).toEqual(["k1"]);
    advance(60);
    expect(emitted).toEqual(["k1", "k2"]);
  });

  it("back on the lit topic before the other rests: the other is forgotten", () => {
    const { h, advance, emitted } = setup();
    h.pointerOver("k1", "mouse");
    advance(200);
    h.pointerOver("k2", "mouse");
    advance(50);
    h.pointerOver("k1", "mouse");
    advance(500);
    expect(emitted).toEqual(["k1"]);
  });

  it("moving inside one topic's rows (its facts, its memories) does not re-emit", () => {
    const { h, advance, emitted } = setup();
    h.pointerOver("k1", "mouse");
    advance(200);
    h.pointerOver("k1", "mouse");
    h.pointerOver(null, "mouse"); // a gap between rows
    h.pointerOver("k1", "pen");
    advance(500);
    expect(emitted).toEqual(["k1"]);
  });

  it("over a gap between rows, a pending topic is forgotten (the lit one stays)", () => {
    const { h, advance, emitted } = setup();
    h.pointerOver("k1", "mouse");
    advance(200);
    h.pointerOver("k2", "mouse");
    advance(50);
    h.pointerOver(null, "mouse");
    advance(500);
    expect(emitted).toEqual(["k1"]);
  });

  it("leaving the list lets go at once (and cancels a pending one)", () => {
    const { h, advance, emitted } = setup();
    h.pointerOver("k1", "mouse");
    advance(200);
    h.pointerOver("k2", "mouse");
    h.pointerLeave("mouse");
    expect(emitted).toEqual(["k1", null]);
    advance(500);
    expect(emitted).toEqual(["k1", null]);
  });

  it("a touch never hovers (a tap focuses the topic)", () => {
    const { h, advance, emitted } = setup();
    h.pointerOver("k1", "touch");
    advance(500);
    h.pointerLeave("touch");
    expect(emitted).toEqual([]);
  });

  it("the keyboard on a topic's row lights it after the same rest; leaving the list lets go", () => {
    const { h, advance, emitted } = setup();
    h.focus("k1");
    advance(HOVER_INTENT_MS);
    expect(emitted).toEqual(["k1"]);
    h.blur(true);
    expect(emitted).toEqual(["k1"]);
    h.blur(false);
    expect(emitted).toEqual(["k1", null]);
  });

  it("dispose lets go (the panel folded or gone)", () => {
    const { h, advance, emitted } = setup();
    h.pointerOver("k1", "mouse");
    advance(200);
    h.dispose();
    h.dispose();
    expect(emitted).toEqual(["k1", null]);
  });
});

describe("the panel and the canvas are wired to it", () => {
  it("the panel body feeds pointer and keyboard to the controller (keyboard focus only: :focus-visible)", () => {
    expect(PANEL).toContain("onPointerOver={(e) => hover.pointerOver(rowTopicKey(e.target), e.pointerType)}");
    expect(PANEL).toContain("onPointerLeave={(e) => hover.pointerLeave(e.pointerType)}");
    expect(PANEL).toContain('e.target.matches(":focus-visible") ? rowTopicKey(e.target) : null');
    expect(PANEL).toContain("onBlur={(e) => hover.blur(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))}");
    // Every row of a topic says which topic it is.
    for (const cls of ["gc_tp_topic", "gc_tp_facts", "gc_tp_unloaded", "gc_tp_member"]) {
      const line = PANEL.split("\n").find((l) => l.includes("<span") && l.includes(`"${cls}`) || (l.includes("<span") && l.includes(`\`${cls}`)));
      expect(line, cls).toBeTruthy();
      expect(line, cls).toContain("data-tkey={");
    }
    expect(PANEL).toContain("useEffect(() => () => hover.dispose(), [hover]);");
    expect(PANEL).toContain("if (!open) hover.dispose();");
  });

  it("the canvas lights the hovered topic before the focused one, its memories as the emphasis", () => {
    expect(CANVAS).toContain("hoverTopicRef.current = key;");
    expect(CANVAS).toContain("const litKey = topicsOn && seated ? litTopicKey(hoveredTopic, picked) : null;");
    // Only a topic with a circle on this graph is lit by a hover.
    expect(CANVAS).toContain("(seated.rowsOf.get(hoverTopicRef.current)?.length ?? 0) > 0 ? hoverTopicRef.current : null");
    expect(CANVAS).toContain("const topicHover = hoveredTopic !== null && litRows !== null;");
    expect(CANVAS).toMatch(/if \(topicHover\) \{\n\s+emphasis = litRows;/);
    expect(CANVAS).toMatch(/const driver = topicHover\n\s+\? "filter"/);
  });
});

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
import { pathClick, rowsHover, shownRowKey, topicHover } from "./topics_panel";

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
  it("the panel body feeds pointer and keyboard to the controllers (keyboard focus only: :focus-visible)", () => {
    expect(PANEL).toMatch(/onPointerOver=\{\(e\) => \{\n\s+hover\.pointerOver\(rowTopicKey\(e\.target\), e\.pointerType\);\n\s+lights\.pointerOver\(e\.target, e\.pointerType\);/);
    expect(PANEL).toMatch(/onPointerLeave=\{\(e\) => \{\n\s+hover\.pointerLeave\(e\.pointerType\);\n\s+lights\.pointerLeave\(e\.pointerType\);/);
    expect(PANEL).toContain('const keyboard = e.target instanceof Element && e.target.matches(":focus-visible");');
    expect(PANEL).toContain("hover.focus(keyboard ? rowTopicKey(e.target) : null);");
    expect(PANEL).toContain("if (keyboard) lights.focus(e.target);");
    expect(PANEL).toContain("const stillInside = e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget);");
    expect(PANEL).toMatch(/hover\.blur\(stillInside\);\n\s+lights\.blur\(stillInside\);/);
    // Every row of a topic says which topic it is.
    for (const cls of ["gc_tp_topic", "gc_tp_facts", "gc_tp_paths_head", "gc_tp_path", "gc_tp_types_head", "gc_tp_group", "gc_tp_unloaded", "gc_tp_member"]) {
      const line = PANEL.split("\n").find((l) => l.includes("<span") && l.includes(`"${cls}`) || (l.includes("<span") && l.includes(`\`${cls}`)));
      expect(line, cls).toBeTruthy();
      expect(line, cls).toContain("data-tkey={");
    }
    expect(PANEL).toContain("useEffect(() => () => hover.dispose(), [hover]);");
    // Gone (topics off), nothing it lit stays lit; folded, neither the hover nor a clicked path
    // (but a path a phone tap framed: that tap folded the panel to show it).
    expect(PANEL).toContain("useEffect(() => () => lights.release(), [lights]);");
    expect(PANEL).toMatch(/if \(open\) return;\n\s+hover\.dispose\(\);\n\s+lights\.release\(foldedToFrame\.current\);\n\s+foldedToFrame\.current = false;/);
    expect(PANEL).toContain("useEffect(() => lights.setRows(rows), [lights, rows]);");
    expect(PANEL).toContain("useEffect(() => lights.unpin(), [focused, lights]);");
    // A row that lights memories of its own says which row it is.
    expect(PANEL.split("\n").find((l) => l.includes('`gc_tp_path gc_tp_card'))).toContain("data-rows={row.key}");
    expect(PANEL.split("\n").find((l) => l.includes('"gc_tp_group gc_tp_card"'))).toContain("data-rows={row.key}");
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

// ------------------------------------------------------------ the rows hover (backlog 0015/0016)

function setupRows() {
  const { timers, advance } = fakeTimers();
  const emitted: Array<string | null> = [];
  const h = rowsHover((k) => emitted.push(k), timers);
  return { h, advance, emitted };
}

describe("rowsHover (a path, a memory type)", () => {
  it("lights a row once the mouse has rested on it for the hover intent (150 ms); a sweep lights nothing", () => {
    const { h, advance, emitted } = setupRows();
    for (const k of ["p1", "p2", "p3"]) {
      h.pointerOver(k, "mouse");
      advance(40);
    }
    expect(emitted).toEqual([]);
    advance(HOVER_INTENT_MS - 40 - 1);
    expect(emitted).toEqual([]);
    advance(1);
    expect(emitted).toEqual(["p3"]);
  });

  it("moving to another such row keeps the lit one until the new one has rested; back on the lit one forgets the other", () => {
    const { h, advance, emitted } = setupRows();
    h.pointerOver("p1", "mouse");
    advance(200);
    h.pointerOver("p2", "mouse");
    advance(100);
    expect(emitted).toEqual(["p1"]);
    h.pointerOver("p1", "pen");
    advance(500);
    expect(emitted).toEqual(["p1"]);
    h.pointerOver("p2", "mouse");
    advance(HOVER_INTENT_MS);
    expect(emitted).toEqual(["p1", "p2"]);
  });

  it("leaving the list straight from a lit row lets go at once (the only release when the pointer exits the body from it)", () => {
    const { h, advance, emitted } = setupRows();
    h.pointerOver("p1", "mouse");
    advance(HOVER_INTENT_MS);
    expect(emitted).toEqual(["p1"]);
    h.pointerLeave("mouse");
    expect(emitted).toEqual(["p1", null]);
    h.pointerLeave("mouse");
    expect(emitted).toEqual(["p1", null]);
  });

  it("onto any other row (its topic's own, a memory) or leaving the list: let go at once", () => {
    const { h, advance, emitted } = setupRows();
    h.pointerOver("p1", "mouse");
    advance(200);
    h.pointerOver(null, "mouse");
    expect(emitted).toEqual(["p1", null]);
    h.pointerOver("p2", "mouse");
    h.pointerLeave("mouse");
    advance(500);
    expect(emitted).toEqual(["p1", null]);
  });

  it("a touch never hovers; the keyboard lights after the same rest and lets go leaving the list", () => {
    const { h, advance, emitted } = setupRows();
    h.pointerOver("p1", "touch");
    h.pointerLeave("touch");
    advance(500);
    expect(emitted).toEqual([]);
    h.focus("p1");
    advance(HOVER_INTENT_MS);
    h.focus(null);
    expect(emitted).toEqual(["p1", null]);
    h.focus("p2");
    advance(HOVER_INTENT_MS);
    h.blur(true);
    expect(emitted).toEqual(["p1", null, "p2"]);
    h.blur(false);
    h.dispose();
    expect(emitted).toEqual(["p1", null, "p2", null]);
  });

  it("the shown row: the rested one, else the clicked one, never one no longer listed", () => {
    const ids = new Map([["p1", ["a", "b"]], ["p2", ["c", "d"]]]);
    expect(shownRowKey("p2", "p1", ids)).toBe("p2");
    expect(shownRowKey(null, "p1", ids)).toBe("p1");
    expect(shownRowKey("gone", "p1", ids)).toBe("p1");
    expect(shownRowKey(null, "gone", ids)).toBeNull();
    expect(shownRowKey(null, null, ids)).toBeNull();
  });

  it("a click frames a path and keeps it lit; the same one again lets it go; another replaces it", () => {
    expect(pathClick(null, "p1")).toEqual({ pinned: "p1", frame: true });
    expect(pathClick("p1", "p1")).toEqual({ pinned: null, frame: false });
    expect(pathClick("p1", "p2")).toEqual({ pinned: "p2", frame: true });
  });

  it("the panel: a path's click and Enter go to the lights (panelLights.clickPath: topics_panel_lights.test.tsx)", () => {
    expect(PANEL).toContain("onClick={() => ctx.clickPath(row.key)}");
    expect(PANEL).toContain('else if (d.kind === "path") lights.clickPath(row.key);');
    expect(PANEL).toContain("const ctx: RowContext = { focused, shownRow, cardOf, colorOf, focus, clickPath: lights.clickPath, toggleOpen, openMember: onOpenMember };");
  });

  it("a type's memories: looked up on a hover, grouped once per answer and fold (never per render)", () => {
    expect(PANEL).toContain('for (const r of rows) if (r.data?.kind === "path" || r.data?.kind === "group") idsOf.set(r.key, r.data.ids);');
    expect(PANEL).toContain("const groupsOf = useMemo(() => groupsCache(), [communities, rowsOf, fold]);");
    expect(PANEL).toContain("topicRows(communities, expanded, rowsOf, fold, { opened, groupsOf })");
    // A type's click unfolds its memories (and the panel scrolls to them); it does not frame.
    expect(PANEL).toContain("onClick={() => ctx.toggleOpen(row.key)}>");
    expect(PANEL).toContain("if (!opened.has(rowKey)) lights.opening(rowKey);");
    expect(PANEL).toContain('else if (d.kind === "types" || d.kind === "group") toggleOpen(row.key);');
  });
});

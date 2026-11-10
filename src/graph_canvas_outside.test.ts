/**
 * THE CLOSED MEMORIES (operator 2026-11-10: "why so many isolated nodes sit
 * on the periphery arc?" — on castor's live life 132 closed memories, 2
 * engine records and 17 links between two versions of a topic, none an open
 * memory; backlog 0021: "default-hide closed records and name the toggle for
 * what they are"). The pure rule (graph_canvas_outside.ts), then the canvas
 * held to it on its source.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { closedTitle, closedWord, drawnOutside, hiddenOutside, neverJoins, outsideTopics } from "./graph_canvas_outside";
import type { FoldState, NodeState } from "./stream_fold";

const CANVAS = fs.readFileSync(path.resolve(__dirname, "graph_canvas.tsx"), "utf8");
const CSS = fs.readFileSync(path.resolve(__dirname, "graph_canvas.css"), "utf8");

const node = (id: string, over: Partial<NodeState> = {}) => ({ id, kind: "episode", closed: null, bookkeeping: false, ...over }) as NodeState;
const closedAs = (kind: string) => ({ kind, reason: "wake-cue dedup", seq: 9, replacement_ids: [] });
const CLOSED = closedAs("supersede");
const fold = (nodes: NodeState[]) => ({ nodes: new Map(nodes.map((n) => [n.id, n])) }) as unknown as FoldState;

describe("neverJoins", () => {
  it("a closed memory, an engine record and a link row never join a topic; an open memory does", () => {
    expect(neverJoins(node("a", { closed: CLOSED }))).toBe("closed");
    expect(neverJoins(node("b", { bookkeeping: true, kind: "claim" }))).toBe("engine");
    expect(neverJoins(node("c", { kind: "relation" }))).toBe("link");
    // An engine record or a link row is never a memory, closed or not.
    expect(neverJoins(node("d", { kind: "relation", closed: CLOSED }))).toBe("link");
    expect(neverJoins(node("g", { bookkeeping: true, kind: "claim", closed: CLOSED }))).toBe("engine");
    expect(neverJoins(node("e"))).toBeNull();
    expect(neverJoins(node("f", { kind: "dream" }))).toBeNull();
  });
});

describe("outsideTopics", () => {
  const f = fold([
    node("in-closed", { closed: CLOSED }), // in a circle: never counted, whatever it is
    node("in"),
    node("c1", { closed: CLOSED }),
    node("c2", { closed: closedAs("retract"), kind: "dream" }),
    node("c3", { closed: CLOSED, kind: "summary" }),
    node("l-closed", { closed: CLOSED, kind: "relation" }),
    node("eng", { bookkeeping: true, kind: "claim" }),
    node("link", { kind: "relation" }),
    node("new"), // formed since the version, no placement: joins at his next sleep
  ]);
  const circleOfRow = new Map([["in", "k1"], ["in-closed", "k1"]]);
  const o = outsideTopics(f, circleOfRow);

  it("hides every record outside the circles that never joins one; counts only the closed memories", () => {
    expect([...o.hidden].sort()).toEqual(["c1", "c2", "c3", "eng", "l-closed", "link"]);
    expect([...o.hiddenWhenShown].sort()).toEqual(["eng", "l-closed", "link"]);
    expect(o.hidden.has("new")).toBe(false);
    expect(o.hidden.has("in")).toBe(false);
    expect(o.hidden.has("in-closed")).toBe(false);
    expect({ closed: o.closed, engine: o.engine, links: o.links }).toEqual({ closed: 3, engine: 1, links: 2 });
    expect(o.closedBy).toEqual(new Map([["supersede", 2], ["retract", 1]]));
  });

  it("the toggle off leaves every one undrawn; on, only the engine records and links stay hidden", () => {
    expect(hiddenOutside(o, false)).toBe(o.hidden);
    expect(hiddenOutside(o, true)).toBe(o.hiddenWhenShown);
    expect(hiddenOutside(null, false)).toBeNull();
    // Nothing to hide: null, every record drawn.
    const none = outsideTopics(fold([node("in")]), circleOfRow);
    expect(hiddenOutside(none, false)).toBeNull();
    const closedOnly = outsideTopics(fold([node("c1", { closed: CLOSED })]), circleOfRow);
    expect(hiddenOutside(closedOnly, true)).toBeNull();
    expect(hiddenOutside(closedOnly, false)).toEqual(new Set(["c1"]));
  });

  it("names them for what they are, in words (never 'outside topics', never an id)", () => {
    expect(closedWord(3)).toBe("closed memories");
    expect(closedWord(1)).toBe("closed memory");
    expect(closedTitle(o)).toBe("3 closed memories: 2 replaced by a newer version, 1 retracted");
    // Castor's shape (2026-11-10): every one replaced.
    expect(closedTitle({ closed: 132, closedBy: new Map([["supersede", 132]]) })).toBe("132 closed memories: 132 replaced by a newer version");
    expect(closedTitle({ closed: 1, closedBy: new Map([["retract", 1]]) })).toBe("1 closed memory: 1 retracted");
    // Memory's other closure kinds are said in words; one it adds later, as it is named.
    expect(closedTitle({ closed: 4, closedBy: new Map([["merged", 1], ["reinterpreted", 1], ["supersede", 1], ["archived", 1]]) })).toBe(
      "4 closed memories: 1 replaced by a newer version, 1 merged into another memory, 1 understood differently now, 1 archived",
    );
  });
});

describe("drawnOutside", () => {
  const hidden = new Set(["c1"]);
  it("hides a hidden record unless it is the selected one; shows everything when nothing is hidden", () => {
    expect(drawnOutside(hidden, "c1", null)).toBe(false);
    expect(drawnOutside(hidden, "c1", "c1")).toBe(true);
    expect(drawnOutside(hidden, "x", null)).toBe(true);
    expect(drawnOutside(null, "c1", null)).toBe(true);
  });
});

describe("the canvas hides the closed memories until the toggle shows them", () => {
  it("computes the records once per fold and starts hidden", () => {
    expect(CANVAS).toContain("const outside = useMemo<OutsideTopics | null>(() => (membership ? outsideTopics(fold, membership.circleOfRow) : null), [fold, membership]);");
    expect(CANVAS).toContain("const [showOutside, setShowOutside] = useState(false);");
    expect(CANVAS).toContain("const hiddenRows = seated ? hiddenOutside(outsideNow, outsideShown) : null;");
  });

  it("leaves them out of the memories, both line kinds, the title placement, the pointer, Fit view and the auto-fit", () => {
    const nodes = CANVAS.indexOf("// Memory nodes (the hidden records left out).");
    expect(nodes).toBeGreaterThan(0);
    expect(CANVAS.slice(nodes, nodes + 300)).toContain("if (!drawnOutside(hiddenRows, node.id, selectedId)) continue;");
    expect(CANVAS).toContain("if (!drawnOutside(hiddenRows, se.a, selectedId) || !drawnOutside(hiddenRows, se.b, selectedId)) continue;");
    expect(CANVAS).toContain("if (!drawnOutside(hiddenRows, e.a, selectedId) || !drawnOutside(hiddenRows, e.b, selectedId)) continue;");
    expect(CANVAS).toContain("if (!drawnOutside(hiddenRows, ln.id, selectedId)) continue;\n            const p = toScreen(ln.x, ln.y);");
    expect(CANVAS).toContain("if (!drawnOutside(hidden, ln.id, sel)) continue; // not drawn: not under the pointer");
    expect(CANVAS).toContain(".filter((n) => drawnOutside(hiddenRowsRef.current, n.id, selectedRow));");
    expect(CANVAS).toContain("if (!drawnOutside(hiddenRows, n.id, selectedId)) continue;\n          minX = Math.min(minX, n.x);");
    // The title placement re-runs when the ring shows or hides.
    expect(CANVAS).toMatch(/const titlesKey = `[^`]*\|\$\{hiddenRows \? hiddenRows\.size : "all"\}\|\$\{litKey\}`;/);
  });

  it("one pressed toggle, served only, '◌ <count> closed memories' (the count stays on a phone)", () => {
    const at = CANVAS.indexOf("{served && outside && outside.closed > 0 ? (");
    expect(at).toBeGreaterThan(CANVAS.indexOf("⛶ <span"));
    const block = CANVAS.slice(at, at + 700);
    expect(block).toContain('className={`gc_btn gc_outside_toggle ${showOutside ? "gc_btn_on" : ""}`}');
    expect(block).toContain("aria-pressed={showOutside}");
    expect(block).toContain("title={closedTitle(outside)}");
    expect(block).toContain("onClick={() => setShowOutside((v) => !v)}");
    expect(block).toContain('◌ <span className="gc_btn_count">{outside.closed}</span>');
    expect(block).toContain('<span className="gc_btn_word">{closedWord(outside.closed)}</span>');
  });

  it("the words 'outside topics' are gone from the canvas and its styles", () => {
    expect(CANVAS).not.toMatch(/outside (his )?topics/i);
    expect(CSS).not.toMatch(/outside (his )?topics/i);
  });

  it("the panel's 'newer memories' line no longer counts records that never join a topic (castor's 2 engine records)", () => {
    expect(CANVAS).toContain("if (!membership.circleOfRow.has(node.id) && neverJoins(node) === null) n += 1;");
  });
});

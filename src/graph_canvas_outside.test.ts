/**
 * THE RING OUTSIDE HIS TOPICS (operator 2026-11-10: "why so many isolated
 * nodes sit on the periphery arc?" — on castor's live life 149 closed records
 * and 2 engine records, none an open memory). The pure rule
 * (graph_canvas_outside.ts), then the canvas held to it on its source.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { drawnOutside, neverJoins, OUTSIDE_WORD, outsideTitle, outsideTopics } from "./graph_canvas_outside";
import type { FoldState, NodeState } from "./stream_fold";

const CANVAS = fs.readFileSync(path.resolve(__dirname, "graph_canvas.tsx"), "utf8");

const node = (id: string, over: Partial<NodeState> = {}) => ({ id, kind: "episode", closed: null, bookkeeping: false, ...over }) as NodeState;
const CLOSED = { kind: "supersede", reason: "wake-cue dedup", seq: 9, replacement_ids: [] };
const fold = (nodes: NodeState[]) => ({ nodes: new Map(nodes.map((n) => [n.id, n])) }) as unknown as FoldState;

describe("neverJoins", () => {
  it("a closed record, an engine record and a link row never join a topic; an open memory does", () => {
    expect(neverJoins(node("a", { closed: CLOSED }))).toBe("closed");
    expect(neverJoins(node("b", { bookkeeping: true, kind: "claim" }))).toBe("engine");
    expect(neverJoins(node("c", { kind: "relation" }))).toBe("link");
    expect(neverJoins(node("d", { kind: "relation", closed: CLOSED }))).toBe("closed");
    expect(neverJoins(node("e"))).toBeNull();
    expect(neverJoins(node("f", { kind: "dream" }))).toBeNull();
  });
});

describe("outsideTopics", () => {
  const f = fold([
    node("in-closed", { closed: CLOSED }), // in a circle: never counted, whatever it is
    node("in"),
    node("c1", { closed: CLOSED }),
    node("c2", { closed: CLOSED, kind: "relation" }),
    node("eng", { bookkeeping: true, kind: "claim" }),
    node("link", { kind: "relation" }),
    node("new"), // formed since the version, no placement: joins at his next sleep
  ]);
  const circleOfRow = new Map([["in", "k1"], ["in-closed", "k1"]]);
  const o = outsideTopics(f, circleOfRow);

  it("hides only the records outside every circle that never join one", () => {
    expect([...o.hidden].sort()).toEqual(["c1", "c2", "eng", "link"]);
    expect(o.hidden.has("new")).toBe(false);
    expect(o.hidden.has("in")).toBe(false);
    expect(o.hidden.has("in-closed")).toBe(false);
    expect({ closed: o.closed, engine: o.engine, links: o.links }).toEqual({ closed: 2, engine: 1, links: 1 });
  });

  it("says what they are and what the toggle does", () => {
    expect(OUTSIDE_WORD).toBe("outside topics");
    expect(outsideTitle(o, false)).toBe("4 records outside his topics: 2 closed (rewritten, merged or retracted), 1 engine record, 1 link. They never join a topic. Hidden — click to show them on the ring around the graph.");
    expect(outsideTitle(o, true)).toMatch(/Shown on the ring around the graph — click to hide them\.$/);
    // Castor's shape: 149 closed, 2 engine records.
    const castor = { hidden: new Set(Array.from({ length: 151 }, (_, i) => `r${i}`)), closed: 149, engine: 2, links: 0 };
    expect(outsideTitle(castor, false)).toBe("151 records outside his topics: 149 closed (rewritten, merged or retracted), 2 engine records. They never join a topic. Hidden — click to show them on the ring around the graph.");
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

describe("the canvas hides the ring until the toggle shows it", () => {
  it("computes the records once per fold and starts hidden", () => {
    expect(CANVAS).toContain("const outside = useMemo<OutsideTopics | null>(() => (membership ? outsideTopics(fold, membership.circleOfRow) : null), [fold, membership]);");
    expect(CANVAS).toContain("const [showOutside, setShowOutside] = useState(false);");
    expect(CANVAS).toContain("const hiddenRows = seated && outsideNow && !outsideShown && outsideNow.hidden.size > 0 ? outsideNow.hidden : null;");
  });

  it("leaves them out of the memories, both line kinds, the title placement, the pointer, Fit view and the auto-fit", () => {
    const nodes = CANVAS.indexOf("// Memory nodes (the hidden ring outside his topics left out).");
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

  it("one pressed toggle, served only, '◌ <count> outside topics' (the count stays on a phone)", () => {
    const at = CANVAS.indexOf("{served && outside && outside.hidden.size > 0 ? (");
    expect(at).toBeGreaterThan(CANVAS.indexOf("⛶ <span"));
    const block = CANVAS.slice(at, at + 700);
    expect(block).toContain('className={`gc_btn gc_outside_toggle ${showOutside ? "gc_btn_on" : ""}`}');
    expect(block).toContain("aria-pressed={showOutside}");
    expect(block).toContain("title={outsideTitle(outside, showOutside)}");
    expect(block).toContain("onClick={() => setShowOutside((v) => !v)}");
    expect(block).toContain('◌ <span className="gc_btn_count">{outside.hidden.size}</span>');
    expect(block).toContain('<span className="gc_btn_word">{OUTSIDE_WORD}</span>');
  });

  it("the panel's 'newer memories' line no longer counts records that never join a topic (castor's 2 engine records)", () => {
    expect(CANVAS).toContain("if (!membership.circleOfRow.has(node.id) && neverJoins(node) === null) n += 1;");
  });
});

/**
 * THE ARTIFACT'S OWN LAW (graph-as-data, theme-3 build c4109): schema
 * pins on spec/cognition_graph.json — the one source the render derives
 * from. These are the structural guarantees the editability adversary
 * named: constitutional edges FORBID toggles by schema (never by UI
 * politeness), every row names its owner, states are the closed set,
 * and activity is never stored (only the toggle path is).
 */
import { describe, expect, it } from "vitest";

import graph from "../spec/cognition_graph.json";

const SEATS = new Set(["memory", "runtime", "gateway", "agent", "entity"]);
const nodes = (graph as { nodes: Array<Record<string, unknown>> }).nodes;
const edges = (graph as { edges: Array<Record<string, unknown>> }).edges;

describe("cognition_graph.json — the schema law", () => {
  it("versioned artifact with the two collections", () => {
    expect((graph as { version: number }).version).toBeGreaterThanOrEqual(1);
    expect(nodes.length).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);
  });

  it("every node names an owner seat, a lane, a kind, and world-constant layout", () => {
    for (const n of nodes) {
      expect(SEATS.has(String(n.owner)), `${n.id} owner`).toBe(true);
      expect(String(n.lane).length, `${n.id} lane`).toBeGreaterThan(2);
      expect(["store", "act", "gate", "sleep"]).toContain(n.kind);
      const l = n.layout as { x: number; y: number; w: number; h: number };
      expect(l.w).toBeGreaterThan(0);
      expect(l.h).toBeGreaterThan(0);
    }
  });

  it("every edge: real endpoints, a verb label, a closed-set status, an owner, a unique id", () => {
    const ids = new Set(nodes.map((n) => String(n.id)));
    const seen = new Set<string>();
    for (const e of edges) {
      expect(ids.has(String(e.from)), `unknown from ${e.from}`).toBe(true);
      expect(ids.has(String(e.to)), `unknown to ${e.to}`).toBe(true);
      expect(String(e.label).trim().length, `${e.id} label`).toBeGreaterThan(3);
      expect(["wired", "declared", "anti"]).toContain(e.status);
      expect(SEATS.has(String(e.owner)), `${e.id} owner`).toBe(true);
      expect(seen.has(String(e.id)), `duplicate id ${e.id}`).toBe(false);
      seen.add(String(e.id));
    }
  });

  it("CONSTITUTIONAL edges carry NO toggle field — the schema forbids it, never the UI (the self_fraction-floor logic on edges)", () => {
    const constitutional = edges.filter((e) => e.protection === "constitutional");
    // EXACTLY the proposed seven (wave adversary P1-3: the >= floor + a
    // six-key list let the diary projection be silently
    // de-constitutionalized with the suite green — the exact row the
    // privacy stakes sit on. The set is pinned closed; changing it is a
    // deliberate spec act, never a drift).
    const keys = constitutional.map((e) => `${e.from}->${e.to}`).sort();
    expect(keys).toEqual(["deposit->s1", "dream->sleepw", "enact->s3", "prompt->deposit", "s1->recall", "s2->s1", "s3->recall", "turn->s1"]);
    for (const e of constitutional) {
      expect(e.toggle, `${e.id} must never carry a toggle`).toBeUndefined();
    }
  });

  it("toggle paths RESOLVE against the phase graph's tunables (wave adversary P2: a dotted-shape regex never caught a dial that does not exist)", async () => {
    const phases = (await import("../spec/entity_phases.json")) as unknown as { tunables: Record<string, unknown> };
    const toggled = edges.filter((e) => typeof e.toggle === "string");
    for (const e of toggled) {
      const path = String(e.toggle).split(".");
      let cur: unknown = phases.tunables;
      for (const key of path) {
        expect(cur && typeof cur === "object", `${e.id} toggle path dead at ${key}`).toBe(true);
        cur = (cur as Record<string, unknown>)[key];
      }
      expect(cur, `${e.id} toggle resolves to no value`).toBeDefined();
    }
    // P1-1's fix pinned: the cycle dial rides the dedicated cycle edge,
    // never the settled-desk leg (whose preconditions exclude the cycle).
    const settled = edges.find((e) => e.id === "gate->sleepw");
    expect(settled?.toggle).toBeUndefined();
    const cycle = edges.find((e) => e.id === "gate->sleepw#2");
    expect(cycle?.toggle).toBe("personal_cycle.enabled");
    expect(String(cycle?.label)).toContain("cycle");
  });

  it("every edge carries a label_class from the artifact's OWN declared enum (semantics c4147: the declaration lives in the data, the test validates against it)", () => {
    const declared = Object.keys((graph as { label_classes?: Record<string, unknown> }).label_classes ?? {}).filter((k) => k !== "$comment");
    expect(declared.sort()).toEqual(["election-grammar", "engraved-relation", "flow"]);
    for (const e of edges) {
      expect(declared).toContain(e.label_class);
    }
    // The first-token rule (c4147 precision 2): a key= label is
    // election-grammar regardless of the prose after it.
    for (const e of edges) {
      if (/^[a-z_]+=/.test(String(e.label))) {
        expect(e.label_class, `${e.id} first-token rule`).toBe("election-grammar");
      }
    }
  });

  it("the map_source handshake: the artifact's prose-map claim matches the vendored header (the c4032 data↔prose leg)", async () => {
    const claim = String((graph as { map_source?: string }).map_source ?? "");
    const m = claim.match(/v(\d+)/);
    expect(m, "map_source names a version").toBeTruthy();
    const { readFileSync } = await import("node:fs");
    const doc = readFileSync(new URL("../spec/cognitive-memory-pathways.vendored.md", import.meta.url), "utf8");
    const header = doc.match(/^# Cognitive-Memory Pathway Graph — v(\d+)/);
    expect(m![1]).toBe(header![1]);
  });

  it("toggle-backed edges declare off_behavior (the cycle's clock-keeps-counting template) and point at a real dial path", () => {
    const toggled = edges.filter((e) => typeof e.toggle === "string");
    expect(toggled.length).toBeGreaterThanOrEqual(1);
    for (const e of toggled) {
      expect(String(e.off_behavior ?? "").length, `${e.id} off_behavior`).toBeGreaterThan(10);
      // Dial paths resolve against the phase graph's tunables (the one
      // dial namespace) — dotted path shape, never a bare word.
      expect(String(e.toggle)).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
    }
  });

  it("ACTIVITY is never stored: no edge carries an enabled/disabled/active field (derived from the overlay, the two-copies law)", () => {
    for (const e of edges) {
      for (const forbidden of ["enabled", "disabled", "active"]) {
        expect((e as Record<string, unknown>)[forbidden], `${e.id} stores activity`).toBeUndefined();
      }
    }
  });

  it("the render derives from the artifact — the panel arrays are row-for-row views (no hand-tuned survivor)", async () => {
    const { BLUEPRINT_NODES, BLUEPRINT_EDGES, COGNITION_GRAPH_VERSION } = await import("./blueprint_panel");
    expect(COGNITION_GRAPH_VERSION).toBe((graph as { version: number }).version);
    expect(BLUEPRINT_NODES.length).toBe(nodes.length);
    expect(BLUEPRINT_EDGES.length).toBe(edges.length);
    // Spot-honesty: a node's layout in the render IS the artifact's.
    const first = nodes[0] as { id: string; layout: { x: number } };
    const rendered = BLUEPRINT_NODES.find((n) => n.id === first.id);
    expect(rendered?.x).toBe(first.layout.x);
    // The source file carries no literal node-array rows anymore.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./blueprint_panel.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/BLUEPRINT_NODES: BpNode\[\] = \[\s*\n\s*\/\/ ──/);
    expect(src).toContain('from "../spec/cognition_graph.json"');
  });

  it("every constitutional edge is RATIFIED BY PRECEDENT (c4779): ratified_by names its standing ruling", () => {
    const cons = graph.edges.filter((e) => e.protection === "constitutional");
    expect(cons.length).toBe(8);
    for (const e of cons) {
      expect(typeof (e as { ratified_by?: string }).ratified_by).toBe("string");
      expect(((e as { ratified_by?: string }).ratified_by ?? "").length).toBeGreaterThan(20);
    }
  });
});

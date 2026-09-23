import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BLUEPRINT_EDGES, BLUEPRINT_NODES, BLUEPRINT_VERSION } from "./blueprint_panel";

// The blueprint's ONE contract is fidelity to the pathway map. These pins
// are the adversary's finding 10 made mechanical (the diary_type-clamp
// class): a map bump without a panel review fails here instead of
// drifting silently under a stale vintage stamp.

describe("memory blueprint — fidelity machinery", () => {
  it("the vintage stamp equals the vendored map's header version (the drift handshake)", () => {
    const doc = readFileSync(new URL("../spec/cognitive-memory-pathways.vendored.md", import.meta.url), "utf8");
    const m = doc.match(/^# Cognitive-Memory Pathway Graph — v(\d+)/);
    expect(m, "vendored map must carry the versioned header").toBeTruthy();
    const panelVersion = BLUEPRINT_VERSION.match(/^v(\d+)/)?.[1];
    expect(panelVersion).toBe(m![1]);
  });

  it("every edge endpoint names a real node, every edge carries a verb label", () => {
    const ids = new Set(BLUEPRINT_NODES.map((n) => n.id));
    for (const e of BLUEPRINT_EDGES) {
      expect(ids.has(e.from), `unknown from: ${e.from}`).toBe(true);
      expect(ids.has(e.to), `unknown to: ${e.to}`).toBe(true);
      // Observer's lesson: an unlabeled arrow is decoration, not a graph.
      expect(e.label.trim().length).toBeGreaterThan(3);
    }
  });

  it("the honesty classes are present: at least one NOT-BUILT dash and exactly one anti-edge", () => {
    expect(BLUEPRINT_EDGES.filter((e) => e.kind === "missing").length).toBeGreaterThanOrEqual(2);
    const anti = BLUEPRINT_EDGES.filter((e) => e.kind === "anti");
    expect(anti).toHaveLength(1);
    expect(anti[0].from).toBe("dream");
    expect(anti[0].to).toBe("sleepw");
  });

  it("the adversary's four missing highways are drawn LIVE (desk settlement, E8a, next-cue, rest election)", () => {
    const key = (e: { from: string; to: string }) => `${e.from}->${e.to}`;
    const live = new Set(BLUEPRINT_EDGES.filter((e) => e.kind === "live").map(key));
    expect(live.has("turn->s5")).toBe(true); // resolves= settles (chat lanes)
    expect(live.has("sleepw->s1")).toBe(true); // E8a — the day answers the night
    expect(live.has("turn->turn")).toBe(true); // next-cue self-continuation
    expect(live.has("turn->sleepw")).toBe(true); // rest election
  });

  it("v7: the stimulus lanes are drawn (dm#112 — 'i don't see the stimuli') and valence has its write edges", () => {
    const ids = new Set(BLUEPRINT_NODES.map((n) => n.id));
    for (const id of ["stim", "recall", "deposit"]) expect(ids.has(id), id).toBe(true);
    const key = (e: { from: string; to: string }) => `${e.from}->${e.to}`;
    const live = new Set(BLUEPRINT_EDGES.filter((e) => e.kind === "live").map(key));
    expect(live.has("stim->recall")).toBe(true);
    expect(live.has("recall->prompt")).toBe(true);
    expect(live.has("prompt->deposit")).toBe(true);
    expect(live.has("deposit->s1")).toBe(true); // the Hebbian strengthening
    // s6 had NO incoming edge — "feelings are never written" under the
    // map's own absence formalism. Feelings are election-only, and the
    // two elected writers render.
    expect(live.has("elections->s6")).toBe(true);
    expect(live.has("close->s6")).toBe(true);
    // The identity feed moved to recall (reserved seats are a recall-time
    // admission, not a prompt decoration).
    expect(live.has("s3->recall")).toBe(true);
  });

  it("v7: no painted numeral shadows a dial or engine constant (cells adversary P0-1)", () => {
    // Dial the cadence to 3h and a painted "6h cadence" teaches a lie on
    // the source-of-truth page. Dial-governed and constant-shadowing
    // numerals are stripped from render labels; served values arrive with
    // the params lane. (Law bounds like the v9 ≤6h CAP are refusal bounds
    // in tunables_meta — those may stay.)
    const text = [...BLUEPRINT_NODES.map((n) => `${n.label} ${n.sub ?? ""}`), ...BLUEPRINT_EDGES.map((e) => e.label)].join(" | ");
    for (const shadow of ["6h cadence", "≥20h", "≤12", "≥3,", "±1..3", "cap 5"]) {
      expect(text, `painted numeral: ${shadow}`).not.toContain(shadow);
    }
  });

  it("v7: the footnote carries the D1 law correction (deposits are automatic for stimulus-surfaced; his reach is a pure read)", () => {
    const src = readFileSync(new URL("./blueprint_panel.tsx", import.meta.url), "utf8");
    expect(src).toContain("strengthens AUTOMATICALLY at commit");
    expect(src).toContain("deposits nothing, pure reads");
    expect(src).not.toContain("only his own reach strengthens");
  });

  it("nodes do not overlap (fixed world-coordinate discipline)", () => {
    for (let i = 0; i < BLUEPRINT_NODES.length; i += 1) {
      for (let j = i + 1; j < BLUEPRINT_NODES.length; j += 1) {
        const a = BLUEPRINT_NODES[i];
        const b = BLUEPRINT_NODES[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});

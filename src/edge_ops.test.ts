/**
 * The edge-ops editing logic (structural-edit build c4837, editor half):
 * wholesale-document composition, three-tier honesty labels from the
 * artifact's law, courtesy refusals that never over-allow.
 */
import { describe, expect, it } from "vitest";

import graph from "../spec/entity_phases.json";
import { addPreviewRefusal, composeOps, edgeId, foldRows, honestyLabel, localRefusal, type SpecTransition } from "./edge_ops";

const TRANSITIONS = graph.transitions as unknown as SpecTransition[];
const REGISTRY = (graph as unknown as Record<string, unknown>).cause_evaluators as Record<string, { status?: string }>;
const PHASES = Object.keys(graph.phases);

describe("honesty labels derive from the ARTIFACT's law (never a client table)", () => {
  it("door rows say 'changes nothing', operator rows say 'above the graph', the election says 'ruled right'", () => {
    const door = TRANSITIONS.find((t) => t.edge_id === "sleep->visit#visit_open")!;
    expect(honestyLabel(door).tier).toBe("fact");
    const oper = TRANSITIONS.find((t) => t.edge_id === "personal->sleep#operator")!;
    expect(honestyLabel(oper).tier).toBe("act");
    const election = TRANSITIONS.find((t) => t.edge_id === "personal->sleep#self_elected")!;
    expect(honestyLabel(election).tier).toBe("election");
    const loop = TRANSITIONS.find((t) => t.edge_id === "sleep->work#cadence_need_check")!;
    expect(honestyLabel(loop).tier).toBe("enforced");
    const dial = TRANSITIONS.find((t) => t.edge_id === "personal->sleep#personal_cycle")!;
    expect(honestyLabel(dial).text).toContain("dial");
  });
});

describe("ops-set composition is WHOLESALE (document ownership, c4934)", () => {
  it("fold + compose round-trips the stored op set byte-equivalently", () => {
    const ops = [
      { op: "remove" as const, edge: "sleep->work#cadence_need_check" },
      { op: "redirect" as const, edge: "work->sleep#task_complete", to: "personal", instruction: "wrap up gently" },
      { op: "add" as const, from: "personal", to: "work", cause: "no_task", bound_h: 0.5 },
    ];
    const { rows, orphans } = foldRows(TRANSITIONS, ops);
    expect(orphans).toEqual([]);
    const out = composeOps(rows);
    expect(out).toHaveLength(3);
    expect(out.find((o) => o.op === "remove")?.edge).toBe("sleep->work#cadence_need_check");
    expect(out.find((o) => o.op === "redirect")?.to).toBe("personal");
    expect(out.find((o) => o.op === "add")?.bound_h).toBe(0.5);
  });

  it("orphan ops (unknown edge ids) surface, never silently drop", () => {
    const { orphans } = foldRows(TRANSITIONS, [{ op: "remove", edge: "mars->venus#warp" }]);
    expect(orphans).toHaveLength(1);
  });

  it("base rows contribute no ops — an untouched graph composes to the empty list (which CLEARS server-side)", () => {
    const { rows } = foldRows(TRANSITIONS, []);
    expect(composeOps(rows)).toEqual([]);
  });
});

describe("courtesy refusals never over-allow (the door is the law)", () => {
  it("locked rows refuse remove/redirect naming their ruling", () => {
    const composite = TRANSITIONS.find((t) => t.edge_id === "personal->sleep#operator");
    expect(localRefusal(composite, "remove")).toContain("locked");
    const election = TRANSITIONS.find((t) => t.edge_id === "personal->sleep#self_elected");
    expect(localRefusal(election, "remove")).toContain("locked");
  });

  it("redirect is gated to consultable rows; the dial row refuses BOTH ops naming the dial (two levers, one law)", () => {
    const dial = TRANSITIONS.find((t) => t.edge_id === "personal->sleep#personal_cycle");
    expect(localRefusal(dial, "redirect")).toContain("DIAL");
    expect(localRefusal(dial, "remove")).toContain("DIAL");
    const restore = TRANSITIONS.find((t) => t.edge_id === "visit->personal#visit_close");
    expect(localRefusal(restore, "redirect")).toBeNull();
  });

  it("P0-2 fold: the consultable-redirect door rows say the redirect lever is REAL, never 'changes nothing'", () => {
    const restore = TRANSITIONS.find((t) => t.edge_id === "visit->personal#visit_close")!;
    expect(honestyLabel(restore).text).toContain("redirect is real");
    const pureDoor = TRANSITIONS.find((t) => t.edge_id === "sleep->visit#visit_open")!;
    expect(honestyLabel(pureDoor).text).toContain("changes nothing");
  });

  it("add preview: reserved refuses, visit landings refuse, non-predicate classes refuse (P1-4), duplicates refuse, sub-tick bounds refuse", () => {
    const ids = new Set(TRANSITIONS.map((t) => edgeId(t)));
    expect(addPreviewRefusal(PHASES, REGISTRY, ids, { from: "personal", to: "work", cause: "crash_recovered" })).toContain("reserved");
    expect(addPreviewRefusal(PHASES, REGISTRY, ids, { from: "personal", to: "visit", cause: "operator" })).toContain("visit");
    // P1-4: door facts / operator acts / entity acts are not machine
    // triggers — a new edge on them is dead law and refuses at preview.
    expect(addPreviewRefusal(PHASES, REGISTRY, ids, { from: "personal", to: "work", cause: "operator" })).toContain("operator act");
    expect(addPreviewRefusal(PHASES, REGISTRY, ids, { from: "personal", to: "sleep", cause: "self_elected" })).toContain("entity act");
    // Duplicate identity refuses on an evaluated predicate (the class
    // gate no longer masks it): sleep->work#cadence_need_check exists.
    expect(addPreviewRefusal(PHASES, REGISTRY, ids, { from: "sleep", to: "work", cause: "cadence_need_check" })).toContain("identity exists");
    expect(addPreviewRefusal(PHASES, REGISTRY, ids, { from: "personal", to: "work", cause: "no_task", bound_h: 0.001 })).toContain("finite");
    expect(addPreviewRefusal(PHASES, REGISTRY, ids, { from: "personal", to: "work", cause: "no_task", bound_h: Number.NaN })).toContain("finite");
    expect(addPreviewRefusal(PHASES, REGISTRY, ids, { from: "personal", to: "work", cause: "no_task" })).toBeNull();
  });

  it("added rows (no authority) label PROPOSED-declared, never enforced (P1-3)", () => {
    expect(honestyLabel({ from: "personal", to: "work", cause: "no_task" }).tier).toBe("proposed");
  });
});

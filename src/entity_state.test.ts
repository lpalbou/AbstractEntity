import { describe, it, expect } from "vitest";

import { dayCauseLine, ownVisitSignal } from "./entity_state";

// The client derive machine these files once pinned is gone (2026-11-08): the phase is served whole
// by GET /life_state and drawn by the phase bar (phase_bar.test.ts). What stays client-side is pinned
// here.
describe("the two client folds that stay", () => {
  it("dayCauseLine folds the gate's wire words to operator lines; degrade warns; unknown kinds verbatim-labeled; absent = null", () => {
    expect(dayCauseLine({ kind: "drives", detail: "3 alive of 71 standing" })).toEqual({
      text: "personal day arose from his desk — 3 alive of 71 standing",
      warn: false,
    });
    expect(dayCauseLine({ kind: "work_order", detail: "work_order.md" })?.text).toContain("a task stands");
    expect(dayCauseLine({ kind: "settled_desk" })?.text).toContain("settled desk");
    expect(dayCauseLine({ kind: "grant_degraded", detail: "drive_pressure read failed" })).toEqual({
      text: "#FALLBACK day-gate degrade — drive_pressure read failed",
      warn: true,
    });
    expect(dayCauseLine({ kind: "granted_unused", detail: "0.3h of granted personal time used; the 2h floor stands" })?.text).toContain("the grant stood unused");
    expect(dayCauseLine({ kind: "future_kind" })?.text).toBe("day cause: future_kind");
    expect(dayCauseLine(undefined)).toBeNull();
    expect(dayCauseLine({})).toBeNull();
  });

  it("ownVisitSignal — the pure forcing rule (render adversary pin 7)", () => {
    // Mid-turn forces even when the poll is older than the turn.
    expect(ownVisitSignal(null, "r1", "turn")).toEqual({ open: true, runId: "r1", midTurn: true, owned: true });
    // A poll-asserted open visit forces; owned iff the held id matches.
    expect(ownVisitSignal({ open: true, run_id: "r1" }, "r1", "idle")).toEqual({ open: true, runId: "r1", midTurn: false, owned: true });
    expect(ownVisitSignal({ open: true, run_id: "r2" }, "r1", "idle")?.owned).toBe(false);
    expect(ownVisitSignal({ open: true, run_id: "r2" }, null, "idle")?.open).toBe(true);
    // A closed poll never forces — regardless of any held run id (the
    // reaper closed it; a stale id must not paint a dead visit live).
    expect(ownVisitSignal({ open: false }, "r1", "idle")).toBeNull();
    expect(ownVisitSignal(null, "r1", "idle")).toBeNull();
    // Opening/closing busy states are NOT mid-turn (impl adversary P2-8):
    // "opening" with no server-asserted open yet does not force (the open
    // may still be refused); "closing" with the poll still open DOES ride
    // the poll (server-asserted until the close lands).
    expect(ownVisitSignal(null, null, "opening")).toBeNull();
    expect(ownVisitSignal({ open: true, run_id: "r1" }, "r1", "closing")?.open).toBe(true);
    expect(ownVisitSignal({ open: false }, "r1", "closing")).toBeNull();
  });
});

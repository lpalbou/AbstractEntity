/**
 * Phase-time accounting (operator 2026-07-15): the observed life divided
 * across visit / work / personal / sleep + untracked span, reconstructed from
 * host markers. Pure — no I/O.
 */

import { describe, expect, it } from "vitest";

import { computePhaseTime, humanDuration } from "./phase_time";
import type { SessionMarker } from "./stream_fold";

function marker(kind: string, iso: string, seq: number): SessionMarker {
  return { kind, session_id: null, run_id: "r1", seq, observed_at: iso, details: {} };
}

const H = (h: number) => `2026-07-15T${String(h).padStart(2, "0")}:00:00Z`;

describe("computePhaseTime", () => {
  it("empty / single marker → no data (home-direct lives)", () => {
    expect(computePhaseTime([]).hasData).toBe(false);
    expect(computePhaseTime([marker("summon", H(1), 1)]).hasData).toBe(false);
  });

  it("a closed visit accrues visit time", () => {
    const r = computePhaseTime([marker("summon", H(1), 1), marker("session_closed", H(3), 2)], Date.parse(H(3)));
    const visit = r.slices.find((s) => s.phase === "visit")!;
    expect(visit.ms).toBe(2 * 3600_000);
    expect(visit.fraction).toBeCloseTo(1, 3);
  });

  it("a gap between phases is untracked (coverage gap)", () => {
    // visit 1-2h, then idle 2-4h, then sleep 4-5h.
    const r = computePhaseTime(
      [marker("summon", H(1), 1), marker("session_closed", H(2), 2), marker("sleep", H(4), 3), marker("wake", H(5), 4)],
      Date.parse(H(5)),
    );
    const by = Object.fromEntries(r.slices.map((s) => [s.phase, s.ms / 3600_000]));
    expect(by.visit).toBe(1);
    expect(by.sleep).toBe(1);
    expect(by.untracked).toBe(2); // the 2-4h gap
    expect(by.work).toBe(0); // no work markers ever
  });

  it("visit SUPPRESSES an overlapping sleep/personal (one-derived-state priority)", () => {
    // personal opens at 1h, a visit interrupts 2-3h, personal still 'open'
    // underneath resumes 3-4h when the visit closes.
    const r = computePhaseTime(
      [
        marker("personal_started", H(1), 1),
        marker("summon", H(2), 2),
        marker("session_closed", H(3), 3),
        marker("personal_stop_requested", H(4), 4),
      ],
      Date.parse(H(4)),
    );
    const by = Object.fromEntries(r.slices.map((s) => [s.phase, s.ms / 3600_000]));
    expect(by.visit).toBe(1); // 2-3h, wins the overlap
    expect(by.personal).toBe(2); // 1-2h + 3-4h, suppressed 2-3h
  });

  it("the tail from the last marker to now counts in the still-open phase", () => {
    // sleep opens at 1h, never closed; now is 3h → 2h of sleep.
    const r = computePhaseTime([marker("sleep", H(1), 1), marker("personal_started", H(1), 2)], Date.parse(H(3)));
    // personal opened same ms after sleep, but sleep>personal by priority.
    const by = Object.fromEntries(r.slices.map((s) => [s.phase, s.ms / 3600_000]));
    expect(by.sleep).toBe(2);
  });

  it("fractions sum to ~1 over the observed span", () => {
    const r = computePhaseTime(
      [marker("summon", H(1), 1), marker("session_closed", H(2), 2), marker("sleep", H(3), 3), marker("wake", H(5), 4)],
      Date.parse(H(5)),
    );
    const total = r.slices.reduce((a, s) => a + s.fraction, 0);
    expect(total).toBeCloseTo(1, 2);
  });

  it("ignores markers with unparseable timestamps", () => {
    const r = computePhaseTime([marker("summon", "not-a-date", 1), marker("session_closed", H(2), 2), marker("wake", H(3), 3)]);
    // Only two valid boundary markers remain (session_closed + wake).
    expect(r.markerCount).toBe(2);
  });
});

describe("humanDuration", () => {
  it("scales sensibly", () => {
    expect(humanDuration(30_000)).toBe("<1m");
    expect(humanDuration(5 * 60_000)).toBe("5m");
    expect(humanDuration(3 * 3600_000)).toBe("3h");
    expect(humanDuration(50 * 3600_000)).toBe("2d 2h");
    expect(humanDuration(48 * 3600_000)).toBe("2d");
  });
});

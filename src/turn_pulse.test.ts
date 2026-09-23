/**
 * The pulse extractor's pins (operator 2026-08-01: the thinking bars mean
 * something now — so their numbers must be provably honest; hardened per
 * the pulse adversary's findings F1/F4/N2/N3):
 * - seq boundary: only envelopes PAST the turn start count (the same
 *   exclusive window the activity lines read), via a BACKWARD walk that
 *   stops at the boundary (the tail is ~90k envelopes at operator scale).
 * - absent-not-zero: no trace → shelf null; no snapshot estimate → tokens
 *   null; a trace without candidates OR budget_spent → considered null (a
 *   fabricated denominator was N2).
 * - true-count-first (operator 2026-08-01 audit: the bars read the trace's
 *   capped candidates list — 64 — while the true pools ran 321-463):
 *   budget_spent.candidates_considered wins over candidates.length.
 * - newest-wins: a re-recall mid-turn replaces the shelf read.
 * - formed counts REMEMBER-sourced non-bookkeeping bindings only (F4:
 *   pin/silence and engram/reembed acts are not memories he formed).
 * - malformed payloads are skipped, never guessed at.
 */

import { describe, expect, it } from "vitest";

import { fmtTokens, RECALL_TOKENS_SCALE, turnPulse } from "./turn_pulse";

const trace = (seq: number, selected: number, considered?: number) => ({
  seq,
  family: "trace",
  payload: {
    selected: Array(selected).fill("id"),
    ...(considered === undefined ? {} : { candidates: Array(considered).fill("id") }),
  },
});
const snapshot = (seq: number, est?: number) => ({
  seq,
  family: "snapshot",
  payload: est === undefined ? {} : { used_record_ids: [], prompt_token_estimate: est },
});
const formedBinding = (seq: number, display: Record<string, unknown> = { kind: "episode", title: "exchange: hello" }) => ({
  seq,
  family: "binding",
  payload: { source: "remember" },
  display,
});

describe("turnPulse", () => {
  it("starts absent — null shelf, null tokens, zero formed (never zero-faked reads)", () => {
    expect(turnPulse([], 10)).toEqual({ shelf: null, recallTokens: null, formed: 0 });
  });

  it("reads only past the turn-start seq (exclusive — the activity lines' window)", () => {
    const p = turnPulse([trace(5, 9, 20), snapshot(10, 5000)], 10);
    expect(p.shelf).toBeNull();
    expect(p.recallTokens).toBeNull();
  });

  it("folds recall + snapshot + formed from the live window", () => {
    const p = turnPulse([trace(11, 50, 64), snapshot(12, 3200), formedBinding(13)], 10);
    expect(p.shelf).toEqual({ selected: 50, considered: 64 });
    expect(p.recallTokens).toBe(3200);
    expect(p.formed).toBe(1);
  });

  it("a re-recall mid-turn replaces the shelf (the newest recall IS the shelf)", () => {
    const p = turnPulse([trace(11, 50, 64), trace(15, 12, 30)], 10);
    expect(p.shelf).toEqual({ selected: 12, considered: 30 });
  });

  it("a trace without candidates keeps considered null — never a fabricated denominator (N2)", () => {
    expect(turnPulse([trace(11, 9)], 10).shelf).toEqual({ selected: 9, considered: null });
  });

  it("prefers the engine's true count (budget_spent.candidates_considered) over the capped list", () => {
    // The 2026-08-01 audit shape: a display-bounded candidates list (64)
    // riding a trace whose engine accounting counted the REAL pool (321).
    const env = {
      seq: 11,
      family: "trace",
      payload: {
        selected: Array(50).fill("id"),
        candidates: Array(64).fill("id"),
        budget_spent: { candidates_considered: 321, token_budget: 6000 },
      },
    };
    expect(turnPulse([env], 10).shelf).toEqual({ selected: 50, considered: 321 });
  });

  it("falls back to the list length when budget_spent ships no usable count", () => {
    const withJunk = (spent: unknown) => ({
      seq: 11,
      family: "trace",
      payload: { selected: Array(3).fill("id"), candidates: Array(30).fill("id"), budget_spent: spent },
    });
    expect(turnPulse([withJunk({})], 10).shelf).toEqual({ selected: 3, considered: 30 });
    expect(turnPulse([withJunk({ candidates_considered: "many" })], 10).shelf).toEqual({ selected: 3, considered: 30 });
    expect(turnPulse([withJunk({ candidates_considered: Number.NaN })], 10).shelf).toEqual({ selected: 3, considered: 30 });
    expect(turnPulse([withJunk(null)], 10).shelf).toEqual({ selected: 3, considered: 30 });
    // A true count with NO list still serves the truth (no fallback needed).
    expect(
      turnPulse([{ seq: 11, family: "trace", payload: { selected: ["a"], budget_spent: { candidates_considered: 7 } } }], 10).shelf,
    ).toEqual({ selected: 1, considered: 7 });
  });

  it("a snapshot without an estimate leaves tokens absent; non-finite refused", () => {
    expect(turnPulse([snapshot(11)], 10).recallTokens).toBeNull();
    expect(turnPulse([{ seq: 11, family: "snapshot", payload: { prompt_token_estimate: Number.NaN } }], 10).recallTokens).toBeNull();
  });

  it("formed: remember-sourced formations only — never visibility acts or bookkeeping (F4)", () => {
    const p = turnPulse(
      [
        formedBinding(11),
        { seq: 12, family: "binding", payload: { source: "election" }, display: { kind: "memory" } },
        { seq: 13, family: "binding", payload: { source: "remember" }, display: { kind: "claim", title: "spark-engram v2" } },
        { seq: 14, family: "binding", payload: {}, display: { kind: "episode" } },
      ],
      10,
    );
    expect(p.formed).toBe(1);
  });

  it("walks backward and stops AT the boundary — pre-turn envelopes are never touched (N3)", () => {
    // A malformed pre-boundary trace would throw if visited with a naive
    // full scan that reads payloads before checking seq; the backward walk
    // must break at seq<=since before ever reaching it.
    const evil = { seq: 3, family: "trace", payload: new Proxy({}, { get() { throw new Error("pre-turn envelope was read"); } }) };
    const p = turnPulse([evil, trace(11, 5, 10)], 10);
    expect(p.shelf).toEqual({ selected: 5, considered: 10 });
  });

  it("malformed payloads are skipped, never guessed at", () => {
    const p = turnPulse(
      [
        { seq: 11, family: "trace", payload: { selected: "not-an-array" } },
        { seq: 12, family: "trace", payload: null },
        { seq: 13 } as never,
      ],
      10,
    );
    expect(p.shelf).toBeNull();
  });

  it("the tokens scale is the recall budget: 12% of the 50k recommendation (operator 2026-08-01 re-ruling)", () => {
    // 6000 = the door's actual per-turn attention budget: the gateway now
    // derives from min(window, recommendation), so every at/above-50k
    // window budgets exactly this.
    expect(RECALL_TOKENS_SCALE).toBe(6000);
  });
});

describe("fmtTokens", () => {
  it("compact and honest at both magnitudes", () => {
    expect(fmtTokens(412)).toBe("412");
    expect(fmtTokens(3200)).toBe("3.2k");
    expect(fmtTokens(41_200)).toBe("41k");
  });
});

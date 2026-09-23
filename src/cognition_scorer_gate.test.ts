/**
 * Regression: the cognition scorer's ABSOLUTE-EVIDENCE ABSTENTION GATE
 * (fear-spike defect, operator report 2026-07-18).
 *
 * The live failure: the Cognitive Monitor rendered a strong FEA (fear)
 * petal over a completely benign travel-logistics reply. Root cause was the
 * emotion pass's per-utterance RELATIVE scoring — sims are mean-subtracted
 * across the 8 prototypes, so ~half always land above the mean and
 * tanh((sim − mu)/emotion_scale) crowns a confident-looking winner even
 * when every raw similarity is noise (the defect reply's best raw sim was
 * 0.066 against fear; the genuine fear control wins at 0.57). The gate
 * scales all emotion outputs by absolute proximity to the nearest
 * prototype: no proximity → empty bloom (absent-not-zero honesty), never a
 * confident wrong reading.
 *
 * Vectors are FROZEN live embeddings (src/fixtures/cognition_gate_vectors
 * .json, captured 2026-07-18 from LMStudio with the basis's own embedder,
 * text-embedding-qwen3-embedding-0.6b @1024) so this suite runs offline and
 * deterministically. Re-capture only if the basis embedder changes.
 */
import { describe, expect, it } from "vitest";

import basisJson from "./vendor/cognition/data/basis_v0.json";
import { createScorer, type FrozenBasis } from "./vendor/cognition/cognition_scorer";
import fixture from "./fixtures/cognition_gate_vectors.json";

const basis = basisJson as unknown as FrozenBasis;

interface FixtureCase {
  id: string;
  text: string;
  vector: number[];
}
const cases = new Map<string, FixtureCase>((fixture.cases as FixtureCase[]).map((c) => [c.id, c]));

function scoreOf(id: string, opts?: Parameters<typeof createScorer>[1]) {
  const c = cases.get(id);
  if (!c) throw new Error(`fixture case missing: ${id}`);
  // Fresh scorer per case: emotions are per-utterance (only novelty is
  // session-relative) and tests must not depend on scoring order.
  const scorer = createScorer(basis, { embedderId: basis.embedder_id, ...(opts ?? {}) });
  return scorer.score(c.vector);
}

/** The panel's dominant-emotion floor (cognitive_monitor.dominantEmotion):
 * anything below this never lights the mood dot; the petal is visually
 * negligible. The gate must push noise-level texts under it. */
const PANEL_DOMINANT_FLOOR = 0.18;
/** interpretWave's "lean strongly toward" threshold — the reading the
 * operator experiences as a confident verdict. */
const STRONG_LEAN = 0.75;

describe("fixture sanity (embedding space, not hand-written numbers)", () => {
  it("fixture is in the basis's embedding space", () => {
    expect(fixture.embedder_id).toBe(basis.embedder_id);
    expect(fixture.dim).toBe(basis.dim);
    for (const c of cases.values()) expect(c.vector.length).toBe(basis.dim);
  });
});

describe("abstention on benign text (the defect)", () => {
  it("the benign travel-logistics reply produces NO fear spike (all registers abstain)", () => {
    const out = scoreOf("benign_travel_reply");
    // Before the gate: joy=0.393, calm=0.365, tenderness=0.255, fear=0.097 —
    // a confident-looking bloom over a winning raw sim of 0.061 (noise).
    for (const [emotion, v] of Object.entries(out.emotions)) {
      expect(v, `${emotion} must stay below the panel's dominant floor on benign logistics`).toBeLessThan(PANEL_DOMINANT_FLOOR);
    }
    expect(out.emotionEvidence).toBeLessThan(0.2);
  });

  it("the weather-summary sentence (the fear-winning clause) abstains", () => {
    // Before: fear=0.609 top — from a raw fear sim of 0.101 (margin over
    // joy 0.033). The tooltip the operator saw ("words about danger, loss…")
    // rode exactly this class of manufactured winner.
    const out = scoreOf("weather_summary_sentence");
    expect(out.emotions.fear).toBeLessThan(PANEL_DOMINANT_FLOOR);
  });

  it("a plain neutral control abstains entirely", () => {
    const out = scoreOf("neutral_meeting");
    // Before: calm=0.825, tenderness=0.533 on "The meeting is at 3pm…".
    for (const v of Object.values(out.emotions)) expect(v).toBeLessThan(PANEL_DOMINANT_FLOOR);
  });

  it("storm-topic caution never reads as a STRONG fear verdict", () => {
    // "The forecast mentions a storm; pack a warm layer…" — hazard-topic
    // vocabulary sits genuinely nearer the fear prototype (stance-vs-topic,
    // the v0 basis's known limitation), so a mild tilt may survive; the
    // gate's job is that it can never render as a strong confident spike.
    const out = scoreOf("storm_caution_neutral");
    expect(out.emotions.fear).toBeLessThan(STRONG_LEAN); // before: 0.882
  });
});

describe("genuine emotion still spikes (the gate must not deafen the instrument)", () => {
  it("the fearful control still spikes fear as the top register", () => {
    const out = scoreOf("fearful_control");
    expect(out.emotions.fear).toBeGreaterThan(0.9);
    const top = Object.entries(out.emotions).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe("fear");
    expect(out.emotionEvidence).toBe(1);
  });

  it("the joy control still spikes joy, with zero fear", () => {
    const out = scoreOf("joy_control");
    expect(out.emotions.joy).toBeGreaterThan(0.9);
    expect(out.emotions.fear).toBe(0);
  });
});

describe("contract (additive only)", () => {
  it("score() keeps the public shape and adds labeled gate diagnostics", () => {
    const out = scoreOf("fearful_control");
    expect(Object.keys(out.scores)).toEqual(basis.channels);
    expect(Object.keys(out.emotions).sort()).toEqual([...basis.emotions].sort());
    expect(typeof out.novelty).toBe("number");
    expect(typeof out.emotionMaxSim).toBe("number");
    expect(out.emotionEvidence).toBeGreaterThanOrEqual(0);
    expect(out.emotionEvidence).toBeLessThanOrEqual(1);
  });

  it("abstention floor -1 restores the ungated (legacy) emotion map", () => {
    const gated = scoreOf("benign_travel_reply");
    const legacy = scoreOf("benign_travel_reply", { abstention: { floor: -1 } });
    // Legacy behavior is reachable (the gate is additive, not a rewrite):
    // the manufactured winners reappear when the gate is disabled.
    expect(legacy.emotions.joy).toBeGreaterThan(0.3);
    expect(gated.emotions.joy).toBeLessThan(legacy.emotions.joy);
    expect(legacy.emotionEvidence).toBe(1);
  });

  it("channel scores are untouched by the gate", () => {
    const gated = scoreOf("benign_travel_reply");
    const legacy = scoreOf("benign_travel_reply", { abstention: { floor: -1 } });
    expect(gated.scores).toEqual(legacy.scores);
  });
});

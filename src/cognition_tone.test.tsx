/**
 * The Cognitive Monitor's tone reading (operator 2026-11-07; review-cognition findings 1-10).
 *
 * - CALIBRATION: a tone channel speaks only in the outer 3% (plain) / 1% (strong) tails of the
 *   committed reference matrix (TONE_CUTOFFS, re-derived here), so the meeting, weather and travel
 *   fixtures read typical, the fear/joy controls read strong, and the storm fixture's "hedging" is
 *   pinned as a known limitation. Scores only: no text is ever matched.
 * - BOTH POLES: every channel has a plain and a strong word on each side, in the meaning of the
 *   generic anchor texts (WAR- = discouraged, not "cool").
 * - UI: the signed row (role=group, five buttons named with channel, value and pole word) and the
 *   reading line are what the chat monitor and the Wave tab mount.
 */
import React from "react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHANNEL_AXES, channelNow, interpretWave, MonitorInfoModal, ReadingLine, TONE_CUTOFFS, TONE_POLES, toneMark, toneTier, toneWord, ToneRow } from "./cognitive_monitor";
import { createScorer, type FrozenBasis } from "./vendor/cognition/cognition_scorer";
import basisV1 from "./vendor/cognition/data/basis_v1.json";
import fixture from "./fixtures/cognition_gate_vectors.json";
import reference from "./fixtures/tone_reference_scores.json";
import { deriveToneCutoffs } from "./tone_cutoffs_derive.js";
import { readingFromScore } from "./cognition_adapter";

const basis = basisV1 as unknown as FrozenBasis;
const score = (vector: number[]) =>
  createScorer(basis, { embedderId: basis.embedder_id, abstention: { floor: (basis as { abstention_floor?: number }).abstention_floor } }).score(vector);
const vec = (id: string) => (fixture.cases.find((c) => c.id === id) as { vector: number[] }).vector;
const reading = (id: string) => {
  const r = score(vec(id));
  // The app's own data path (readingFromScore): what both mounts show.
  return { sample: readingFromScore(r) as { emotions: Record<string, number>; scores: Record<string, number>; emotionEvidence?: number }, r };
};

describe("tone calibration (outer-tail cutoffs, not round numbers)", () => {
  it("the cutoffs belong to the shipped basis (regenerate them with scripts/derive_tone_cutoffs.mjs when it changes)", () => {
    expect(TONE_CUTOFFS.basisVersion).toBe((basisV1 as { version: string }).version);
    expect(Object.keys(TONE_CUTOFFS.channels).sort()).toEqual(Object.keys(TONE_POLES).sort());
    for (const k of Object.values(TONE_CUTOFFS.channels)) {
      expect(k.lowStrong).toBeLessThan(k.low);
      expect(k.low).toBeLessThan(0);
      expect(k.high).toBeGreaterThan(0);
      expect(k.highStrong).toBeGreaterThan(k.high);
    }
  });

  it("the shipped cutoffs ARE the committed reference matrix's outer tails (a hand edit or drift fails)", () => {
    expect(reference.count).toBe(1599);
    expect(reference.scores.length).toBe(reference.count);
    expect(reference.columns).toEqual(["warmth", "tension", "reflection", "structure", "certainty"]);
    expect(reference.basis_version).toBe(TONE_CUTOFFS.basisVersion);
    expect(createHash("sha256").update(JSON.stringify(reference.scores)).digest("hex")).toBe(reference.scores_sha256);
    expect(TONE_CUTOFFS.reference.scoresSha256).toBe(reference.scores_sha256);
    expect(TONE_CUTOFFS.reference.count).toBe(reference.count);
    expect(deriveToneCutoffs(reference.columns, reference.scores, TONE_CUTOFFS.tails.plain, TONE_CUTOFFS.tails.strong)).toEqual(TONE_CUTOFFS.channels);
  });

  it("the reference set's own shape: about three quarters typical on every channel, under a tenth strong", () => {
    const rows = reference.scores.map((r) => Object.fromEntries(reference.columns.map((c, i) => [c, r[i]])));
    const typical = rows.filter((r) => reference.columns.every((c) => toneTier(c, r[c]) === 0)).length / rows.length;
    const strong = rows.filter((r) => reference.columns.some((c) => Math.abs(toneTier(c, r[c]) ?? 0) === 2)).length / rows.length;
    expect(typical).toBeGreaterThan(0.72);
    expect(typical).toBeLessThan(0.76);
    expect(strong).toBeLessThan(0.1);
  });

  it("meeting, weather and travel fixtures read typical on every channel (the meeting no longer reads warm)", () => {
    for (const id of ["neutral_meeting", "weather_summary_sentence", "benign_travel_reply"]) {
      const { sample } = reading(id);
      for (const c of Object.keys(TONE_POLES)) expect(toneTier(c, sample.scores[c]), `${id} ${c}`).toBe(0);
    }
    // Every value is shown, however small: the closest register is named with its similarity.
    expect(interpretWave(reading("benign_travel_reply").sample)).toBe("The words are closest to joy (JOY −0.02).");
    expect(interpretWave(reading("weather_summary_sentence").sample)).toBe("The words are closest to fear (FEA 0.06).");
    expect(interpretWave(reading("neutral_meeting").sample)).toBe("The words are closest to anxiety (ANX 0.02).");
  });

  it("KNOWN LIMITATION, pinned: storm_caution_neutral reads hedging (hazard vocabulary projects onto CER-)", () => {
    // "The forecast mentions a storm; pack a warm layer and keep water within reach." Certainty
    // -0.958 sits beyond the -0.931 cutoff; the emotion gate's fear tilt on it predates this change
    // (cognition_scorer_gate.test.ts). Recorded, not hidden: if a re-cut changes it, update here.
    const { sample } = reading("storm_caution_neutral");
    expect(toneTier("certainty", sample.scores.certainty)).toBe(-1);
    expect(interpretWave(sample)).toBe("The words tilt mildly toward fear (FEA 0.16); hedging phrasing.");
  });

  it("the fear control reads strongly discouraged and urgent on the row; its sentence names fear and the urgency", () => {
    const { sample } = reading("fearful_control");
    expect(toneTier("warmth", sample.scores.warmth)).toBe(-2);
    expect(toneTier("tension", sample.scores.tension)).toBe(2);
    expect(interpretWave(sample)).toBe("The words lean strongly toward fear (FEA 0.59) with a thread of anxiety (ANX 0.43); very urgent phrasing.");
  });

  it("the joy control still reads very warm and very assured on the row; its sentence names joy", () => {
    const { sample } = reading("joy_control");
    expect(toneTier("warmth", sample.scores.warmth)).toBe(2);
    expect(toneTier("certainty", sample.scores.certainty)).toBe(2);
    expect(interpretWave(sample)).toBe("The words lean strongly toward joy (JOY 0.69); very assured phrasing.");
  });

  it("REAL READINGS (live replies 2026-11-07, channel scores): Castor and Hypnos", () => {
    // Castor: the "what are the last things you remember?" reply; every emotion gated to 0.
    const castor = { emotions: {}, scores: { warmth: -0.9361, tension: -0.0714, reflection: -0.2463, structure: 0.6719, certainty: -0.848 }, emotionEvidence: 0 };
    expect(interpretWave(castor)).toBe("Discouraged phrasing — no clear emotion.");
    // Hypnos: a later reply, also gated.
    const hypnos = { emotions: {}, scores: { warmth: -0.01, tension: 0.81, reflection: -0.31, structure: 0.53, certainty: -0.95 }, emotionEvidence: 0 };
    expect(interpretWave(hypnos)).toBe("Hedging phrasing — no clear emotion.");
    expect(interpretWave(castor)).not.toMatch(/no clear emotional tone/);
  });
});

describe("tone words: both poles, two strengths, anchor meanings", () => {
  const words: Record<string, [string, string, string, string]> = {
    warmth: ["warm", "very warm", "discouraged", "deeply discouraged"],
    tension: ["urgent", "very urgent", "unhurried", "entirely unhurried"],
    reflection: ["reflective", "deeply reflective", "matter-of-fact", "strictly matter-of-fact"],
    structure: ["structured", "tightly structured", "loosely associative", "very loosely associative"],
    certainty: ["assured", "very assured", "hedging", "heavily hedging"],
  };
  for (const [c, [plus, plusStrong, minus, minusStrong]] of Object.entries(words)) {
    it(`${c}: each side has its words at its own cutoffs; typical and unread say nothing`, () => {
      const k = TONE_CUTOFFS.channels[c];
      expect(toneWord(c, k.high)).toBe(plus);
      expect(toneWord(c, k.highStrong)).toBe(plusStrong);
      expect(toneWord(c, k.low)).toBe(minus);
      expect(toneWord(c, k.lowStrong)).toBe(minusStrong);
      expect(toneWord(c, (k.low + k.high) / 2)).toBeNull();
      expect(toneWord(c, k.high - 0.001)).toBeNull();
      expect(toneWord(c, k.low + 0.001)).toBeNull();
      expect(toneWord(c, undefined)).toBeNull();
      expect(toneWord(c, Number.NaN)).toBeNull();
      // the sentence speaks either pole
      expect(interpretWave({ emotions: {}, scores: { [c]: k.lowStrong } })).toBe(`${minusStrong.charAt(0).toUpperCase()}${minusStrong.slice(1)} phrasing — no clear emotion.`);
      expect(interpretWave({ emotions: {}, scores: { [c]: k.high } })).toBe(`${plus.charAt(0).toUpperCase()}${plus.slice(1)} phrasing — no clear emotion.`);
    });
  }

  it("the row's mark agrees with the sentence's tiers and never prints NaN", () => {
    const k = TONE_CUTOFFS.channels.warmth;
    expect([k.lowStrong, k.low, 0, k.high, k.highStrong].map((v) => toneMark("warmth", v))).toEqual(["−−", "−", "·", "+", "++"]);
    expect(toneMark("warmth", k.low + 0.001)).toBe("·"); // no word in the sentence → no sign on the row
    expect(toneMark("warmth", Number.NaN)).toBe("—");
    expect(toneMark("warmth", undefined)).toBe("—");
  });

  it("every channel description names both poles in the anchors' meaning", () => {
    for (const a of CHANNEL_AXES.filter((x) => x.id in TONE_POLES)) {
      const [plus, , minus] = [TONE_POLES[a.id].positive[0], null, TONE_POLES[a.id].negative[0]];
      expect(a.description.toLowerCase(), a.id).toContain(plus.split(" ")[0].toLowerCase());
      expect(a.description.toLowerCase(), a.id).toContain(minus.split(" ").at(-1)!.toLowerCase());
    }
  });
});

describe("the tone row and the reading line (what the monitor mounts)", () => {
  const castorScores = { warmth: -0.9361, tension: -0.0714, reflection: -0.2463, structure: 0.6719, certainty: -0.848 };

  it("the row is a named group of five buttons, each named with channel, exact value and pole word", () => {
    const html = renderToStaticMarkup(<ToneRow scores={castorScores} onAxis={() => undefined} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Tone of the phrasing"');
    expect(html.match(/<button/g)?.length).toBe(5);
    // The visible code starts each name (label in name, WCAG 2.5.3).
    expect(html).toContain('aria-label="WAR warmth -0.94, discouraged"');
    expect(html).toContain('aria-label="CER certainty -0.85, typical"');
    expect(html).toContain('aria-label="STR structure 0.67, typical"');
    expect(html).not.toContain("NaN");
  });

  it("an unread channel is named as not read, never as a number", () => {
    const html = renderToStaticMarkup(<ToneRow scores={{ warmth: Number.NaN }} onAxis={() => undefined} />);
    expect(html).toContain('aria-label="WAR warmth, not read"');
    expect(html).not.toContain("NaN");
  });

  it("the reading line says the sentence, with the gate's numbers as its title", () => {
    const html = renderToStaticMarkup(<ReadingLine sample={{ emotions: {}, scores: castorScores, emotionEvidence: 0 }} title="evidence 0.00" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Discouraged phrasing — no clear emotion.");
    expect(html).toContain('title="evidence 0.00"');
  });

  it("a channel's axis panel states the current value and pole without hover", () => {
    expect(channelNow("warmth", -0.9361)).toBe("This reply: -0.94, discouraged (beyond 97% of the reference set on this side).");
    expect(channelNow("certainty", 0.1)).toBe("This reply: 0.10, typical (inside the middle 94% of the reference set).");
    expect(channelNow("certainty", undefined)).toBe("This reply: not read.");
    const warmth = CHANNEL_AXES.find((a) => a.id === "warmth")!;
    const html = renderToStaticMarkup(<MonitorInfoModal axis={warmth} onClose={() => undefined} scores={castorScores} />);
    expect(html).toContain("This reply: -0.94, discouraged");
    expect(html).toContain("against discouraged");
  });

  it("both mounts render the row and/or the reading line (removing either fails here, the browser check covers the live mount)", () => {
    const inline = readFileSync(new URL("./cognition_wave_inline.tsx", import.meta.url), "utf8");
    const wave = readFileSync(new URL("./cognition_wave_panel.tsx", import.meta.url), "utf8");
    expect(inline).toMatch(/<ToneRow scores=\{current\.scores\}/);
    expect(inline).toMatch(/<ReadingLine sample=\{current\}/);
    expect(wave).toMatch(/<ReadingLine sample=\{current\}/);
    expect(inline).not.toContain("no clear emotional tone");
  });
});

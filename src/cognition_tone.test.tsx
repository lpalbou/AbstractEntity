/**
 * The Cognitive Monitor's tone reading (operator 2026-11-07; review-cognition findings 1-10).
 *
 * - CALIBRATION: a tone channel speaks only in the outer 3% (plain) / 1% (strong) tails of a
 *   reference population (TONE_CUTOFFS), so the repo's frozen NEUTRAL fixtures read typical and
 *   the fear/joy controls read strong. Scores only: no text is ever matched.
 * - BOTH POLES: every channel has a plain and a strong word on each side, in the meaning of the
 *   generic anchor texts (WAR- = discouraged, not "cool").
 * - UI: the signed row (role=group, five buttons named with channel, value and pole word) and the
 *   reading line are what the chat monitor and the Wave tab mount.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHANNEL_AXES, channelNow, interpretWave, MonitorInfoModal, ReadingLine, TONE_CUTOFFS, TONE_POLES, toneMark, toneTier, toneWord, ToneRow } from "./cognitive_monitor";
import { createScorer, type FrozenBasis } from "./vendor/cognition/cognition_scorer";
import basisV1 from "./vendor/cognition/data/basis_v1.json";
import fixture from "./fixtures/cognition_gate_vectors.json";

const basis = basisV1 as unknown as FrozenBasis;
const score = (vector: number[]) =>
  createScorer(basis, { embedderId: basis.embedder_id, abstention: { floor: (basis as { abstention_floor?: number }).abstention_floor } }).score(vector);
const vec = (id: string) => (fixture.cases.find((c) => c.id === id) as { vector: number[] }).vector;
const reading = (id: string) => {
  const r = score(vec(id));
  return { sample: { emotions: r.emotions, scores: r.scores, emotionEvidence: r.emotionEvidence }, r };
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

  it("the neutral fixtures read typical on every channel (the meeting no longer reads warm)", () => {
    for (const id of ["neutral_meeting", "weather_summary_sentence", "benign_travel_reply"]) {
      const { sample } = reading(id);
      for (const c of Object.keys(TONE_POLES)) expect(toneTier(c, sample.scores[c]), `${id} ${c}`).toBe(0);
      expect(interpretWave(sample)).toBe("Typical phrasing, no tone stands out — no clear emotion.");
    }
  });

  it("the fear control reads strongly discouraged and urgent on the row; its sentence names fear and the urgency", () => {
    const { sample } = reading("fearful_control");
    expect(toneTier("warmth", sample.scores.warmth)).toBe(-2);
    expect(toneTier("tension", sample.scores.tension)).toBe(2);
    expect(interpretWave(sample)).toBe("The words lean strongly toward fear (FEA) with a thread of anxiety (ANX); very urgent phrasing.");
  });

  it("the joy control still reads very warm and very assured on the row; its sentence names joy", () => {
    const { sample } = reading("joy_control");
    expect(toneTier("warmth", sample.scores.warmth)).toBe(2);
    expect(toneTier("certainty", sample.scores.certainty)).toBe(2);
    expect(interpretWave(sample)).toBe("The words lean strongly toward joy (JOY) with a thread of calm (CAL); very assured phrasing.");
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
    expect(html).toContain('aria-label="warmth -0.94, discouraged"');
    expect(html).toContain('aria-label="certainty -0.85, typical"');
    expect(html).toContain('aria-label="structure 0.67, typical"');
    expect(html).not.toContain("NaN");
  });

  it("an unread channel is named as not read, never as a number", () => {
    const html = renderToStaticMarkup(<ToneRow scores={{ warmth: Number.NaN }} onAxis={() => undefined} />);
    expect(html).toContain('aria-label="warmth, not read"');
    expect(html).not.toContain("NaN");
  });

  it("the reading line says the sentence, with the gate's numbers as its title", () => {
    const html = renderToStaticMarkup(<ReadingLine sample={{ emotions: {}, scores: castorScores, emotionEvidence: 0 }} title="evidence 0.00" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Discouraged phrasing — no clear emotion.");
    expect(html).toContain('title="evidence 0.00"');
  });

  it("a channel's axis panel states the current value and pole without hover", () => {
    expect(channelNow("warmth", -0.9361)).toBe("This reply: -0.94, discouraged (beyond 97% of texts on this side).");
    expect(channelNow("certainty", 0.1)).toBe("This reply: 0.10, typical (inside the middle 94% of texts).");
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

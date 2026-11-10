/**
 * The Cognitive Monitor's tone reading (operator 2026-11-07; review-cognition findings 1-10).
 *
 * - CALIBRATION: a tone channel's pole word is given only in the outer 3% (plain) / 1% (strong)
 *   tails of the committed reference matrix (TONE_CUTOFFS, re-derived here), so the meeting,
 *   weather and travel fixtures read typical, the fear/joy controls read strong, and the storm
 *   fixture's "hedging" is pinned as a known limitation. Scores only: no text is ever matched.
 * - BOTH POLES: every channel has a plain and a strong word on each side, in the meaning of the
 *   generic anchor texts (WAR- = discouraged, not "cool").
 * - UI: the row (role=group, five focusable codes, each PRINTING its signed score; the pole word
 *   on the code's hover card) is what both readings of the monitor mount; no sentence
 *   comments on the values and no clickable codes (operator 2026-11-07).
 */
import React from "react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHANNEL_AXES, simText, TONE_CUTOFFS, TONE_POLES, toneExplainer, toneTier, toneWord, ToneRow } from "./cognitive_monitor";
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
    // No pole word on any channel of these fixtures (the row prints the score, hover says "typical").
    for (const id of ["neutral_meeting", "weather_summary_sentence", "benign_travel_reply"]) {
      for (const c of Object.keys(TONE_POLES)) expect(toneWord(c, reading(id).sample.scores[c]), `${id} ${c}`).toBeNull();
    }
  });

  it("KNOWN LIMITATION, pinned: storm_caution_neutral reads hedging (hazard vocabulary projects onto CER-)", () => {
    // "The forecast mentions a storm; pack a warm layer and keep water within reach." Certainty
    // -0.958 sits beyond the -0.931 cutoff; the emotion gate's fear tilt on it predates this change
    // (cognition_scorer_gate.test.ts). Recorded, not hidden: if a re-cut changes it, update here.
    const { sample } = reading("storm_caution_neutral");
    expect(toneTier("certainty", sample.scores.certainty)).toBe(-1);
    expect(toneWord("certainty", sample.scores.certainty)).toBe("hedging");
  });

  it("the fear control reads strongly discouraged and very urgent", () => {
    const { sample } = reading("fearful_control");
    expect(toneTier("warmth", sample.scores.warmth)).toBe(-2);
    expect(toneTier("tension", sample.scores.tension)).toBe(2);
    expect(toneWord("tension", sample.scores.tension)).toBe("very urgent");
  });

  it("the joy control still reads very warm and very assured", () => {
    const { sample } = reading("joy_control");
    expect(toneTier("warmth", sample.scores.warmth)).toBe(2);
    expect(toneTier("certainty", sample.scores.certainty)).toBe(2);
    expect(toneWord("certainty", sample.scores.certainty)).toBe("very assured");
  });

  it("REAL READINGS (live replies 2026-11-07, channel scores): Castor and Hypnos", () => {
    // Castor: the "what are the last things you remember?" reply.
    const castor = { warmth: -0.9361, tension: -0.0714, reflection: -0.2463, structure: 0.6719, certainty: -0.848 };
    expect(Object.keys(castor).map((c) => toneWord(c, castor[c as keyof typeof castor]))).toEqual(["discouraged", null, null, null, null]);
    // Hypnos: a later reply.
    const hypnos = { warmth: -0.01, tension: 0.81, reflection: -0.31, structure: 0.53, certainty: -0.95 };
    expect(Object.keys(hypnos).map((c) => toneWord(c, hypnos[c as keyof typeof hypnos]))).toEqual([null, null, null, null, "hedging"]);
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
      // the code's card names either pole beside the printed score
      const axis = CHANNEL_AXES.find((a) => a.id === c)!;
      expect(toneExplainer(axis, k.lowStrong).facts).toEqual([{ label: "This reply", value: `${simText(k.lowStrong)} · ${minusStrong}` }]);
      expect(toneExplainer(axis, k.high).facts).toEqual([{ label: "This reply", value: `${simText(k.high)} · ${plus}` }]);
    });
  }

  it("every channel description names both poles in the anchors' meaning", () => {
    for (const a of CHANNEL_AXES.filter((x) => x.id in TONE_POLES)) {
      const [plus, , minus] = [TONE_POLES[a.id].positive[0], null, TONE_POLES[a.id].negative[0]];
      expect(a.description.toLowerCase(), a.id).toContain(plus.split(" ")[0].toLowerCase());
      expect(a.description.toLowerCase(), a.id).toContain(minus.split(" ").at(-1)!.toLowerCase());
    }
  });
});

describe("the tone row (what both mounts show under the bloom)", () => {
  const castorScores = { warmth: -0.9361, tension: -0.0714, reflection: -0.2463, structure: 0.6719, certainty: -0.848 };

  it("the row is a named group of five focusable codes, never buttons, no click action, no native tooltip", () => {
    const html = renderToStaticMarkup(<ToneRow scores={castorScores} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Tone of the phrasing"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("title=");
    expect(html.match(/<span class="cm_gauge_code cm_explained" style="color:[^"]+" tabindex="0">/g)?.length).toBe(5);
    expect(html).not.toContain("NaN");
  });

  it("each code PRINTS its score under it, as the registers print theirs (no tier marks)", () => {
    const html = renderToStaticMarkup(<ToneRow scores={castorScores} />);
    const shown = [...html.matchAll(/<span class="cm_gauge_val cm_tone_val">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(shown).toEqual(["−0.94", "−0.07", "−0.25", "0.67", "−0.85"]);
    // never −0.00, never a tier mark
    const tiny = renderToStaticMarkup(<ToneRow scores={{ warmth: -0.001, tension: 0.999, reflection: -0.999, structure: 0, certainty: 0.004 }} />);
    expect([...tiny.matchAll(/cm_tone_val">([^<]*)</g)].map((m) => m[1])).toEqual(["0.00", "1.00", "−1.00", "0.00", "0.00"]);
  });

  it("an unread channel shows —, never a number", () => {
    const html = renderToStaticMarkup(<ToneRow scores={{ warmth: Number.NaN }} />);
    expect(html).toContain('<span class="cm_gauge_val cm_tone_val">—</span>');
    expect(html).not.toContain("NaN");
  });

  it("a channel's card: what it measures, the printed value with its pole word, how the word is given", () => {
    const warmth = CHANNEL_AXES.find((a) => a.id === "warmth")!;
    expect(toneExplainer(warmth, -0.9361)).toEqual({
      code: "WAR",
      name: "warmth",
      color: warmth.color,
      summary: "Warm against discouraged phrasing, from −1 to +1.",
      facts: [{ label: "This reply", value: "−0.94 · discouraged" }],
      note: "A pole word is given only in the outer 3% of this home's texts on that side (the strong word in the outer 1%); otherwise typical.",
    });
    const certainty = CHANNEL_AXES.find((a) => a.id === "certainty")!;
    expect(toneExplainer(certainty, 0.1).facts[0].value).toBe("0.10 · typical");
    expect(toneExplainer(certainty, -0.001).facts[0].value).toBe("0.00 · typical");
    expect(toneExplainer(certainty, undefined)).toMatchObject({ facts: [{ label: "This reply", value: "—" }], note: "No score was read for this reply." });
  });

  it("both mounts render the row and neither renders a sentence about the values (the browser check covers the live mount)", () => {
    const inline = readFileSync(new URL("./cognition_wave_inline.tsx", import.meta.url), "utf8");
    const wave = readFileSync(new URL("./cognition_wave_panel.tsx", import.meta.url), "utf8");
    expect(inline).toMatch(/<ToneRow scores=\{current\.scores\}/);
    // The replay reading: the row at every position ("—" before his first words there).
    expect(wave).toMatch(/<ToneRow scores=\{current\?\.scores\}/);
    for (const src of [inline, wave]) {
      expect(src).not.toMatch(/ReadingLine|interpretWave|readingTitle/);
      expect(src).not.toContain("cm_reading_line");
      // no per-axis window: the codes explain themselves on hover
      expect(src).not.toMatch(/onAxis|setModalAxis|MonitorInfoModal axis=/);
    }
    // The monitor in the timeline shows no words (backlog 0032: only the reading), never raw text.
    expect(wave).not.toMatch(/>\{current\.(request|text)\}</);
    expect(wave).not.toContain("WordsLine");
  });
});

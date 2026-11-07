/**
 * The Cognitive Monitor's vocabulary + interpreter (operator 2026-07-15 pm).
 *
 * Two pins:
 * - AXIS DRIFT: every vendored uic axis (EMOTIONS/CHANNELS) has a code +
 *   description here, codes are unique, and the emotion order matches the
 *   vendored order (the bloom's petal positions are index-derived — the
 *   axis list IS the geometry key).
 * - INTERPRETATION: the pre-computed meaning is deterministic, names the
 *   dominant registers with their codes, and never speaks of inner state
 *   ("he feels" is banned vocabulary — the instrument reads words).
 */

import { describe, expect, it } from "vitest";

import { EMOTION_REGISTERS } from "@abstractframework/ui-kit";

import { CHANNEL_AXES, dominantEmotion, EMOTION_AXES, evidenceNote, evidenceTitle, interpretWave } from "./cognitive_monitor";
import { CHANNELS } from "./vendor/cognition/core";

describe("axis tables (drift pins against the kit contract)", () => {
  it("covers every kit register, in the kit order (petal geometry key)", () => {
    // The kit's EMOTION_REGISTERS is the contract source (codes+colors+
    // order, incl. GRAVITY at the ninth petal). If the kit widens the set,
    // this fails loud — add the AxisInfo description and re-pin.
    expect(EMOTION_AXES.map((a) => a.id)).toEqual(EMOTION_REGISTERS.map((r) => r.id));
  });

  it("carries the GRAVITY register (uic c2242: grave is not sad)", () => {
    const grv = EMOTION_AXES.find((a) => a.id === "gravity");
    expect(grv?.code).toBe("GRV");
    expect(grv?.description.toLowerCase()).toContain("not sad");
  });

  it("codes + colors are the kit's, never re-derived", () => {
    for (const r of EMOTION_REGISTERS) {
      const a = EMOTION_AXES.find((x) => x.id === r.id)!;
      expect(a.code).toBe(r.code);
      expect(a.color).toBe(r.color);
    }
  });

  it("covers every vendored channel", () => {
    expect(CHANNEL_AXES.map((a) => a.id)).toEqual(CHANNELS.map((c) => c.id));
  });

  it("codes are 3 letters and unique across BOTH tables (one legend, no collisions)", () => {
    const codes = [...EMOTION_AXES, ...CHANNEL_AXES].map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{3}$/);
  });

  it("every axis carries a color from the vendored vocabulary and a non-empty description", () => {
    for (const a of [...EMOTION_AXES, ...CHANNEL_AXES]) {
      expect(a.color).toMatch(/^#|^rgb/);
      expect(a.description.length).toBeGreaterThan(20);
    }
  });
});

describe("interpretWave (the pre-computed meaning)", () => {
  it("null sample → the resting sentence", () => {
    expect(interpretWave(null)).toContain("Nothing scored yet");
  });

  it("a small signal is still named — the monitor always shows it (operator 2026-11-07)", () => {
    const text = interpretWave({ emotions: { joy: 0.05, calm: 0.1 }, scores: { warmth: 0.6, tension: 0.1, reflection: -0.5, structure: 0.2, certainty: -0.2 } });
    expect(text).toBe("The words tilt faintly toward calm (CAL).");
  });

  it("only when nothing was read at all does the sentence say no clear emotion", () => {
    const text = interpretWave({ emotions: { joy: 0, calm: 0 }, scores: { warmth: 0.6, tension: 0.1, reflection: -0.5, structure: 0.2, certainty: -0.2 } });
    expect(text).toBe("Typical phrasing, no tone stands out — no clear emotion.");
  });

  it("weak evidence qualifies the reading, never hides it", () => {
    expect(interpretWave({ emotions: { fear: 0.5 }, scores: {}, emotionEvidence: 0 })).toBe("The words lean toward fear (FEA) (very weak evidence).");
    expect(interpretWave({ emotions: { fear: 0.5 }, scores: {}, emotionEvidence: 0.02 })).toContain("(very weak evidence)");
    expect(interpretWave({ emotions: { fear: 0.5 }, scores: {}, emotionEvidence: 0.1 })).toContain("(faint evidence)");
    expect(interpretWave({ emotions: { fear: 0.5 }, scores: {}, emotionEvidence: 0.35 })).not.toMatch(/evidence\)/);
  });

  it("missing scores never read as neutral: the tone is said to be unread", () => {
    expect(interpretWave({ emotions: {}, scores: {} })).toBe("Tone not read — no clear emotion.");
    expect(interpretWave({ emotions: {} })).toBe("Tone not read — no clear emotion.");
    expect(interpretWave({ emotions: {}, scores: { warmth: Number.NaN } })).toBe("Tone not read — no clear emotion.");
  });

  it("a dominant register is named with its code", () => {
    expect(interpretWave({ emotions: { discovery: 0.7, calm: 0.1 }, scores: {} })).toBe("The words lean toward discovery (DIS).");
  });

  it("verbs are strength-honest and grammatical: tilt mildly toward / lean toward / lean strongly toward", () => {
    expect(interpretWave({ emotions: { sadness: 0.3 }, scores: {} })).toContain("tilt mildly toward sadness (SAD)");
    expect(interpretWave({ emotions: { sadness: 0.5 }, scores: {} })).toContain("lean toward sadness (SAD)");
    expect(interpretWave({ emotions: { sadness: 0.9 }, scores: {} })).toContain("lean strongly toward sadness (SAD)");
    expect(interpretWave({ emotions: { sadness: 0.5 }, scores: {} })).not.toMatch(/lean sadness/);
  });

  it("a close second reads as a thread", () => {
    const text = interpretWave({ emotions: { discovery: 0.6, calm: 0.45 }, scores: {} });
    expect(text).toContain("discovery (DIS)");
    expect(text).toContain("thread of calm (CAL)");
  });

  it("a named emotion with faint gate evidence says so", () => {
    expect(interpretWave({ emotions: { sadness: 0.3 }, scores: {}, emotionEvidence: 0.2 })).toContain("sadness (SAD) (faint evidence)");
    expect(interpretWave({ emotions: { sadness: 0.3 }, scores: {}, emotionEvidence: 0.6 })).not.toContain("faint");
  });

  it("ONE rule against contradiction: a named emotion silences warmth, and no second valence clause is added", () => {
    const text = interpretWave({ emotions: { joy: 0.8 }, scores: { warmth: -0.99, certainty: 0.95 } });
    expect(text).toBe("The words lean strongly toward joy (JOY); very assured phrasing.");
    expect(text).not.toMatch(/discouraged|bright|strained|settled|energized/);
    // without a named emotion, warmth speaks
    expect(interpretWave({ emotions: {}, scores: { warmth: -0.99 } })).toBe("Deeply discouraged phrasing — no clear emotion.");
    // Scope: only valence is shared; other channels speak beside any emotion (documented on interpretWave).
    expect(interpretWave({ emotions: { calm: 0.8 }, scores: { tension: 0.99 } })).toBe("The words lean strongly toward calm (CAL); very urgent phrasing.");
  });

  it("a strong tone word leads over a mild emotional tilt; otherwise the emotion leads", () => {
    expect(interpretWave({ emotions: { sadness: 0.3 }, scores: { reflection: 0.9 } })).toBe("Deeply reflective phrasing; the words tilt mildly toward sadness (SAD).");
    expect(interpretWave({ emotions: { sadness: 0.5 }, scores: { reflection: 0.9 } })).toBe("The words lean toward sadness (SAD); deeply reflective phrasing.");
  });

  it("high novelty is labeled session-relative wandering", () => {
    const text = interpretWave({ emotions: { discovery: 0.5 }, scores: {}, novelty: 0.7 });
    expect(text).toContain("wanders");
    expect(text).toContain("session-relative");
  });

  it("NEVER claims inner state — the banned vocabulary pin", () => {
    const shapes = [
      { emotions: { fear: 0.9 }, scores: { tension: 0.99, warmth: -0.99 } },
      { emotions: { joy: 0.9 }, scores: { certainty: 0.99 } },
      { emotions: {}, scores: { warmth: -0.99, certainty: -0.99, reflection: 0.9 } },
      { emotions: {}, scores: {} },
      null,
    ];
    for (const s of shapes) {
      expect(interpretWave(s).toLowerCase()).not.toMatch(/he feels|his feelings|inner state|he is (sad|happy|afraid|anxious|discouraged)/);
    }
  });

  it("is deterministic (same sample → same sentence)", () => {
    const s = { emotions: { tenderness: 0.6, joy: 0.3 }, scores: { structure: 0.99 }, novelty: 0.2 };
    expect(interpretWave(s)).toBe(interpretWave(s));
  });
});

describe("dominantEmotion", () => {
  it("returns the leading axis however small; null only when nothing was read", () => {
    expect(dominantEmotion({ joy: 0.5, calm: 0.2 })?.axis.code).toBe("JOY");
    expect(dominantEmotion({ joy: 0.1 })?.axis.code).toBe("JOY");
    expect(dominantEmotion({ joy: 0, calm: 0 })).toBeNull();
    expect(dominantEmotion(undefined)).toBeNull();
  });
});

describe("evidenceNote / evidenceTitle (the abstention gate, said)", () => {
  it("no reach reads very weak; the low band reads faint; real reach says nothing", () => {
    expect(evidenceNote(0)).toContain("very weak evidence");
    expect(evidenceNote(0.02)).toContain("very weak evidence");
    expect(evidenceNote(0.2)).toContain("faint evidence");
    expect(evidenceNote(0.35)).toBeNull();
    expect(evidenceNote(0.9)).toBeNull();
  });

  it("absent diagnostics (pre-gate scorer / old cache entries) → no caption, never a guess", () => {
    expect(evidenceNote(undefined)).toBeNull();
    expect(evidenceNote(Number.NaN)).toBeNull();
  });

  it("the caption never claims inner state (banned vocabulary pin)", () => {
    for (const v of [0, 0.2]) {
      expect(evidenceNote(v)!.toLowerCase()).not.toMatch(/he feels|his feelings|inner state/);
    }
  });

  it("the title carries the live numbers and says the shape is always shown", () => {
    const t = evidenceTitle(0.04, 0.12);
    expect(t).toContain("evidence 0.04");
    expect(t).toContain("similarity 0.12");
    expect(t).toContain("always shows the shape");
    expect(t.toLowerCase()).not.toContain("abstention");
    // Absent diagnostics → no dangling number clause (the "(basis v1)"
    // provenance parenthetical is prose, not a number).
    const bare = evidenceTitle(undefined, undefined);
    expect(bare).not.toMatch(/evidence \d/);
    expect(bare).not.toMatch(/similarity \d/);
  });
});

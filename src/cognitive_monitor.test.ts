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

import { BloomAxisOverlay, bloomScoresOf, CHANNEL_AXES, dominantEmotion, EMOTION_AXES, interpretWave, radarValue, readingTitle, registerNow, roundSim, simText } from "./cognitive_monitor";
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

  it("the closest register is always named with its similarity, however small or negative", () => {
    const typical = { warmth: 0.6, tension: 0.1, reflection: -0.5, structure: 0.2, certainty: -0.2 };
    expect(interpretWave({ emotions: { joy: -0.02, calm: -0.035, fear: -0.09 }, scores: typical })).toBe("The words are closest to joy (JOY −0.02).");
    expect(interpretWave({ emotions: { calm: 0.03 }, scores: typical })).toBe("The words are closest to calm (CAL 0.03).");
  });

  it("only when nothing was read at all does the sentence say no clear emotion", () => {
    const typical = { warmth: 0.6, tension: 0.1, reflection: -0.5, structure: 0.2, certainty: -0.2 };
    expect(interpretWave({ emotions: {}, scores: typical })).toBe("Typical phrasing, no tone stands out — no clear emotion.");
    expect(interpretWave({ emotions: { joy: Number.NaN }, scores: typical })).toBe("Typical phrasing, no tone stands out — no clear emotion.");
  });

  it("the verb only puts the number into words", () => {
    expect(interpretWave({ emotions: { sadness: 0.05 }, scores: {} })).toContain("are closest to sadness (SAD 0.05)");
    expect(interpretWave({ emotions: { sadness: 0.12 }, scores: {} })).toContain("tilt mildly toward sadness (SAD 0.12)");
    expect(interpretWave({ emotions: { sadness: 0.3 }, scores: {} })).toContain("lean toward sadness (SAD 0.30)");
    expect(interpretWave({ emotions: { sadness: 0.5 }, scores: {} })).toContain("lean strongly toward sadness (SAD 0.50)");
  });

  it("a close second reads as a thread, with its number", () => {
    expect(interpretWave({ emotions: { fear: 0.59, anxiety: 0.43, calm: -0.1 }, scores: {} })).toBe("The words lean strongly toward fear (FEA 0.59) with a thread of anxiety (ANX 0.43).");
    expect(interpretWave({ emotions: { joy: 0.69, calm: 0.19 }, scores: {} })).not.toContain("thread");
  });

  it("ONE rule against contradiction: a clear register (≥ 0.25) silences warmth; a faint one lets warmth speak", () => {
    expect(interpretWave({ emotions: { joy: 0.69 }, scores: { warmth: -0.99, certainty: 0.95 } })).toBe("The words lean strongly toward joy (JOY 0.69); very assured phrasing.");
    expect(interpretWave({ emotions: { calm: 0.03 }, scores: { warmth: -0.99 } })).toBe("Deeply discouraged phrasing; the words are closest to calm (CAL 0.03).");
    expect(interpretWave({ emotions: { calm: 0.8 }, scores: { tension: 0.99 } })).toBe("The words lean strongly toward calm (CAL 0.80); very urgent phrasing.");
  });

  it("a strong tone word leads over a register below 0.25; otherwise the register leads", () => {
    expect(interpretWave({ emotions: { sadness: 0.12 }, scores: { reflection: 0.9 } })).toBe("Deeply reflective phrasing; the words tilt mildly toward sadness (SAD 0.12).");
    expect(interpretWave({ emotions: { sadness: 0.3 }, scores: { reflection: 0.9 } })).toBe("The words lean toward sadness (SAD 0.30); deeply reflective phrasing.");
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
  it("returns the register closest to his words, however small or negative; null only when nothing was read", () => {
    expect(dominantEmotion({ joy: 0.5, calm: 0.2 })?.axis.code).toBe("JOY");
    expect(dominantEmotion({ joy: -0.1, calm: -0.3 })).toMatchObject({ value: -0.1 });
    expect(dominantEmotion({ joy: Number.NaN, calm: -0.3 })?.axis.code).toBe("CAL");
    expect(dominantEmotion({})).toBeNull();
    expect(dominantEmotion(undefined)).toBeNull();
  });
});

describe("the radar: one fixed scale (−0.25 inner ring → +0.75 outer edge), every value shown", () => {
  it("maps similarity linearly on the same scale for every reply", () => {
    expect(radarValue(-0.25)).toBe(0);
    expect(radarValue(0)).toBeCloseTo(0.25, 12);
    expect(radarValue(0.75)).toBe(1);
    expect(radarValue(-0.02)).toBeCloseTo(0.23, 12);
    expect(radarValue(0.02)).toBeGreaterThan(radarValue(0.01));
    // beyond the scale: on that edge (the number is still printed beside the petal)
    expect(radarValue(0.9)).toBe(1);
    expect(radarValue(-0.4)).toBe(0);
    // not read: on the inner ring, label "—"
    expect(radarValue(undefined)).toBe(0);
    expect(radarValue(Number.NaN)).toBe(0);
  });

  it("the bloom always receives all nine registers explicitly", () => {
    const b = bloomScoresOf({ joy: 0.69, fear: -0.1 });
    expect(Object.keys(b).sort()).toEqual(EMOTION_AXES.map((a) => a.id).sort());
    expect(b.joy).toBeCloseTo(0.94, 12);
    expect(b.fear).toBeCloseTo(0.15, 12);
    expect(b.calm).toBe(0);
    expect(Object.values(bloomScoresOf(undefined)).every((v) => v === 0)).toBe(true);
  });

  it("prints with a true minus sign, never −0.00; the verb follows the printed number", () => {
    expect(simText(-0.02)).toBe("−0.02");
    expect(simText(0.5)).toBe("0.50");
    expect(simText(-0.001)).toBe("0.00");
    expect(roundSim(0.0996)).toBe(0.1);
    expect(interpretWave({ emotions: { fear: 0.0996 }, scores: {} })).toContain("tilt mildly toward fear (FEA 0.10)");
  });

  it("every petal carries its number; a missing one reads —", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(React.createElement(BloomAxisOverlay, { width: 200, height: 200, onAxis: () => undefined, emotions: { joy: -0.02, fear: 0.59 } }));
    // the number SHOWN beside each code, not only in the hover text
    expect(html).toContain('<span class="cm_overlay_num">−0.02</span>');
    expect(html).toContain('<span class="cm_overlay_num">0.59</span>');
    expect(html).toContain('<span class="cm_overlay_num">—</span>');
    expect(html).toContain("calm, similarity —");
    expect(registerNow(0.12)).toBe("This reply: similarity 0.12 (the radar runs from −0.25 on the inner ring to 0.75 at the outer edge).");
    expect(registerNow(undefined)).toBe("This reply: not read.");
  });

  it("the title says the scale and carries the live number; no gate language", () => {
    const t = readingTitle(0.12);
    expect(t).toContain("the inner ring is −0.25, the outer edge +0.75, zero a quarter of the way out");
    expect(t).toContain("closest register here is at 0.12");
    expect(t.toLowerCase()).not.toMatch(/abstention|evidence|gate/);
    expect(readingTitle(undefined)).not.toMatch(/closest register here/);
  });
});

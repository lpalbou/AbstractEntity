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

  it("a flat shape reads as even/quiet, naming no register", () => {
    const text = interpretWave({ emotions: { joy: 0.05, calm: 0.1 }, scores: {} });
    expect(text).toContain("even, quiet");
    expect(text).not.toContain("JOY");
  });

  it("a dominant register is named with its code", () => {
    const text = interpretWave({ emotions: { discovery: 0.7, calm: 0.1 }, scores: {} });
    expect(text).toContain("discovery (DIS)");
  });

  it("REGRESSION (operator 2026-07-15): a reflective reply with a weak sadness lean leads with the CHANNEL, and the lean is strength-honest", () => {
    // The investigated live case: reflection=0.828, tension=0.486,
    // sadness=0.484, tenderness=0.112 — the old sentence led with "lean
    // sadness" and read as a wrong verdict on an intellectually-engaged
    // reply. The dominant signal (reflective prose) must lead.
    const text = interpretWave({
      emotions: { sadness: 0.484, tenderness: 0.112, discovery: 0.035 },
      scores: { reflection: 0.828, tension: 0.486, certainty: 0.12 },
    });
    expect(text.startsWith("Deeply reflective")).toBe(true);
    expect(text).toContain("sadness (SAD)");
    expect(text).not.toContain("lean strongly");
  });

  it("verbs are strength-honest: a mild tilt never reads as a verdict", () => {
    const mild = interpretWave({ emotions: { sadness: 0.3 }, scores: {} });
    expect(mild).toContain("tilt mildly toward sadness");
    const strong = interpretWave({ emotions: { sadness: 0.9 }, scores: {} });
    expect(strong).toContain("lean strongly toward sadness");
  });

  it("a close second reads as a thread", () => {
    const text = interpretWave({ emotions: { discovery: 0.6, calm: 0.45 }, scores: {} });
    expect(text).toContain("discovery (DIS)");
    expect(text).toContain("thread of calm (CAL)");
  });

  it("tone derives from the circumplex (bright+settled for calm-leaning words)", () => {
    const text = interpretWave({ emotions: { calm: 0.8 }, scores: {} });
    expect(text).toMatch(/bright|settled/);
  });

  it("high tension surfaces as a channel clause", () => {
    const text = interpretWave({ emotions: { anxiety: 0.5 }, scores: { tension: 0.8 } });
    expect(text.toLowerCase()).toContain("tension runs high");
  });

  it("low certainty reads as hedging", () => {
    const text = interpretWave({ emotions: { calm: 0.4 }, scores: { certainty: 0.2 } });
    expect(text).toContain("hedges");
  });

  it("high novelty is labeled session-relative wandering", () => {
    const text = interpretWave({ emotions: { discovery: 0.5 }, scores: {}, novelty: 0.7 });
    expect(text).toContain("wanders");
    expect(text).toContain("session-relative");
  });

  it("NEVER claims inner state — the banned vocabulary pin", () => {
    const shapes = [
      { emotions: { fear: 0.9 }, scores: { tension: 0.9 } },
      { emotions: { joy: 0.9 }, scores: { certainty: 0.9 } },
      { emotions: {}, scores: {} },
      null,
    ];
    for (const s of shapes) {
      const text = interpretWave(s);
      expect(text.toLowerCase()).not.toMatch(/he feels|his feelings|inner state|he is (sad|happy|afraid|anxious)/);
    }
  });

  it("is deterministic (same sample → same sentence)", () => {
    const s = { emotions: { tenderness: 0.6, joy: 0.3 }, scores: { structure: 0.7 }, novelty: 0.2 };
    expect(interpretWave(s)).toBe(interpretWave(s));
  });
});

describe("dominantEmotion", () => {
  it("returns the top axis above threshold, null when flat", () => {
    expect(dominantEmotion({ joy: 0.5, calm: 0.2 })?.axis.code).toBe("JOY");
    expect(dominantEmotion({ joy: 0.1 })).toBeNull();
    expect(dominantEmotion(undefined)).toBeNull();
  });
});

describe("evidenceNote / evidenceTitle (the abstention gate, said)", () => {
  it("full abstention reads quiet; the low band reads faint; real reach says nothing", () => {
    expect(evidenceNote(0)).toContain("quiet");
    expect(evidenceNote(0.02)).toContain("quiet");
    expect(evidenceNote(0.2)).toContain("faint");
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

  it("the title carries the live numbers when present and names abstention as design", () => {
    const t = evidenceTitle(0.04, 0.12);
    expect(t).toContain("evidence 0.04");
    expect(t).toContain("similarity 0.12");
    expect(t.toLowerCase()).toContain("honest abstention");
    // Absent diagnostics → no dangling number clause (the "(basis v1)"
    // provenance parenthetical is prose, not a number).
    const bare = evidenceTitle(undefined, undefined);
    expect(bare).not.toMatch(/evidence \d/);
    expect(bare).not.toMatch(/similarity \d/);
  });
});

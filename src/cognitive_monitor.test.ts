/**
 * The Cognitive Monitor's vocabulary (operator 2026-07-15 pm) and its radar.
 *
 * Pins:
 * - AXIS DRIFT: every vendored uic axis (EMOTIONS/CHANNELS) has a code +
 *   description here, codes are unique, and the emotion order matches the
 *   vendored order (the bloom's petal positions are index-derived — the
 *   axis list IS the geometry key).
 * - NO SENTENCE (operator 2026-11-07: "no need to comment on the value"):
 *   the interpreter and its reading line are gone; every value is printed.
 * - THE RADAR: one fixed scale, every petal's number printed beside it.
 */

import { describe, expect, it } from "vitest";

import { EMOTION_REGISTERS } from "@abstractframework/ui-kit";

import * as monitor from "./cognitive_monitor";
import { bloomScoresOf, CHANNEL_AXES, CONDUCT_AXES, dominantEmotion, EMOTION_AXES, radarValue, roundSim, simText } from "./cognitive_monitor";
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

  it("every code's hover card has ONE plain sentence of what it measures, its own (not the long prose)", () => {
    for (const a of [...EMOTION_AXES, ...CHANNEL_AXES, ...CONDUCT_AXES]) {
      expect(a.summary, a.id).toMatch(/^[A-Z][^]*\.$/);
      expect(a.summary, a.id).not.toMatch(/\. /);
      expect(a.summary.length, a.id).toBeLessThan(110);
      expect(a.summary, a.id).not.toBe(a.description);
    }
  });
});

describe("no sentence comments on the values (operator 2026-11-07)", () => {
  it("the interpreter, its reading line and its hover text are gone from the shared module", () => {
    for (const name of ["interpretWave", "ReadingLine", "readingTitle", "toneReading", "toneMark"]) expect(Object.keys(monitor), name).not.toContain(name);
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

  it("prints with a true minus sign, never −0.00", () => {
    expect(simText(-0.02)).toBe("−0.02");
    expect(simText(0.5)).toBe("0.50");
    expect(simText(-0.001)).toBe("0.00");
    expect(roundSim(0.0996)).toBe(0.1);
    expect(simText(0.0996)).toBe("0.10");
  });
});

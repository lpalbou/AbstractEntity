/**
 * Whose words calibrated the monitor's basis, said for the entity being
 * viewed (operator report 2026-11-07, Castor: "Read complete · no clear
 * emotional tone" on every reply). The tooltip and the (i) modal claimed the
 * quiet-gate floor was "calibrated on his own corpus" for EVERY entity, while
 * the shipped basis v1 records `calibrated_on.entity: "entity:ephemeral"`.
 * Castor's replies are read against another entity's corpus and floor; the
 * copy must say so, from the basis metadata, never a fixed sentence.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { basisCalibrationNote, evidenceTitle, MonitorInfoModal } from "./cognitive_monitor";
import basisV1 from "./vendor/cognition/data/basis_v1.json";

const V1 = (basisV1 as unknown as { calibrated_on: Record<string, unknown> }).calibrated_on;

describe("basisCalibrationNote (the basis's own provenance, per viewed entity)", () => {
  it("names the calibration entity when it is not the viewed one (the shipped v1 viewed as castor)", () => {
    expect(V1["entity"]).toBe("entity:ephemeral");
    const note = basisCalibrationNote(V1, "castor");
    expect(note).toContain("ephemeral's words");
    expect(note).toContain("not on castor's");
    expect(note).toContain("74 real replies");
    expect(note).toContain("2026-08-01");
    expect(note.toLowerCase()).not.toContain("his own");
  });

  it("says 'his own words' only for the entity the basis was cut on (slug, id or handle form)", () => {
    for (const viewed of ["ephemeral", "entity:ephemeral", "entity:ephemeral@home-aced8b78"]) {
      expect(basisCalibrationNote(V1, viewed)).toContain("his own words");
    }
  });

  it("a curated-only basis (v0) claims no real replies at all", () => {
    const note = basisCalibrationNote({ curated_arc: 20, castor_utterances: 0, date: "2026-07-14" }, "castor");
    expect(note).toContain("curated example texts only");
    expect(note.toLowerCase()).not.toContain("his own");
  });

  it("a basis that does not record whose words says exactly that", () => {
    expect(basisCalibrationNote({ castor_utterances: 12 }, "castor")).toContain("does not record whose");
  });
});

describe("the quiet-state copy carries the provenance, never a fixed 'his own corpus'", () => {
  it("evidenceTitle for castor names ephemeral's corpus and keeps the live numbers", () => {
    const t = evidenceTitle(0, 0.0167, basisCalibrationNote(V1, "castor"));
    expect(t).toContain("evidence 0.00");
    expect(t).toContain("similarity 0.02");
    expect(t).toContain("ephemeral's words");
    expect(t).not.toContain("his own corpus");
  });

  it("evidenceTitle without a loaded basis makes no calibration claim", () => {
    const t = evidenceTitle(0, 0.0167);
    expect(t).not.toMatch(/calibrated/i);
  });

  it("the (i) modal states the viewed entity's provenance and drops the stale v0 / 'his own corpus' sentences", () => {
    const html = renderToStaticMarkup(
      React.createElement(MonitorInfoModal, { axis: "about", onClose: () => undefined, calibration: basisCalibrationNote(V1, "castor") }),
    );
    expect(html).toContain("ephemeral&#x27;s words");
    expect(html).not.toContain("his own corpus");
    expect(html).not.toContain("calibrated on his real utterances");
    expect(html).not.toContain("curated-only v0 basis");
  });
});

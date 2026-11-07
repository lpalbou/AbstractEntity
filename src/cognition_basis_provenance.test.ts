/**
 * What the monitor's basis IS, said from its own metadata (operator ruling 2026-11-07): the design
 * is generic for ANY entity. The registers and channels come from generic anchor texts; basis v1
 * only re-fitted the whitening statistics and the emotion gate's floor on a mixed corpus (curated
 * arc + anchor texts + 74 real replies). The copy must never claim the basis is tuned to one
 * entity (neither "his own corpus" nor "calibrated on <someone>'s words").
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { basisProvenanceNote, evidenceTitle, MonitorInfoModal } from "./cognitive_monitor";
import basisV1 from "./vendor/cognition/data/basis_v1.json";

const V1 = (basisV1 as unknown as { calibrated_on: Record<string, unknown> }).calibrated_on;
// Never claims the basis is tuned to one entity (the copy e0098a0 shipped, then retracted).
const NO_ONE_ENTITY = /his own|calibrated on \w+'s words|not on \w+'s|tuned to/i;

describe("basisProvenanceNote (generic design, mixed-corpus normalization)", () => {
  it("the shipped v1: generic prototypes; normalization and floor fitted on the mixed corpus it records", () => {
    const note = basisProvenanceNote(V1);
    expect(note).toContain("generic");
    expect(note).toContain("the same for every entity");
    expect(note).toContain("Its normalization (whitening, channel scales, emotion scale) and the emotion gate's floor were fitted on a mixed corpus");
    expect(note).toContain("20 curated texts, 125 anchor texts and 74 replies and diary entries (entity:ephemeral) (2026-08-01)");
    expect(note).not.toMatch(NO_ONE_ENTITY);
  });

  it("records only what the metadata holds", () => {
    expect(basisProvenanceNote({ curated_arc: 20, castor_utterances: 0, date: "2026-07-14" })).toContain("mixed corpus: 20 curated texts (2026-07-14)");
    expect(basisProvenanceNote({})).toBe("The registers and tone channels are generic: their prototypes come from generic anchor texts, the same for every entity.");
    expect(basisProvenanceNote(null)).not.toMatch(/fitted/);
    expect(basisProvenanceNote({ castor_utterances: 3 })).toContain("mixed corpus: 3 replies and diary entries.");
  });
});

describe("the quiet-state copy carries the generic provenance", () => {
  it("evidenceTitle keeps the live numbers and claims no single-entity tuning", () => {
    const t = evidenceTitle(0, 0.0167, basisProvenanceNote(V1));
    expect(t).toContain("evidence 0.00");
    expect(t).toContain("similarity 0.02");
    expect(t).not.toMatch(NO_ONE_ENTITY);
  });

  it("evidenceTitle without a loaded basis makes no calibration claim", () => {
    expect(evidenceTitle(0, 0.0167)).not.toMatch(/calibrated|fitted/i);
  });

  it("the (i) modal states the generic provenance, explains the signed tone channels, and drops the stale sentences", () => {
    const html = renderToStaticMarkup(React.createElement(MonitorInfoModal, { axis: "about", onClose: () => undefined, calibration: basisProvenanceNote(V1) }));
    expect(html).toContain("the same for every entity");
    expect(html).toContain("both poles speak");
    expect(html).not.toMatch(NO_ONE_ENTITY);
    expect(html).not.toContain("calibrated on his real utterances");
    expect(html).not.toContain("curated-only v0 basis");
  });
});

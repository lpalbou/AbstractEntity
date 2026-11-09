/**
 * The World tab labels a card "mechanical" from its served provenance only (operator 2026-11-08:
 * titles are clean and informative, never a signal): memory's `authored_by` and `digest_method` on
 * the card's binding display block (abstractmemory replay.py understanding_fields; the gateway
 * serves the same fields on records since 1b3832b7). The subjects it counts are memory's `target`,
 * never parsed out of a title.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorldPanel } from "./lessons_world_panels";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { isMechanicalReading } from "./understanding";

let seq = 100;
function card(id: string, display: Record<string, unknown>): ReplayEnvelope {
  seq += 1;
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "binding",
    observed_at: "2026-11-08T01:33:36.738417+00:00",
    scope: "life",
    owner_id: "entity:castor",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { record_id: id, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "inactive", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    display: { record_id: id, graph_id: id, kind: "world_model", ...display },
  } as unknown as ReplayEnvelope;
}

const MECH = "ex:world_model-6d8d2a482ccb118e4eb59d63fd";
const MIND = "ex:world_model-0a1b2c3d4e5f60718293a4b5c6";
const NONE = "ex:world_model-ffeeddccbbaa99887766554433";
const AUTHOR_ONLY = "ex:world_model-1234567890abcdef1234567890";
const fold = foldEnvelopes([
  // A mechanical card with a clean title (no "World model:" in sight).
  card(MECH, { title: "Ada keeps the archive", digest: "Ada keeps the archive.", digest_method: "mechanical-card-v2", digest_version: 0, authored_by: { kind: "mechanical", id: "mechanical-card-v2" }, target: "person:ada", target_type: "person" }),
  // His own words under an old-style prefixed title.
  card(MIND, { title: "World model: admin", digest: "The admin answers at night.", digest_method: "authored-card-v1", digest_version: 1, authored_by: { kind: "entity-mind", id: "entity:mind" }, target: "person:admin", target_type: "person" }),
  // No provenance served yet: not called mechanical.
  card(NONE, { title: "Consolidated: tides", target: "topic:tides" }),
  // The author alone says mechanical (no method served).
  card(AUTHOR_ONLY, { title: "Harbour at dawn", authored_by: { kind: "mechanical", id: null }, target: "place:harbour" }),
]);

/** One card's markup: the chunk of the panel holding its words. */
const cardHtml = (words: string) => {
  const chunks = renderToStaticMarkup(<WorldPanel fold={fold} onSelect={() => {}} />).split("lw_wcard_head").slice(1);
  const mine = chunks.filter((c) => c.includes(words));
  expect(mine).toHaveLength(1);
  return mine[0];
};

describe("the fold keeps the served provenance of a card", () => {
  it("authored_by.kind and target ride the binding's display block onto the node", () => {
    expect(fold.nodes.get(MECH)).toMatchObject({ authored_kind: "mechanical", digest_method: "mechanical-card-v2", target: "person:ada" });
    expect(fold.nodes.get(MIND)).toMatchObject({ authored_kind: "entity-mind", digest_method: "authored-card-v1", target: "person:admin" });
    expect(fold.nodes.get(NONE)?.authored_kind ?? null).toBe(null);
  });
});

describe("World tab: mechanical comes from provenance, never the title", () => {
  it("a mechanical card with a clean title is labeled mechanical", () => {
    expect(cardHtml("Ada keeps the archive")).toContain("⚙ mechanical");
  });
  it("his own words under a 'World model:' title are not", () => {
    expect(cardHtml(">admin<")).not.toContain("⚙ mechanical");
  });
  it("authored_by.kind mechanical alone is enough", () => {
    expect(cardHtml("Harbour at dawn")).toContain("⚙ mechanical");
  });
  it("a card served without a title is untitled, not mechanical, when his mind wrote it", () => {
    const untitled = foldEnvelopes([card(MIND, { title: "", digest: "The admin answers at night.", digest_method: "authored-card-v1", authored_by: { kind: "entity-mind", id: "entity:mind" }, target: "person:admin" })]);
    const html = renderToStaticMarkup(<WorldPanel fold={untitled} onSelect={() => {}} />);
    expect(html).toContain("lw_wcard_head");
    expect(html).not.toContain("⚙ mechanical");
  });
  it("a 'Consolidated:' title with no provenance served is not called mechanical", () => {
    expect(cardHtml("tides")).not.toContain("⚙ mechanical");
  });
  it("the subjects counted are the served targets, whatever the titles say", () => {
    // Four subjects served: no "only people he met" note.
    expect(renderToStaticMarkup(<WorldPanel fold={fold} onSelect={() => {}} />)).not.toContain("These are all people/agents");
    // Three cards, three different titles, ONE subject (person:ada): the note shows.
    const one = foldEnvelopes([
      card(MECH, { title: "Ada keeps the archive", target: "person:ada" }),
      card(MIND, { title: "Ada answers at night", target: "person:ada" }),
      card(NONE, { title: "World model: ada", target: "person:ada" }),
    ]);
    expect(renderToStaticMarkup(<WorldPanel fold={one} onSelect={() => {}} />)).toContain("These are all people/agents");
  });
  it("the panel's source parses no title prefix", () => {
    const src = fs.readFileSync(path.join(__dirname, "lessons_world_panels.tsx"), "utf8");
    expect(src).not.toMatch(/World model:|\^Consolidated|world\[\\s_\]\?model/);
  });
});

describe("isMechanicalReading (one rule with Detail and the hover card)", () => {
  it("the author decides; a mechanical method counts only when no author claims the words", () => {
    expect(isMechanicalReading({ kind: "mechanical", id: null }, null)).toBe(true);
    expect(isMechanicalReading(null, "mechanical-v2")).toBe(true);
    expect(isMechanicalReading(null, "authored-v1")).toBe(false);
    expect(isMechanicalReading(null, null)).toBe(false);
    expect(isMechanicalReading({ kind: "entity-mind", id: null }, "mechanical-v2")).toBe(false);
    expect(isMechanicalReading({ kind: "operator", id: null }, null)).toBe(false);
  });
});

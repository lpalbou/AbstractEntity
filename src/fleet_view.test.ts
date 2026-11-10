/**
 * Fleet tile contract tests: the wall is presentation over N independent
 * folds, and each tile's facts must agree with what the single view would
 * say about the same stream (no second derivation drifting).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { summarize, tileStep } from "./fleet_view";
import { createFoldState, foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { parseNdjson } from "./stream_source";

describe("fleet tile summary", () => {
  it("derives tile facts from the demo life exactly as the single view does", () => {
    const path = new URL("../public/demo/castor.ndjson", import.meta.url).pathname;
    const { envelopes, errors } = parseNdjson(readFileSync(path, "utf-8"));
    expect(errors).toHaveLength(0);
    const fold = foldEnvelopes(envelopes);
    const s = summarize(fold);
    // Diary is its own count, never inflating "memories"; engine acts
    // (engram + reembed bookkeeping) are excluded from both.
    const diary = [...fold.nodes.values()].filter((n) => n.diary).length;
    const bookkeeping = [...fold.nodes.values()].filter((n) => n.bookkeeping).length;
    expect(s.diary).toBe(diary);
    expect(s.memories).toBe(fold.nodes.size - diary - bookkeeping);
    // Session boundary rule identical to the header: host summons vs
    // inferred run boundaries, whichever is larger (honest, never zero
    // for a home-direct life).
    const summons = fold.sessions.filter((m) => m.kind === "summon").length;
    expect(s.sessions).toBe(Math.max(summons, fold.inferred_sessions.length));
    expect(s.feelings).toBe(fold.standings.size);
  });
});

describe("a tile's recent lines", () => {
  // A topic version (memory's community record), then the link row memory closes with it: kind
  // "memory", the version's graph id (castor's shape, ledger_topics.test.ts).
  const at = "2026-11-10T02:40:13.957351+00:00";
  const version = { seq: 10, family: "binding", observed_at: at, payload: { record_id: "ex:community-v1", source: "remember", seq: 10 }, display: { record_id: "ex:community-v1", kind: "community", graph_id: "ex:community-v1", community_key: "ex:community-k1", size: 12, title: "Tending the bridges" } } as unknown as ReplayEnvelope;
  const link = { seq: 11, family: "closure", observed_at: at, payload: { assertion_id: "row-11", kind: "supersede", reason: "community ex:community-k1: version 2", replacement_ids: ["ex:community-v2"], closure_id: "c11", seq: 11 }, display: { record_id: "row-11", kind: "memory", title: "ex:community-v1 refines", graph_id: "ex:community-v1" } } as unknown as ReplayEnvelope;

  it("a topic version's link to the one before never reaches the tile (the fold's topic ids go to ledgerLine)", () => {
    const fold = createFoldState();
    expect(tileStep(fold, version)?.title).toBe("🗺 A topic took shape: Tending the bridges");
    expect(fold.community_graph_ids.has("ex:community-v1")).toBe(true);
    expect(tileStep(fold, link)).toBeNull();
    // Without the ids the same row reads as a belief's line: what the tile used to show.
    expect(tileStep(createFoldState(), link)?.title).toBe("Belief revised");
  });
});

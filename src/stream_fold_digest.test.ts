/**
 * The fold keeps a record's full digest (its summary) from the recall
 * snapshots that carry it (abstractmemory selection.py display_rows: the
 * record's digest literal), for the episode Detail's Summary.
 */
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";

const GRAPH = "ex:episode-ad3a54ddb1e7d44a9d7741db98";
const ROW = "b160114a63be3fa37cad543f24020ebd";
const DIGEST = "person:admin: welcome to our world, how are you? nerin: Thank you—I'm here, attentive, and glad to meet you. How are you?";

function env(seq: number, family: ReplayEnvelope["family"], payload: Record<string, unknown>, display?: Record<string, unknown>): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    observed_at: "2026-11-07T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:nerin",
    trace_id: family === "snapshot" ? "t-1" : null,
    turn_id: "t-0001",
    run_id: null,
    family,
    payload,
    ...(display ? { display } : {}),
  } as unknown as ReplayEnvelope;
}

const binding = (graph: string, kind: string, seq = 1) =>
  env(
    seq,
    "binding",
    { record_id: graph, scope: "life", owner_id: "entity:nerin", search_state: "indexed", prompt_state: "inactive", lifecycle: "inactive_candidate", source: "remember", seq },
    { record_id: graph, kind, title: "exchange: welcome to our world, how are you?", token_estimate: 53, graph_id: graph },
  );

const snapshot = (rows: Array<Record<string, unknown>>, seq = 31) =>
  env(seq, "snapshot", { snapshot_id: "s-1", trace_id: "t-1", used_record_ids: rows.map((r) => r.record_id), display: rows, prompt_token_estimate: 53, seq });

const row = (rid: string, graph: string, digest: string) => ({ record_id: rid, title: `${graph} dcterms:abstract ${digest.slice(0, 60)}…`, digest, token_estimate: 53 });

describe("a record's digest", () => {
  it("is kept whole on the record's node once a recall snapshot carries it", () => {
    const fold = foldEnvelopes([binding(GRAPH, "episode"), snapshot([row(ROW, GRAPH, DIGEST)])]);
    const node = fold.nodes.get(fold.graph_to_row.get(GRAPH) ?? GRAPH)!;
    expect(node.kind).toBe("episode");
    expect(node.digest).toBe(DIGEST);
  });

  it("is not there before the recall (the fold at an earlier position)", () => {
    const fold = foldEnvelopes([binding(GRAPH, "episode"), snapshot([row(ROW, GRAPH, DIGEST)])], 30);
    const node = fold.nodes.get(fold.graph_to_row.get(GRAPH) ?? GRAPH)!;
    expect(node.digest ?? null).toBeNull();
  });

  it("is never kept for a diary record", () => {
    const diary = "ex:diary-86444591ec14d1d97";
    const fold = foldEnvelopes([binding(diary, "diary"), snapshot([row("c0ffee00c0ffee00c0ffee00c0ffee00", diary, "private words of his book")])]);
    const node = fold.nodes.get(fold.graph_to_row.get(diary) ?? diary)!;
    expect(node.diary).toBe(true);
    expect(node.digest ?? null).toBeNull();
  });
});

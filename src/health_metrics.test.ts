/**
 * Memory-health metrics (mission item: doctoring/health panel).
 *
 * These pin the two properties that carry meaning: records are counted
 * distinctly (envelopes/records = the re-use ratio a doctoring pass
 * targets), and retrieval concentration measures the top records' share of
 * all selected-use (the attractor). General stream properties — the fold
 * is built from real binding/usage/closure envelopes, not hand-set nodes.
 */
import { describe, expect, it } from "vitest";

import { computeHealthMetrics } from "./health_metrics";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";

let seq = 0;
function base(family: ReplayEnvelope["family"], payload: Record<string, unknown>, extra: Partial<ReplayEnvelope> = {}): ReplayEnvelope {
  seq += 1;
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    observed_at: "2026-07-07T00:00:00+00:00",
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: "run-1",
    family,
    payload,
    ...extra,
  } as ReplayEnvelope;
}

function formation(recordId: string, kind: string, title: string): ReplayEnvelope {
  return base(
    "binding",
    {
      record_id: recordId,
      scope: "life",
      owner_id: "entity:test",
      search_state: "indexed",
      prompt_state: "active",
      lifecycle: "formed",
      source: "remember",
      reason: null,
      binding_id: `b-${recordId}`,
      seq,
    },
    { display: { record_id: recordId, kind, title } },
  );
}

/** A selected-use event for a record (drives selected_count) — the engine
 * emits these as family="event" kind="selected" carrying the record id. */
function selection(recordId: string, rowTitle: string): ReplayEnvelope {
  return base(
    "event",
    {
      kind: "selected",
      record_id: recordId,
      scope: "life",
      owner_id: "entity:test",
    },
    { display: { record_id: recordId, kind: "episode", title: rowTitle } },
  );
}

describe("health metrics", () => {
  it("counts distinct records and total stream events (the re-use ratio)", () => {
    const envs = [
      formation("ex:a", "episode", "first"),
      formation("ex:b", "episode", "second"),
      selection("ex:a", "first"),
      selection("ex:a", "first"),
      selection("ex:b", "second"),
    ];
    const m = computeHealthMetrics(foldEnvelopes(envs));
    expect(m.records).toBe(2);
    expect(m.envelopes).toBe(5);
    // ex:a used twice, ex:b once → 3 total uses, both ever-selected.
    expect(m.totalSelectedUse).toBe(3);
    expect(m.everSelected).toBe(2);
  });

  it("measures retrieval concentration (top records' share of recall)", () => {
    // 6 records so the top-5 is a STRICT subset (with ≤5 records the top-5
    // is trivially 100% — the metric only carries meaning past that).
    const envs = [formation("ex:hot", "episode", "hot")];
    for (let i = 1; i <= 5; i++) envs.push(formation(`ex:c${i}`, "episode", `cold ${i}`));
    // ex:hot recalled 5×, each cold once → 10 total uses. Top 5 = hot(5) +
    // four colds(1 each) = 9; the 6th cold is excluded → 90%.
    for (let i = 0; i < 5; i++) envs.push(selection("ex:hot", "hot"));
    for (let i = 1; i <= 5; i++) envs.push(selection(`ex:c${i}`, `cold ${i}`));
    const m = computeHealthMetrics(foldEnvelopes(envs));
    expect(m.records).toBe(6);
    expect(m.totalSelectedUse).toBe(10);
    expect(m.top5[0]?.count).toBe(5); // the attractor leads
    expect(Math.round(m.top5Share * 100)).toBe(90);
  });

  it("reports zero concentration when nothing has been recalled", () => {
    const m = computeHealthMetrics(foldEnvelopes([formation("ex:a", "episode", "a")]));
    expect(m.everSelected).toBe(0);
    expect(m.top5Share).toBe(0);
    expect(m.top5.length).toBe(0);
  });
});

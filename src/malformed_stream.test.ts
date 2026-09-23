/**
 * Hostile/malformed-envelope resilience (code adversary F1/F2/F3/F11).
 *
 * The fold runs in the render path above the panel error boundaries, so a
 * single bad journal line must never take down the app for that life.
 * These pin the two defenses: ingest normalization (normalizeEnvelope /
 * parseNdjson) and the fold's per-envelope guard, plus the ledger's
 * target_id coercion. General stream-consumer properties, not demo data.
 */
import { describe, expect, it } from "vitest";

import { createFoldState, applyEnvelope, foldEnvelopes } from "./stream_fold";
import { ledgerLine } from "./ledger_lines";
import { normalizeEnvelope, parseNdjson } from "./stream_source";
import type { ReplayEnvelope } from "./stream_types";

describe("normalizeEnvelope (ingest boundary, F1/F3)", () => {
  it("coerces a null/missing/scalar payload to an object", () => {
    expect(normalizeEnvelope({ seq: 1, family: "host", payload: null })?.payload).toEqual({});
    expect(normalizeEnvelope({ seq: 1, family: "host" })?.payload).toEqual({});
    expect(normalizeEnvelope({ seq: 1, family: "host", payload: "x" })?.payload).toEqual({});
    expect(normalizeEnvelope({ seq: 1, family: "host", payload: [1, 2] })?.payload).toEqual({});
  });

  it("keeps a real object payload intact", () => {
    const env = normalizeEnvelope({ seq: 1, family: "valence", payload: { target_id: "tool:x", magnitude: 2 } });
    expect((env?.payload as { target_id?: string }).target_id).toBe("tool:x");
  });

  it("rejects non-finite seq (NaN AND Infinity) and non-string family", () => {
    expect(normalizeEnvelope({ seq: NaN, family: "host", payload: {} })).toBeNull();
    expect(normalizeEnvelope({ seq: Infinity, family: "host", payload: {} })).toBeNull();
    expect(normalizeEnvelope({ seq: 1e999, family: "host", payload: {} })).toBeNull(); // parses to Infinity
    expect(normalizeEnvelope({ seq: "10", family: "host", payload: {} })).toBeNull();
    expect(normalizeEnvelope({ seq: 1, family: 5, payload: {} })).toBeNull();
    expect(normalizeEnvelope(null)).toBeNull();
    expect(normalizeEnvelope("nope")).toBeNull();
  });

  it("parseNdjson drops malformed lines with an error, never a throw", () => {
    const text = [
      JSON.stringify({ seq: 1, family: "host", payload: { kind: "summon" } }),
      JSON.stringify({ seq: 2, family: "host", payload: null }), // survives, payload → {}
      '{"seq": 1e999, "family": "host", "payload": {}}', // Infinity seq → dropped
      "{not json", // unparseable → dropped
      JSON.stringify({ seq: 4, family: "valence", payload: { target_id: "p:x", magnitude: 1, kind: "appraisal" } }),
    ].join("\n");
    const { envelopes, errors } = parseNdjson(text);
    expect(envelopes.map((e) => e.seq)).toEqual([1, 2, 4]);
    expect(errors.length).toBe(2);
  });
});

describe("applyEnvelope resilience (fold defense-in-depth, F1/F2)", () => {
  it("a null-payload host envelope does not throw and folds as a session marker", () => {
    const state = createFoldState();
    // Pre-normalization shape: payload {} is what normalizeEnvelope yields.
    expect(() => applyEnvelope(state, { seq: 1, family: "host", payload: {} } as unknown as ReplayEnvelope)).not.toThrow();
    expect(state.sessions.length).toBe(1);
  });

  it("a null item inside a snapshot display array is skipped, not fatal", () => {
    const state = createFoldState();
    const bad = {
      seq: 1,
      family: "snapshot",
      run_id: "r1",
      observed_at: "2026-07-07T00:00:00+00:00",
      payload: { snapshot_id: "s1", trace_id: "t1", used_record_ids: [], display: [null], prompt_token_estimate: 10, seq: 1 },
    } as unknown as ReplayEnvelope;
    expect(() => applyEnvelope(state, bad)).not.toThrow();
    // seq still advanced so the dup-guard/cache stay consistent.
    expect(state.seq).toBe(1);
    expect(state.applied_count).toBe(1);
  });

  it("a non-finite seq is ignored entirely (never poisons state.seq)", () => {
    const state = createFoldState();
    applyEnvelope(state, { seq: Infinity, family: "host", payload: {} } as unknown as ReplayEnvelope);
    expect(state.seq).toBe(0);
    expect(state.applied_count).toBe(0);
  });

  it("foldEnvelopes over a mixed hostile stream produces a coherent state", () => {
    const stream = [
      { seq: 1, family: "host", payload: { kind: "summon" }, observed_at: "", scope: "life", owner_id: "e", trace_id: null, turn_id: null, run_id: "r1", stream: "", stream_version: 1 },
      { seq: 2, family: "valence", payload: {} /* missing target_id */, observed_at: "", scope: "life", owner_id: "e", trace_id: null, turn_id: null, run_id: "r1", stream: "", stream_version: 1 },
    ] as unknown as ReplayEnvelope[];
    expect(() => foldEnvelopes(stream)).not.toThrow();
  });
});

describe("ledgerLine target_id coercion (F11)", () => {
  it("a valence envelope missing target_id renders a line, never throws", () => {
    const env = {
      seq: 5,
      family: "valence",
      observed_at: "2026-07-07T00:00:00+00:00",
      scope: "life",
      owner_id: "e",
      trace_id: null,
      turn_id: null,
      run_id: null,
      stream: "",
      stream_version: 1,
      payload: { kind: "appraisal", magnitude: 2 }, // no target_id
    } as unknown as ReplayEnvelope;
    expect(() => ledgerLine(env)).not.toThrow();
    const line = ledgerLine(env);
    expect(line.title).toBeTruthy();
  });
});

/**
 * Cognition adapter — the feed→embed→score seam (uic split c1824). These
 * pin the honesty properties with a FAKE scorer + stubbed embed (no network,
 * no uic import): a scorer refusal (M1 embedder/dim mismatch) aborts loud
 * rather than emitting fabricated scores, and a dropped/failed embed never
 * produces a sample. The harvest half is pinned in utterance_harvest.test.
 */
import { describe, expect, it, vi } from "vitest";

import { CognitionSpaceError, scoreEntityUtterances, type Scorer } from "./cognition_adapter";
import { foldEnvelopes } from "./stream_fold";
import * as source from "./stream_source";
import type { ReplayEnvelope } from "./stream_types";

let seq = 0;
function episode(recordId: string, title: string): ReplayEnvelope {
  seq += 1;
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    observed_at: `2026-07-07T0${seq}:00:00Z`,
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    family: "binding",
    payload: {
      record_id: recordId,
      scope: "life",
      owner_id: "entity:test",
      search_state: "indexed",
      prompt_state: "active",
      lifecycle: "formed",
      source: "remember",
      reason: null,
      observed_at: `2026-07-07T0${seq}:00:00Z`,
      binding_id: `b-${recordId}`,
      seq,
    },
    display: { record_id: recordId, kind: "episode", title },
  } as ReplayEnvelope;
}

const fold = foldEnvelopes([episode("ex:a", "first moment"), episode("ex:b", "second moment")]);

/** A scorer that returns fixed scores — the widget's contract, faked. */
const okScorer: Scorer = {
  score: () => ({ scores: { warmth: 0.5, tension: -0.2 }, emotions: { calm: 0.1 }, emotionSims: { calm: 0.8, fear: -0.2 }, novelty: 0.1, emotionEvidence: 0.125 }),
  reset: () => {},
};

/** A scorer that refuses (uic's M1 gate: vectors in the wrong space). */
const refusingScorer: Scorer = {
  score: () => {
    throw new Error('embedder mismatch — vectors from "wrong-model" != basis "qwen3-0.6b"');
  },
  reset: () => {},
};

describe("cognition adapter", () => {
  it("scores utterances through the injected embed + scorer", async () => {
    vi.spyOn(source, "fetchEntityEmbedding").mockResolvedValue({ pin: { model_id: "qwen3-0.6b", dimension: 4 }, match: "match" });
    vi.spyOn(source, "fetchRecordVerbatim").mockImplementation(async (_b, _e, id) => ({
      record_id: id,
      text: "A reflective sentence long enough to be a real utterance for scoring.",
    }));
    vi.spyOn(source, "embedTexts").mockResolvedValue({ vectors: [[1, 0, 0, 0], [0, 1, 0, 0]], model: "qwen3-0.6b", dimension: 4 });

    const out = await scoreEntityUtterances("http://x", "castor", fold, okScorer);
    expect(out.samples.length).toBe(2);
    expect(out.samples[0].scores.warmth).toBe(0.5);
    // The monitor shows each register's measured similarity, never the gated values (operator 2026-11-07).
    expect(out.samples[0].emotions).toEqual({ calm: 0.8, fear: -0.2 });
    expect(out.samples[0].emotionEvidence).toBe(0.125);
    expect(out.samples[0].text).toBeTruthy(); // includeText default
    expect(out.embedderId).toBe("qwen3-0.6b");
    vi.restoreAllMocks();
  });

  it("ABORTS LOUD on a scorer refusal — never emits fabricated scores", async () => {
    vi.spyOn(source, "fetchEntityEmbedding").mockResolvedValue({ pin: { model_id: "qwen3-0.6b", dimension: 4 }, match: "match" });
    vi.spyOn(source, "fetchRecordVerbatim").mockImplementation(async (_b, _e, id) => ({ record_id: id, text: "A long enough utterance to be scored honestly." }));
    vi.spyOn(source, "embedTexts").mockResolvedValue({ vectors: [[1, 0, 0, 0], [0, 1, 0, 0]], model: "qwen3-0.6b", dimension: 4 });

    await expect(scoreEntityUtterances("http://x", "castor", fold, refusingScorer)).rejects.toBeInstanceOf(CognitionSpaceError);
    vi.restoreAllMocks();
  });

  it("drops an utterance with no vector, warns, never fabricates", async () => {
    vi.spyOn(source, "fetchEntityEmbedding").mockResolvedValue({ pin: { model_id: "qwen3-0.6b", dimension: 4 }, match: "match" });
    vi.spyOn(source, "fetchRecordVerbatim").mockImplementation(async (_b, _e, id) => ({ record_id: id, text: "A long enough utterance to be scored honestly." }));
    // Second vector is empty → that utterance is dropped.
    vi.spyOn(source, "embedTexts").mockResolvedValue({ vectors: [[1, 0, 0, 0], []], model: "qwen3-0.6b", dimension: 4 });

    const out = await scoreEntityUtterances("http://x", "castor", fold, okScorer);
    expect(out.samples.length).toBe(1);
    expect(out.warnings.some((w) => w.includes("no usable vector"))).toBe(true);
    vi.restoreAllMocks();
  });
});

describe("isUsableVector (a broken embedding is never a reading)", () => {
  it("refuses empty, non-finite and all-zero vectors", async () => {
    const { isUsableVector } = await import("./cognition_adapter");
    expect(isUsableVector([0.1, 0, -0.2])).toBe(true);
    expect(isUsableVector([])).toBe(false);
    expect(isUsableVector([0, 0, 0])).toBe(false);
    expect(isUsableVector([0.1, Number.NaN])).toBe(false);
    expect(isUsableVector(null)).toBe(false);
  });
});

describe("the one read covers his whole life (backlog 0040: the monitor follows any position)", () => {
  // Ten moments, an hour apart, in order.
  const life = foldEnvelopes(
    Array.from({ length: 10 }, (_, i) => {
      const env = episode(`ex:m${i}`, `moment ${i}`);
      const at = `2026-07-08T${String(i + 10).padStart(2, "0")}:00:00Z`;
      return { ...env, observed_at: at, payload: { ...(env.payload as object), observed_at: at } } as ReplayEnvelope;
    }),
  );

  it("spreads `limit` items from the first to the last, in order; all of them when there are no more", async () => {
    const { spreadOverLife } = await import("./cognition_adapter");
    const ten = Array.from({ length: 10 }, (_, i) => i);
    expect(spreadOverLife(ten, 4)).toEqual([0, 3, 6, 9]);
    expect(spreadOverLife(ten, 10)).toEqual(ten);
    expect(spreadOverLife(ten, 50)).toEqual(ten);
    expect(spreadOverLife(ten, 1)).toEqual([9]);
    expect(new Set(spreadOverLife(Array.from({ length: 121 }, (_, i) => i), 120)).size).toBe(120);
  });

  it("with a limit, the read fetches his first, his latest and the moments evenly between, never his first ones only", async () => {
    vi.spyOn(source, "fetchEntityEmbedding").mockResolvedValue({ pin: { model_id: "qwen3-0.6b", dimension: 4 }, match: "match" });
    const read = vi.spyOn(source, "fetchRecordVerbatim").mockImplementation(async (_b, _e, id) => ({ record_id: id, text: "A long enough utterance to be scored honestly." }));
    vi.spyOn(source, "embedTexts").mockImplementation(async (_b, texts) => ({ vectors: texts.map(() => [1, 0, 0, 0]), model: "qwen3-0.6b", dimension: 4 }));
    const out = await scoreEntityUtterances("http://x", "castor", life, okScorer, { limit: 4 });
    expect(read.mock.calls.map((c) => c[2]).sort()).toEqual(["ex:m0", "ex:m3", "ex:m6", "ex:m9"]);
    expect(out.samples.map((s) => s.id)).toEqual(["ex:m0", "ex:m3", "ex:m6", "ex:m9"]);
    vi.restoreAllMocks();
  });
});

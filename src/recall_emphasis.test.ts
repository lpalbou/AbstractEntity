/**
 * Recall highlight — which memories light at the scrub position, why each
 * entered, and when the highlight releases. Built on the real fold (the
 * same envelopes the stream serves: bindings, a trace, its usage events,
 * the answer's episode binding), never on hand-made fold objects.
 */
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import {
  activeBeat,
  admissionClass,
  canvasRecall,
  answerLanded,
  dimRampSec,
  emphasisDriver,
  HOVER_RAMP_SEC,
  RECALL_RAMP_SEC,
  recallEmphasis,
  recallLegendText,
} from "./recall_emphasis";

function env(seq: number, family: ReplayEnvelope["family"], payload: Record<string, unknown>, extra: Partial<ReplayEnvelope> = {}): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family,
    observed_at: "2026-11-07T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload,
    ...extra,
  } as ReplayEnvelope;
}

function binding(seq: number, id: string, kind: string, title = id): ReplayEnvelope {
  return env(
    seq,
    "binding",
    { record_id: id, scope: "life", owner_id: "entity:test", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    { display: { record_id: id, kind, title } as ReplayEnvelope["display"] },
  );
}

function trace(seq: number, traceId: string, selected: string[], admissions: Record<string, string>, dropped: string[] = []): ReplayEnvelope {
  return env(
    seq,
    "trace",
    {
      trace_id: traceId,
      trace_kind: "reconstruct",
      need: { cue_text: "what did we say?", turn_id: "t-1" },
      searched_scopes: [],
      channels: [],
      candidates: [],
      selected,
      dropped: dropped.map((record_id) => ({ record_id, reason: "budget" })),
      cues: [],
      stop_reason: "budget",
      warnings: [],
      admissions,
      seq,
    },
    { trace_id: traceId },
  );
}

function selectedEvent(seq: number, id: string, traceId: string): ReplayEnvelope {
  return env(
    seq,
    "event",
    { kind: "selected", scope: "life", owner_id: "entity:test", record_id: id, pair_ids: null, weight: 8, matched: true, event_id: `e${seq}`, seq },
    { trace_id: traceId },
  );
}

/** A small life: identity value + three memories + a dropped one, one
 * recall, its usage events, then the answer's episode binding at seq 20. */
function life(): ReplayEnvelope[] {
  return [
    binding(1, "ex:value-a", "value", "I keep my word"),
    binding(2, "ex:memory-b", "memory", "the media server"),
    binding(3, "ex:memory-c", "memory", "the blue door"),
    binding(4, "ex:episode-d", "episode", "exchange: yesterday"),
    binding(5, "ex:memory-e", "memory", "never chosen"),
    trace(10, "tr1", ["ex:value-a", "ex:memory-b", "ex:memory-c", "ex:episode-d"], {
      "ex:value-a": "self",
      "ex:memory-b": "stm",
      "ex:memory-c": "stimulus",
      "ex:episode-d": "both",
    }, ["ex:memory-e"]),
    selectedEvent(11, "ex:memory-b", "tr1"),
    selectedEvent(12, "ex:memory-c", "tr1"),
    binding(20, "ex:episode-answer", "episode", "exchange: today"),
  ];
}

describe("admissionClass", () => {
  it("maps the engine's four labels onto the three classes a person reads", () => {
    expect(admissionClass("self")).toBe("self");
    expect(admissionClass("stm")).toBe("stm");
    expect(admissionClass("stimulus")).toBe("matched");
    expect(admissionClass("both")).toBe("matched");
    expect(admissionClass("other")).toBeNull();
    expect(admissionClass(undefined)).toBeNull();
  });
});

describe("activeBeat", () => {
  it("is the last recall at or before the scrub (the Inspector's rule)", () => {
    const envs = [...life(), trace(30, "tr2", ["ex:memory-b"], { "ex:memory-b": "stimulus" })];
    const fold = foldEnvelopes(envs);
    expect(activeBeat(fold, 9)).toBeNull();
    expect(activeBeat(fold, 10)?.trace_id).toBe("tr1");
    expect(activeBeat(fold, 29)?.trace_id).toBe("tr1");
    expect(activeBeat(fold, 30)?.trace_id).toBe("tr2");
  });
});

describe("recallEmphasis", () => {
  it("lights the shelf with each memory's class while the turn is open", () => {
    const fold = foldEnvelopes(life(), 12);
    const e = recallEmphasis(fold, 12)!;
    expect(e).not.toBeNull();
    expect(e.trace_id).toBe("tr1");
    expect([...e.ids].sort()).toEqual(["ex:episode-d", "ex:memory-b", "ex:memory-c", "ex:value-a"]);
    expect(e.ids.has("ex:memory-e")).toBe(false); // dropped stays dim
    expect(e.classes.get("ex:value-a")).toBe("self");
    expect(e.classes.get("ex:memory-b")).toBe("stm");
    expect(e.classes.get("ex:memory-c")).toBe("matched");
    expect(e.classes.get("ex:episode-d")).toBe("matched");
    expect(e.labels.get("ex:episode-d")).toBe("both");
    expect(e.counts).toEqual({ total: 4, self: 1, stm: 1, matched: 2 });
  });

  it("is lit from the recall itself, before any usage event", () => {
    const fold = foldEnvelopes(life(), 10);
    expect(recallEmphasis(fold, 10)?.ids.size).toBe(4);
  });

  it("releases when the turn's answer (the next episode binding) lands", () => {
    const fold = foldEnvelopes(life(), 20);
    expect(recallEmphasis(fold, 19)).not.toBeNull();
    expect(recallEmphasis(fold, 20)).toBeNull();
  });

  it("an old episode REVEALED after the trace is not the answer", () => {
    // The episode exists only through the recall's own usage event (no
    // binding in this stream): first seen at seq 11, after the trace.
    const envs = [
      binding(1, "ex:memory-b", "memory"),
      trace(10, "tr1", ["ex:memory-b", "row-old-ep"], { "ex:memory-b": "stm", "row-old-ep": "stimulus" }),
      env(11, "event", { kind: "listed", scope: "life", owner_id: "entity:test", record_id: "row-old-ep", pair_ids: null, weight: 0, matched: true, event_id: "e11", seq: 11 }, {
        trace_id: "tr1",
        display: { record_id: "row-old-ep", kind: "episode", title: "exchange: long ago" } as ReplayEnvelope["display"],
      }),
    ];
    const fold = foldEnvelopes(envs);
    expect(fold.nodes.get("row-old-ep")?.kind).toBe("episode");
    const beat = activeBeat(fold, 11)!;
    expect(answerLanded(fold, beat, 11)).toBe(false);
    expect(recallEmphasis(fold, 11)?.ids.has("row-old-ep")).toBe(true);
  });

  it("the next recall replaces the previous one", () => {
    const envs = [...life().slice(0, 8), trace(15, "tr2", ["ex:memory-e"], { "ex:memory-e": "stimulus" })];
    const fold = foldEnvelopes(envs);
    const e = recallEmphasis(fold, 15)!;
    expect(e.trace_id).toBe("tr2");
    expect([...e.ids]).toEqual(["ex:memory-e"]);
  });

  it("scrubbing back to a past recall lights it again", () => {
    // A prefix fold at the scrub (what the canvas receives after a scrub).
    const later = [...life(), trace(30, "tr2", ["ex:memory-e"], { "ex:memory-e": "stimulus" }), binding(40, "ex:episode-2", "episode")];
    expect(recallEmphasis(foldEnvelopes(later), 40)).toBeNull();
    const scrubbed = foldEnvelopes(later, 12);
    expect(recallEmphasis(scrubbed, 12)?.trace_id).toBe("tr1");
  });

  it("resolves shelf ids through graph_to_row (re-keyed nodes still light)", () => {
    const envs = [
      binding(1, "ex:memory-b", "memory", "the media server"),
      // A usage event revealing the row id of ex:memory-b re-keys the node.
      env(2, "event", { kind: "listed", scope: "life", owner_id: "entity:test", record_id: "row-b", pair_ids: null, weight: 0, matched: false, event_id: "e2", seq: 2 }, {
        display: { record_id: "row-b", graph_id: "ex:memory-b", title: "the media server" } as ReplayEnvelope["display"],
      }),
      trace(10, "tr1", ["ex:memory-b"], { "ex:memory-b": "stm" }),
    ];
    const fold = foldEnvelopes(envs);
    expect(fold.nodes.has("row-b")).toBe(true);
    const e = recallEmphasis(fold, 10)!;
    expect([...e.ids]).toEqual(["row-b"]);
    expect(e.classes.get("row-b")).toBe("stm");
  });

  it("an empty shelf lights nothing", () => {
    const fold = foldEnvelopes([binding(1, "ex:memory-b", "memory"), trace(10, "tr1", [], {})]);
    expect(recallEmphasis(fold, 10)).toBeNull();
  });
});

describe("canvasRecall", () => {
  it("a recall line picked in the ledger lights THAT beat, answered or not", () => {
    const envs = [...life(), trace(30, "tr2", ["ex:memory-e"], { "ex:memory-e": "stimulus" })];
    const fold = foldEnvelopes(envs);
    // At the head the scrub recall is tr2…
    expect(canvasRecall(fold, 30, null)?.trace_id).toBe("tr2");
    // …but the operator picked tr1's ledger line (its answer landed at 20).
    const picked = canvasRecall(fold, 30, "beat:tr1")!;
    expect(picked.trace_id).toBe("tr1");
    expect(picked.ids.size).toBe(4);
    expect(canvasRecall(fold, 30, "beat:nope")).toBeNull();
  });

  it("a node selection leaves the scrub recall as the canvas recall", () => {
    const fold = foldEnvelopes(life(), 12);
    expect(canvasRecall(fold, 12, "ex:memory-b")?.trace_id).toBe("tr1");
  });
});

describe("recallLegendText", () => {
  it("states the shelf the way the ledger line counts it", () => {
    const e = recallEmphasis(foldEnvelopes(life(), 12), 12)!;
    expect(recallLegendText(e)).toBe("4 memories recalled for this turn: 1 present by right · 1 from continuity · 2 matched");
  });

  it("omits empty classes and speaks the singular", () => {
    const fold = foldEnvelopes([binding(1, "ex:memory-b", "memory"), trace(10, "tr1", ["ex:memory-b"], { "ex:memory-b": "stm" })]);
    expect(recallLegendText(recallEmphasis(fold, 10)!)).toBe("1 memory recalled for this turn: 1 from continuity");
  });
});

describe("emphasisDriver", () => {
  it("orders the triggers: filter > hover/selection > recall", () => {
    expect(emphasisDriver({ filter: true, hover: true, selected: true, recall: true })).toBe("filter");
    expect(emphasisDriver({ filter: false, hover: true, selected: false, recall: true })).toBe("focus");
    expect(emphasisDriver({ filter: false, hover: false, selected: true, recall: true })).toBe("focus");
    expect(emphasisDriver({ filter: false, hover: false, selected: false, recall: true })).toBe("recall");
    expect(emphasisDriver({ filter: false, hover: false, selected: false, recall: false })).toBeNull();
  });
});

describe("dimRampSec", () => {
  it("eases the recall over ~600 ms and keeps hover at 0.5 s", () => {
    expect(RECALL_RAMP_SEC).toBe(0.6);
    expect(HOVER_RAMP_SEC).toBe(0.5);
    expect(dimRampSec(1000, null)).toBe(HOVER_RAMP_SEC);
    expect(dimRampSec(1000, 1000)).toBe(RECALL_RAMP_SEC);
    // The release eases at the arrival pace…
    expect(dimRampSec(1500, 1000)).toBe(RECALL_RAMP_SEC);
    // …then hover pace returns.
    expect(dimRampSec(1700, 1000)).toBe(HOVER_RAMP_SEC);
  });
});

/**
 * Recall highlight — which memories light at the scrub position, why each
 * entered, that the highlight STAYS after his answer until the next recall
 * replaces it, and the reader's "Context" toggle. Built on the real fold
 * (the same envelopes the stream serves: bindings, a trace, its usage
 * events, the answer's episode binding), never on hand-made fold objects.
 */
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import {
  activeBeat,
  admissionClass,
  canvasRecall,
  CONTEXT_CHOICE_KEY,
  CONTEXT_HINT_EMPTY,
  CONTEXT_HINT_NONE,
  CONTEXT_TITLE,
  contextAvailability,
  contextToggleView,
  DIMMED_EDGE,
  dimRampSec,
  edgeDimTarget,
  edgeWarmthShown,
  emphasisDriver,
  HOVER_RAMP_SEC,
  nodeGlowShown,
  RECALL_GLOW_SCALE,
  resolveSelection,
  RECALL_RAMP_SEC,
  recallEmphasis,
  readContextChoice,
  recallLegendText,
  TURN_PAIR_WARMTH,
  writeContextChoice,
} from "./recall_emphasis";
import { computeTemporalActivation, nodeWarmth, pairWarmth } from "./temporal_activation";

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

  it("STAYS lit after his answer lands (operator 2026-11-08: the current context for the response)", () => {
    const fold = foldEnvelopes(life());
    // seq 20 is the answer's episode binding; long after it, still lit.
    for (const at of [19, 20, 500]) {
      const e = recallEmphasis(fold, at)!;
      expect(e.trace_id).toBe("tr1");
      expect([...e.ids].sort()).toEqual(["ex:episode-d", "ex:memory-b", "ex:memory-c", "ex:value-a"]);
    }
    // The answer's own episode is not part of the context.
    expect(recallEmphasis(fold, 20)!.ids.has("ex:episode-answer")).toBe(false);
  });

  it("keeps the turn's pairs after the answer (the 74c6806 rule holds through it)", () => {
    const envs = [...twoTurns(), binding(40, "ex:episode-2", "episode", "exchange: second")];
    const e = recallEmphasis(foldEnvelopes(envs), 40)!;
    expect(e.trace_id).toBe("tr2");
    expect([...e.pairs]).toEqual([key("ex:memory-c", "ex:memory-d")]);
  });

  it("the next recall replaces the previous one, whole (shelf and pairs, never a merge)", () => {
    // Prefix folds at the scrub, as the canvas receives them live.
    // Before turn 2's recall: turn 1's context, answered at 20, still lit.
    const before = recallEmphasis(foldEnvelopes(twoTurns(), 29), 29)!;
    expect(before.trace_id).toBe("tr1");
    expect(before.ids.has("ex:memory-e")).toBe(true);
    expect(before.pairs.has(key("ex:memory-b", "ex:memory-c"))).toBe(true);
    // At turn 2's recall: its shelf only; e (turn 1, dropped now) is out,
    // and none of turn 1's pairs ride along.
    const after = recallEmphasis(foldEnvelopes(twoTurns(), 30), 30)!;
    expect(after.trace_id).toBe("tr2");
    expect([...after.ids].sort()).toEqual(["ex:memory-b", "ex:memory-c", "ex:memory-d"]);
    expect(after.pairs.size).toBe(0);
  });

  it("scrubbing back to a past recall lights it again (replay)", () => {
    // A prefix fold at the scrub (what the canvas receives after a scrub).
    const later = [...life(), trace(30, "tr2", ["ex:memory-e"], { "ex:memory-e": "stimulus" }), binding(40, "ex:episode-2", "episode")];
    expect(recallEmphasis(foldEnvelopes(later), 40)?.trace_id).toBe("tr2");
    const scrubbed = foldEnvelopes(later, 25);
    expect(recallEmphasis(scrubbed, 25)?.trace_id).toBe("tr1");
    expect(recallEmphasis(foldEnvelopes(later, 9), 9)).toBeNull();
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
  it("a recall line picked in the ledger lights THAT beat, answered or not, whatever the toggle", () => {
    const envs = [...life(), trace(30, "tr2", ["ex:memory-e"], { "ex:memory-e": "stimulus" })];
    const fold = foldEnvelopes(envs);
    // At the head the scrub recall is tr2…
    expect(canvasRecall(fold, 30, null, true)?.trace_id).toBe("tr2");
    // …but the operator picked tr1's ledger line (its answer landed at 20).
    const picked = canvasRecall(fold, 30, "beat:tr1", true)!;
    expect(picked.trace_id).toBe("tr1");
    expect(picked.ids.size).toBe(4);
    expect(canvasRecall(fold, 30, "beat:tr1", false)?.trace_id).toBe("tr1");
    expect(canvasRecall(fold, 30, "beat:nope", true)).toBeNull();
  });

  it("a node selection leaves the scrub recall as the canvas recall", () => {
    const fold = foldEnvelopes(life(), 12);
    expect(canvasRecall(fold, 12, "ex:memory-b", true)?.trace_id).toBe("tr1");
  });

  it("the Context toggle: off shows the plain graph, on again brings the same context back", () => {
    const fold = foldEnvelopes(life());
    expect(canvasRecall(fold, 30, null, true)?.trace_id).toBe("tr1");
    expect(canvasRecall(fold, 30, null, false)).toBeNull();
    expect(canvasRecall(fold, 30, "ex:memory-b", false)).toBeNull();
    const back = canvasRecall(fold, 30, null, true)!;
    expect(back.trace_id).toBe("tr1");
    expect(back.ids.size).toBe(4);
  });
});

describe("the Context toggle", () => {
  it("no recall yet: disabled with a hint, never pressed — whatever the choice", () => {
    const fold = foldEnvelopes(life(), 9);
    expect(contextAvailability(fold, 9)).toBe("none");
    for (const chosen of [true, false]) {
      const view = contextToggleView(contextAvailability(fold, 9), chosen);
      expect(view).toEqual({ pressed: false, disabled: true, title: CONTEXT_HINT_NONE });
    }
    // An empty shelf has nothing to light either; its hint says so.
    const empty = foldEnvelopes([binding(1, "ex:memory-b", "memory"), trace(10, "tr1", [], {})]);
    expect(contextAvailability(empty, 10)).toBe("empty");
    expect(contextToggleView("empty", true)).toEqual({ pressed: false, disabled: true, title: CONTEXT_HINT_EMPTY });
  });

  it("a recall exists: enabled, pressed = the reader's choice (on by default), titled by what it shows", () => {
    const fold = foldEnvelopes(life());
    // Before and after the answer alike.
    for (const at of [12, 20, 500]) expect(contextAvailability(fold, at)).toBe("ready");
    expect(contextToggleView("ready", true)).toEqual({ pressed: true, disabled: false, title: `Context: ${CONTEXT_TITLE}` });
    expect(contextToggleView("ready", false)).toEqual({ pressed: false, disabled: false, title: `Context: ${CONTEXT_TITLE}` });
    expect(CONTEXT_TITLE).toBe("the memories he brought to mind for his last answer");
  });

  it("the choice is remembered per browser session, on by default, and storage failures never break it", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readContextChoice(storage)).toBe(true);
    writeContextChoice(storage, false);
    expect(store.get(CONTEXT_CHOICE_KEY)).toBe("off");
    expect(readContextChoice(storage)).toBe(false);
    writeContextChoice(storage, true);
    expect(readContextChoice(storage)).toBe(true);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readContextChoice(throwing)).toBe(true);
    expect(() => writeContextChoice(throwing, false)).not.toThrow();
    expect(readContextChoice(null)).toBe(true);
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

describe("resolveSelection", () => {
  it("a memory opened by its graph id is the canvas's row-id selection (the Inspector's rule)", () => {
    const envs = [
      binding(1, "ex:memory-b", "memory", "the media server"),
      env(2, "event", { kind: "listed", scope: "life", owner_id: "entity:test", record_id: "row-b", pair_ids: null, weight: 0, matched: false, event_id: "e2", seq: 2 }, {
        display: { record_id: "row-b", graph_id: "ex:memory-b", title: "the media server" } as ReplayEnvelope["display"],
      }),
      binding(3, "ex:memory-c", "memory"),
      trace(10, "tr1", ["row-b", "ex:memory-c"], { "row-b": "stm", "ex:memory-c": "stimulus" }),
    ];
    const fold = foldEnvelopes(envs);
    expect(resolveSelection(fold, "ex:memory-b")).toBe("row-b");
    expect(resolveSelection(fold, "row-b")).toBe("row-b");
    expect(resolveSelection(fold, "ex:memory-c")).toBe("ex:memory-c");
    expect(resolveSelection(fold, "standing:person:x")).toBe("standing:person:x");
    expect(resolveSelection(fold, null)).toBeNull();
    // A selection the canvas sees outranks the recall (Detail shows it).
    expect(emphasisDriver({ filter: false, hover: false, selected: fold.nodes.has(resolveSelection(fold, "ex:memory-b")!), recall: true })).toBe("focus");
  });
});

function coSelected(seq: number, a: string, b: string, traceId: string, pair?: Array<Record<string, unknown>>): ReplayEnvelope {
  return env(
    seq,
    "event",
    { kind: "co_selected", scope: "life", owner_id: "entity:test", record_id: null, pair_ids: [a, b], weight: 4, event_id: `e${seq}`, seq },
    { trace_id: traceId, ...(pair ? { display: { pair } as unknown as ReplayEnvelope["display"] } : {}) },
  );
}

/** Two turns. Turn 1 shelves b, c, e and uses b+c and c+e together; turn 2
 * shelves b, c, d (e DROPPED) and uses only c+d together. Before turn 2's
 * answer lands, b and c share the shelf and were used together EARLIER,
 * and e is still warm from turn 1. */
function twoTurns(): ReplayEnvelope[] {
  return [
    binding(1, "ex:memory-b", "memory", "the media server"),
    binding(2, "ex:memory-c", "memory", "the blue door"),
    binding(3, "ex:memory-d", "memory", "the harbour"),
    binding(4, "ex:memory-e", "memory", "the old route"),
    trace(10, "tr1", ["ex:memory-b", "ex:memory-c", "ex:memory-e"], { "ex:memory-b": "stimulus", "ex:memory-c": "stimulus", "ex:memory-e": "stimulus" }),
    selectedEvent(11, "ex:memory-b", "tr1"),
    selectedEvent(12, "ex:memory-c", "tr1"),
    selectedEvent(13, "ex:memory-e", "tr1"),
    coSelected(14, "ex:memory-b", "ex:memory-c", "tr1"),
    coSelected(15, "ex:memory-c", "ex:memory-e", "tr1"),
    binding(20, "ex:episode-1", "episode", "exchange: first"),
    trace(30, "tr2", ["ex:memory-b", "ex:memory-c", "ex:memory-d"], { "ex:memory-b": "stimulus", "ex:memory-c": "stimulus", "ex:memory-d": "stimulus" }, ["ex:memory-e"]),
    selectedEvent(31, "ex:memory-c", "tr2"),
    selectedEvent(32, "ex:memory-d", "tr2"),
    coSelected(33, "ex:memory-c", "ex:memory-d", "tr2"),
    // A co-use with no trace belongs to no turn.
    env(34, "event", { kind: "co_selected", scope: "life", owner_id: "entity:test", record_id: null, pair_ids: ["ex:memory-b", "ex:memory-d"], weight: 4, event_id: "e34", seq: 34 }),
  ];
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

describe("each turn's used-together pairs (operator 2026-11-08: more edges lit than visited)", () => {
  it("the fold records a turn's co-use pairs on its own beat, and only its own", () => {
    const fold = foldEnvelopes(twoTurns());
    expect([...fold.beats.get("tr1")!.used_pairs.keys()].sort()).toEqual([key("ex:memory-b", "ex:memory-c"), key("ex:memory-c", "ex:memory-e")]);
    expect([...fold.beats.get("tr2")!.used_pairs.keys()]).toEqual([key("ex:memory-c", "ex:memory-d")]);
    // The traceless co-use made an edge but is no turn's pair.
    expect(fold.edges.has(key("ex:memory-b", "ex:memory-d"))).toBe(true);
  });

  it("the recall carries THIS turn's pairs — not the earlier pair between two memories on its shelf", () => {
    const fold = foldEnvelopes(twoTurns());
    const e = recallEmphasis(fold, 34)!;
    expect(e.trace_id).toBe("tr2");
    expect(e.ids.has("ex:memory-b") && e.ids.has("ex:memory-c")).toBe(true);
    expect([...e.pairs]).toEqual([key("ex:memory-c", "ex:memory-d")]);
    // The pairs light as they arrive: before the turn's co-use, none.
    expect(recallEmphasis(foldEnvelopes(twoTurns(), 32), 32)!.pairs.size).toBe(0);
    // A ledger pick of the earlier beat shows ITS pairs.
    expect([...canvasRecall(fold, 34, "beat:tr1", true)!.pairs].sort()).toEqual([key("ex:memory-b", "ex:memory-c"), key("ex:memory-c", "ex:memory-e")]);
  });

  it("a pair deposited before its node re-keyed (graph id -> row id) still names the drawn edge", () => {
    const envs = [
      binding(1, "ex:memory-b1", "memory", "the media server"),
      binding(2, "ex:memory-c1", "memory", "the blue door"),
      trace(10, "tr1", ["ex:memory-b1", "ex:memory-c1"], { "ex:memory-b1": "stimulus", "ex:memory-c1": "stimulus" }),
      // An edge row of b (relation title) resolves onto b's GRAPH node; c's
      // row reveals itself and re-keys c at once.
      coSelected(11, "row-edge", "row-c", "tr1", [
        { record_id: "row-edge", title: "ex:memory-b1 knows", graph_id: "ex:memory-b1" },
        { record_id: "row-c", title: "the blue door", graph_id: "ex:memory-c1" },
      ]),
      // b's own row is revealed later: b re-keys to row-b.
      env(12, "event", { kind: "listed", scope: "life", owner_id: "entity:test", record_id: "row-b", pair_ids: null, weight: 0, matched: false, event_id: "e12", seq: 12 }, {
        display: { record_id: "row-b", graph_id: "ex:memory-b1", title: "the media server" } as ReplayEnvelope["display"],
      }),
    ];
    const fold = foldEnvelopes(envs);
    expect([...fold.beats.get("tr1")!.used_pairs.keys()]).toEqual([key("ex:memory-b1", "row-c")]);
    const e = recallEmphasis(fold, 12)!;
    expect([...e.pairs]).toEqual([key("row-b", "row-c")]);
    expect(fold.edges.has(key("row-b", "row-c"))).toBe(true);
  });
});

describe("what the canvas lights under the recall", () => {
  it("edgeDimTarget: under the recall only this turn's pairs are lit; other drivers keep both-ends-lit", () => {
    const shelf = new Set(["b", "c", "d"]);
    const pairs = new Set([key("c", "d")]);
    expect(edgeDimTarget(shelf, pairs, "c", "d", key("c", "d"))).toBe(1);
    // Both ends on the shelf, used together only EARLIER: dimmed.
    expect(edgeDimTarget(shelf, pairs, "b", "c", key("b", "c"))).toBe(DIMMED_EDGE);
    // A born-linked edge between two shelf memories: dimmed (no turn uses it).
    expect(edgeDimTarget(shelf, pairs, "c", "d", null)).toBe(DIMMED_EDGE);
    // Hover/selection/filter: lit when both ends are emphasized (unchanged).
    expect(edgeDimTarget(shelf, null, "b", "c", key("b", "c"))).toBe(1);
    expect(edgeDimTarget(shelf, null, "b", "e", key("b", "e"))).toBe(DIMMED_EDGE);
    expect(edgeDimTarget(null, null, "b", "e", key("b", "e"))).toBe(1);
  });

  it("edgeWarmthShown: under the recall green means used THIS turn, never multi-turn warmth", () => {
    const pairs = new Set([key("c", "d")]);
    expect(edgeWarmthShown(pairs, key("c", "d"), 0)).toBe(TURN_PAIR_WARMTH);
    expect(edgeWarmthShown(pairs, key("b", "c"), 0.9)).toBe(0);
    expect(edgeWarmthShown(null, key("b", "c"), 0.9)).toBe(0.9);
  });

  it("nodeGlowShown: under the recall only the shelf glows (stepped back); at rest the warmth glows as before", () => {
    const shelf = new Set(["b"]);
    expect(nodeGlowShown(shelf, "b", 0.8)).toBeCloseTo(0.8 * RECALL_GLOW_SCALE);
    expect(nodeGlowShown(shelf, "e", 0.8)).toBe(0);
    expect(nodeGlowShown(null, "e", 0.8)).toBe(0.8);
  });

  it("on a real fold: green lit edges = this turn's pairs; the dropped warm memory does not glow", () => {
    const fold = foldEnvelopes(twoTurns());
    const temporal = computeTemporalActivation(fold.attention);
    const recall = recallEmphasis(fold, 34)!;
    // Resting view: three warm trails (two from turn 1), e still warm.
    const warmAtRest = [...fold.edges.values()].filter((e) => pairWarmth(temporal.pairs.get(e.key) ?? 0) > 0).length;
    expect(warmAtRest).toBe(4);
    expect(nodeWarmth(temporal.records.get("ex:memory-e") ?? 0)).toBeGreaterThan(0.02);
    // Under the recall.
    const greenLit = [...fold.edges.values()].filter(
      (e) => edgeDimTarget(recall.ids, recall.pairs, e.a, e.b, e.key) === 1 && edgeWarmthShown(recall.pairs, e.key, pairWarmth(temporal.pairs.get(e.key) ?? 0)) > 0,
    );
    expect(greenLit.map((e) => e.key)).toEqual([key("ex:memory-c", "ex:memory-d")]);
    const glowing = [...fold.nodes.values()].filter((n) => nodeGlowShown(recall.ids, n.id, nodeWarmth(temporal.records.get(n.id) ?? 0)) > 0.02).map((n) => n.id);
    expect(glowing).not.toContain("ex:memory-e");
    expect(glowing.sort()).toEqual(["ex:memory-b", "ex:memory-c", "ex:memory-d"]);
  });
});

/**
 * Recall highlight — which memories light at the scrub position, why each
 * entered, that the highlight STAYS after his answer until the next recall
 * replaces it, and the reader's "Context" toggle. Built on the real fold
 * (the same envelopes the stream serves: bindings, a trace, its usage
 * events, the answer's episode binding), never on hand-made fold objects.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  canvasSelection,
  edgeDimTarget,
  emphasisDriver,
  HOVER_RAMP_SEC,
  RECALL_CLASS_MEANING,
  resolveSelection,
  RECALL_RAMP_SEC,
  recallEmphasis,
  readContextChoice,
  recallLegendRows,
  recallLegendText,
  lineAt,
  TRAVELLED_LEGEND,
  trailsBefore,
  travelledLines,
  travelledLineWords,
  USED_TOGETHER,
  writeContextChoice,
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
    expect(recallLegendText(e)).toBe("4 memories recalled for this turn: 1 present by right · 1 continuity · 2 matched");
  });

  it("omits empty classes and speaks the singular", () => {
    const fold = foldEnvelopes([binding(1, "ex:memory-b", "memory"), trace(10, "tr1", ["ex:memory-b"], { "ex:memory-b": "stm" })]);
    expect(recallLegendText(recallEmphasis(fold, 10)!)).toBe("1 memory recalled for this turn: 1 continuity");
  });

  it("the legend says what each ring colour means, in the operator's words, all three rings always", () => {
    expect(RECALL_CLASS_MEANING).toEqual({
      self: "memories he always keeps in mind",
      stm: "memories that followed from the last ones",
      matched: "memories found for this message",
    });
    const fold = foldEnvelopes([binding(1, "ex:memory-b", "memory"), trace(10, "tr1", ["ex:memory-b"], { "ex:memory-b": "stm" })]);
    expect(recallLegendRows(recallEmphasis(fold, 10)!)).toEqual([
      { cls: "self", count: 0, name: "present by right", meaning: "memories he always keeps in mind" },
      { cls: "stm", count: 1, name: "continuity", meaning: "memories that followed from the last ones" },
      { cls: "matched", count: 0, name: "matched", meaning: "memories found for this message" },
    ]);
    expect(TRAVELLED_LEGEND).toBe("lit lines: his path to each recalled memory, in its ring's colour");
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
  it("edgeDimTarget: under the recall only the travelled paths are lit; other drivers keep both-ends-lit", () => {
    const shelf = new Set(["b", "c", "d"]);
    const travelled = new Map([[key("c", "d"), "matched" as const]]);
    expect(edgeDimTarget(shelf, travelled, "c", "d", key("c", "d"))).toBe(1);
    // Both ends on the shelf, but no path travelled between them: dimmed.
    expect(edgeDimTarget(shelf, travelled, "b", "c", key("b", "c"))).toBe(DIMMED_EDGE);
    // A born-linked edge between two shelf memories: dimmed (no step travels it).
    expect(edgeDimTarget(shelf, travelled, "c", "d", null)).toBe(DIMMED_EDGE);
    // Hover/selection/filter: lit when both ends are emphasized (unchanged).
    expect(edgeDimTarget(shelf, null, "b", "c", key("b", "c"))).toBe(1);
    expect(edgeDimTarget(shelf, null, "b", "e", key("b", "e"))).toBe(DIMMED_EDGE);
    expect(edgeDimTarget(null, null, "b", "e", key("b", "e"))).toBe(1);
  });

  it("on a real fold: the lit edges are this turn's paths, never an earlier pair or a traceless co-use", () => {
    const fold = foldEnvelopes(twoTurns());
    const recall = recallEmphasis(fold, 34)!;
    const lit = [...fold.edges.values()].filter((e) => edgeDimTarget(recall.ids, recall.travelled, e.a, e.b, e.key) === 1);
    // b and c share the shelf and were used together in turn 1; b+d is a
    // traceless co-use: neither is a path of turn 2.
    expect(lit.map((e) => e.key)).toEqual([key("ex:memory-c", "ex:memory-d")]);
    expect(recall.travelled.get(key("ex:memory-c", "ex:memory-d"))).toBe("matched");
  });
});

/** THE TRAVELLED PATHS fixture (operator 2026-11-09: "i would also expect the
 * edges traveled to be selected"). Four turns over memories a..h:
 * - tr1 uses b, e, g; pairs b+e, b+g.
 * - tr2 uses b, c, e, f (g on the shelf by CONTINUITY); pairs b+c, e+f.
 * - tr3: a present by right, b and d by continuity, e f h matched; pairs
 *   e+h, f+h (c and g are off this shelf).
 * - tr4 (later) uses c and g together: a trail tr2 must never see. */
function fourTurns(): ReplayEnvelope[] {
  const m = (x: string) => `ex:memory-${x}`;
  return [
    binding(1, "ex:value-a", "value", "I keep my word"),
    ...["b", "c", "d", "e", "f", "g", "h"].map((x, i) => binding(2 + i, m(x), "memory")),
    trace(10, "tr1", [m("b"), m("e"), m("g")], { [m("b")]: "stimulus", [m("e")]: "stimulus", [m("g")]: "stimulus" }),
    selectedEvent(11, m("b"), "tr1"),
    selectedEvent(12, m("e"), "tr1"),
    selectedEvent(13, m("g"), "tr1"),
    coSelected(14, m("b"), m("e"), "tr1"),
    coSelected(15, m("b"), m("g"), "tr1"),
    trace(20, "tr2", [m("b"), m("c"), m("e"), m("f"), m("g")], { [m("b")]: "stimulus", [m("c")]: "stimulus", [m("e")]: "both", [m("f")]: "stimulus", [m("g")]: "stm" }),
    selectedEvent(21, m("b"), "tr2"),
    selectedEvent(22, m("c"), "tr2"),
    selectedEvent(23, m("e"), "tr2"),
    selectedEvent(24, m("f"), "tr2"),
    coSelected(25, m("b"), m("c"), "tr2"),
    coSelected(26, m("e"), m("f"), "tr2"),
    trace(30, "tr3", ["ex:value-a", m("b"), m("d"), m("e"), m("f"), m("h")], { "ex:value-a": "self", [m("b")]: "stm", [m("d")]: "stm", [m("e")]: "stimulus", [m("f")]: "both", [m("h")]: "stimulus" }),
    selectedEvent(31, m("e"), "tr3"),
    selectedEvent(32, m("f"), "tr3"),
    selectedEvent(33, m("h"), "tr3"),
    coSelected(34, m("e"), m("h"), "tr3"),
    coSelected(35, m("f"), m("h"), "tr3"),
    trace(40, "tr4", [m("c"), m("g")], { [m("c")]: "stimulus", [m("g")]: "stimulus" }),
    selectedEvent(41, m("c"), "tr4"),
    selectedEvent(42, m("g"), "tr4"),
    coSelected(43, m("c"), m("g"), "tr4"),
  ];
}

describe("the paths travelled to reach a step's memories", () => {
  const m = (x: string) => `ex:memory-${x}`;
  const sorted = (travelled: Map<string, string>) => [...travelled.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));

  it("a step with continuity + matched memories: one path per memory, in its ring's class", () => {
    const fold = foldEnvelopes(fourTurns());
    const e = canvasRecall(fold, 43, "beat:tr3", true)!;
    expect(e.trace_id).toBe("tr3");
    expect(sorted(e.travelled)).toEqual(
      sorted(
        new Map([
          // e and f: their pair of this turn (with h); h: the companion he used most (e).
          [key(m("e"), m("h")), "matched"],
          [key(m("f"), m("h")), "matched"],
          // b followed from the last ones: its trail warm before tr3 to a
          // memory on this shelf (e) — not its warmer one to c, off this shelf.
          [key(m("b"), m("e")), "stm"],
        ]),
      ),
    );
    // d (continuity, no trail) and a (present by right) get no line; the
    // earlier pair e+f between two shelf memories is not a path of tr3.
    expect(e.travelled.has(key(m("e"), m("f")))).toBe(false);
  });

  it("an earlier step reads its trails as they were THEN: a trail formed later never counts", () => {
    const fold = foldEnvelopes(fourTurns());
    // At the end, c+g (tr4) is g's warmest trail to a tr2 shelf memory.
    expect(trailsBefore(fold, { first_seq: 44, trace_id: "none" }).get(key(m("c"), m("g")))).toBeGreaterThan(trailsBefore(fold, { first_seq: 44, trace_id: "none" }).get(key(m("b"), m("g")))!);
    const e = canvasRecall(fold, 43, "beat:tr2", true)!;
    expect(sorted(e.travelled)).toEqual(
      sorted(
        new Map([
          [key(m("b"), m("c")), "matched"],
          [key(m("e"), m("f")), "matched"],
          // g by continuity: its tr1 trail to b, warm before tr2.
          [key(m("b"), m("g")), "stm"],
        ]),
      ),
    );
    // Before tr2, the c+g trail did not exist yet; the step's own deposit
    // is not "before" either.
    const before = trailsBefore(fold, fold.beats.get("tr2")!);
    expect(before.has(key(m("c"), m("g")))).toBe(false);
    expect(before.has(key(m("b"), m("c")))).toBe(false);
    expect(before.get(key(m("b"), m("g")))).toBeGreaterThan(0);
  });

  it("a first recall (nothing warm yet) still joins the memories found for this message", () => {
    const fold = foldEnvelopes(fourTurns(), 15);
    const e = recallEmphasis(fold, 15)!;
    expect(sorted(e.travelled)).toEqual(
      sorted(
        new Map([
          [key(m("b"), m("e")), "matched"],
          [key(m("b"), m("g")), "matched"],
        ]),
      ),
    );
  });

  it("hovering a ledger recall line lights that step's paths, as its click does (b2d6207 preview kept)", () => {
    const fold = foldEnvelopes(fourTurns());
    // The newest recall (tr4) is lit; the mouse rests on tr3's line.
    const preview = canvasRecall(fold, 43, canvasSelection(null, "beat:tr3"), true)!;
    const click = canvasRecall(fold, 43, "beat:tr3", true)!;
    expect(preview.trace_id).toBe("tr3");
    expect(sorted(preview.travelled)).toEqual(sorted(click.travelled));
    const lit = [...fold.edges.values()].filter((ed) => edgeDimTarget(preview.ids, preview.travelled, ed.a, ed.b, ed.key) === 1).map((ed) => ed.key);
    expect(lit.sort()).toEqual([key(m("b"), m("e")), key(m("e"), m("h")), key(m("f"), m("h"))].sort());
    // The hovered line wins over a clicked one while the mouse rests on it.
    expect(canvasRecall(fold, 43, canvasSelection("beat:tr2", "beat:tr3"), true)!.trace_id).toBe("tr3");
    // Leaving the line: back to the newest recall's paths.
    expect(canvasRecall(fold, 43, canvasSelection(null, null), true)!.trace_id).toBe("tr4");
  });

  it("the rules: warmest trail first, then the companion he used most; never a present-by-right line; matched colour first", () => {
    // tr1 warms the trails: b+c twice, b+d once, a+x, z+v, w+u (z used).
    // tr2: a present by right; b by continuity; c d x y z w v u matched.
    // Its pairs: y+z, y+w, z+v, w+u, and b+c (a pair touching b).
    const envs = [
      binding(1, "ex:value-a", "value", "I keep my word"),
      ...["b", "c", "d", "x", "y", "z", "w", "v", "u"].map((x, i) => binding(2 + i, m(x), "memory")),
      trace(20, "tr1", [m("b"), m("c"), m("d"), m("z")], { [m("b")]: "stimulus", [m("c")]: "stimulus", [m("d")]: "stimulus", [m("z")]: "stimulus" }),
      selectedEvent(21, m("z"), "tr1"),
      coSelected(22, m("b"), m("c"), "tr1"),
      coSelected(23, m("b"), m("c"), "tr1"),
      coSelected(24, m("b"), m("d"), "tr1"),
      coSelected(25, "ex:value-a", m("x"), "tr1"),
      coSelected(26, m("z"), m("v"), "tr1"),
      coSelected(27, m("w"), m("u"), "tr1"),
      trace(30, "tr2", ["ex:value-a", m("b"), m("c"), m("d"), m("x"), m("y"), m("z"), m("w"), m("v"), m("u")], {
        "ex:value-a": "self",
        [m("b")]: "stm",
        ...Object.fromEntries(["c", "d", "x", "y", "z", "w", "v", "u"].map((x) => [m(x), "stimulus"])),
      }),
      ...["y", "z", "w", "v", "u"].map((x, i) => selectedEvent(31 + i, m(x), "tr2")),
      coSelected(40, m("y"), m("z"), "tr2"),
      coSelected(41, m("y"), m("w"), "tr2"),
      coSelected(42, m("z"), m("v"), "tr2"),
      coSelected(43, m("w"), m("u"), "tr2"),
      coSelected(44, m("b"), m("c"), "tr2"),
    ];
    const fold = foldEnvelopes(envs);
    const e = recallEmphasis(fold, 44)!;
    expect(sorted(e.travelled)).toEqual(
      sorted(
        new Map([
          // z and w: their trail warm from tr1 (not their new pair with y).
          [key(m("z"), m("v")), "matched"],
          [key(m("w"), m("u")), "matched"],
          // y: two new pairs, nothing warm: the companion he used most (z, twice) — not w by key order.
          [key(m("y"), m("z")), "matched"],
          // b by continuity: its warmest trail (c, twice) — not d; c's own pair is
          // the same line, which takes the matched colour.
          [key(m("b"), m("c")), "matched"],
        ]),
      ),
    );
    // a is present by right: its warm trail to x is no path.
    expect(e.travelled.has(key("ex:value-a", m("x")))).toBe(false);
  });
});


describe("the lit lines' direction and words (operator 2026-11-09: hover a lit line)", () => {
  const m = (x: string) => `ex:memory-${x}`;

  it("each lit line reads FROM the memory he held in mind TO the memory he recalled through it", () => {
    const fold = foldEnvelopes(fourTurns());
    const e = canvasRecall(fold, 43, "beat:tr3", true)!;
    // Same keys as the travelled lines, one direction each.
    expect([...e.travelledEnds.keys()].sort()).toEqual([...e.travelled.keys()].sort());
    // e and f were found for this message, reached from h (their pair of this turn); b followed from e.
    expect(e.travelledEnds.get(key(m("e"), m("h")))).toEqual({ from: m("h"), to: m("e") });
    expect(e.travelledEnds.get(key(m("f"), m("h")))).toEqual({ from: m("h"), to: m("f") });
    expect(e.travelledEnds.get(key(m("b"), m("e")))).toEqual({ from: m("e"), to: m("b") });
    // The memory reached is always the one in the line's ring class, never a present-by-right one.
    for (const [k, ends] of e.travelledEnds) {
      expect(e.classes.get(ends.to)).toBe(e.travelled.get(k));
      expect(e.ids.has(ends.from)).toBe(true);
    }
  });

  it("the words: '<recalled> — reached from <held> · <relation>', the relation as recorded when they were formed, else 'used together'", () => {
    const linked: ReplayEnvelope = env(
      9,
      "binding",
      { record_id: m("h"), scope: "life", owner_id: "entity:test", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: "b9", seq: 9 },
      { display: { record_id: m("h"), kind: "memory", title: m("h"), edges: [{ relation: "summarizes", target_graph_id: m("e") }] } as ReplayEnvelope["display"] },
    );
    const envs = fourTurns();
    const fold = foldEnvelopes([...envs.slice(0, 8), linked, ...envs.slice(8)]);
    const lines = travelledLines(fold, canvasRecall(fold, 43, "beat:tr3", true));
    expect(lines.get(key(m("e"), m("h")))).toEqual({ key: key(m("e"), m("h")), from: m("h"), to: m("e"), cls: "matched", relation: "summarizes" });
    expect(lines.get(key(m("f"), m("h")))!.relation).toBe(USED_TOGETHER);
    expect(lines.get(key(m("b"), m("e")))).toMatchObject({ from: m("e"), to: m("b"), cls: "stm", relation: "used together" });
    expect(travelledLineWords(lines.get(key(m("e"), m("h")))!, "the blue door", "the media server")).toBe("the blue door — reached from the media server · summarizes");
    // No recall, or a recall with no lit line: no words.
    expect(travelledLines(fold, null).size).toBe(0);
  });

  it("the lit line under the pointer: the nearest segment within 5 px, else none", () => {
    const segs = [
      { key: "a|b", ax: 0, ay: 0, bx: 100, by: 0 },
      { key: "c|d", ax: 0, ay: 10, bx: 100, by: 10 },
    ];
    expect(lineAt(50, 2, segs)).toBe("a|b");
    expect(lineAt(50, 8, segs)).toBe("c|d");
    expect(lineAt(50, 5.5, segs)).toBe("c|d");
    expect(lineAt(50, 30, segs)).toBeNull();
    // Past a segment's end counts from that end.
    expect(lineAt(104, 0, segs)).toBe("a|b");
    expect(lineAt(110, 0, segs)).toBeNull();
    expect(lineAt(0, 0, [])).toBeNull();
  });

  it("the canvas reads the lines once per recall, draws their direction and shows their words after a rest (wiring)", () => {
    const canvas = readFileSync(resolve(__dirname, "graph_canvas.tsx"), "utf8");
    expect(canvas).toContain("const litLines = useMemo(() => travelledLines(fold, recall), [fold, recall]);");
    expect(canvas).toContain("shownLinesRef.current = travelled ? litLines : null;");
    // Faint where it leaves, full where it arrives, an arrowhead at the recalled memory.
    expect(canvas).toContain("const grad = ctx.createLinearGradient(src.x, src.y, dst.x, dst.y);");
    expect(canvas).toContain("grad.addColorStop(0, hexAlpha(ring, 0.22));");
    expect(canvas).toContain("grad.addColorStop(1, hexAlpha(ring, 0.9));");
    expect(canvas).toContain("const target = layout.get(line.to);");
    expect(canvas).toContain("ctx.fillStyle = hexAlpha(ring, 0.95);");
    // The pointer: a memory first, then a topic label, then a lit line; the line's words wait for the rest.
    expect(canvas).toContain("const line = hit || label ? null : litLineAt(ev.clientX, ev.clientY);");
    expect(canvas).toContain("intent.over(line !== null ? `l:${line}` : null);");
    expect(canvas).toContain("setLineTipRef.current({ key: target.slice(2), x: pointAt.x, y: pointAt.y });");
    expect(canvas).toContain("{travelledLineWords(tipLine, plainCardTitle(tipTo), plainCardTitle(tipFrom))}");
    // Leaving the line hides its words.
    expect(canvas).toContain("if (lineTipRef.current && lineTipRef.current.key !== line) setLineTipRef.current(null);");
  });
});

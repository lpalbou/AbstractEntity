import { describe, expect, it } from "vitest";

import { createFoldState, type FoldState } from "./stream_fold";
import { lensIds, LENSES, type GraphLens } from "./graph_lenses";
import type { TemporalActivation } from "./temporal_activation";

// Lenses are pure reads over the fold: semantic id-sets that ride the
// canvas's existing emphasis mechanism. These pins keep each lens honest
// about WHAT it claims to show.
function node(state: FoldState, id: string, kind: string, extra?: Partial<any>): void {
  state.nodes.set(id, {
    id,
    graph_id: null,
    kind,
    title: `t:${id}`,
    token_estimate: 0,
    scope: "life",
    owner_id: "entity:x",
    first_seq: 10,
    born_at: "2026-07-12T00:00:00Z",
    search_state: "",
    prompt_state: "",
    lifecycle: "",
    source: "",
    selected_count: 0,
    last_selected_seq: null,
    last_admission: null,
    closed: null,
    entry_id: null,
    diary: kind === "diary",
    redacted: false,
    pinned: false,
    silenced: false,
    bookkeeping: false,
    maintenance: null,
    visit_id: null,
    ...(extra as any),
  } as any);
}

function temporal(records?: Array<[string, number]>): TemporalActivation {
  return { records: new Map(records || []), pairs: new Map(), config: {} as any } as TemporalActivation;
}

describe("graph lenses", () => {
  it("identity = value/purpose/trait/interest, never bookkeeping, never claims", () => {
    const s = createFoldState();
    node(s, "v1", "value");
    node(s, "i1", "interest");
    node(s, "m1", "memory");
    node(s, "c1", "claim"); // canvas paints claims gold; the lens must not call them identity
    node(s, "bk", "value", { bookkeeping: true });
    const ids = lensIds(s, temporal(), "identity");
    expect(ids).toEqual(new Set(["v1", "i1"]));
  });

  it("diary lens matches kind and the diary flag", () => {
    const s = createFoldState();
    node(s, "d1", "diary");
    node(s, "d2", "episode", { diary: true });
    node(s, "m1", "memory");
    expect(lensIds(s, temporal(), "diary")).toEqual(new Set(["d1", "d2"]));
  });

  it("dreams and questions filter by the ENGINE kind vocabulary (question+lesson only), closed ones drop out", () => {
    const s = createFoldState();
    node(s, "dr", "dream");
    node(s, "q", "question");
    node(s, "qc", "question", { closed: { kind: "resolved", reason: "answered", seq: 5, replacement_ids: [] } });
    node(s, "l", "lesson");
    node(s, "m", "memory");
    expect(lensIds(s, temporal(), "dreams")).toEqual(new Set(["dr"]));
    expect(lensIds(s, temporal(), "questions")).toEqual(new Set(["q", "l"]));
  });

  it("warm = temporal activation above the floor, only for known nodes", () => {
    const s = createFoldState();
    node(s, "hot", "memory");
    node(s, "cold", "memory");
    const t = temporal([
      ["hot", 3.2],
      ["cold", 0.01],
      ["ghost", 5.0],
    ]);
    expect(lensIds(s, t, "warm")).toEqual(new Set(["hot"]));
  });

  it("recent = newest tenth of the seq range, by birth OR selection", () => {
    const s = createFoldState();
    node(s, "old", "memory", { first_seq: 10 });
    node(s, "re-used", "memory", { first_seq: 20, last_selected_seq: 990 });
    node(s, "young", "memory", { first_seq: 980 });
    const ids = lensIds(s, temporal(), "recent");
    expect(ids?.has("young")).toBe(true);
    expect(ids?.has("re-used")).toBe(true);
    expect(ids?.has("old")).toBe(false);
  });

  it("feelings emphasizes record targets on-node and free targets as standings", () => {
    const s = createFoldState();
    node(s, "rec1", "summary");
    s.standings.set("rec1", { target_id: "rec1" } as any);
    s.standings.set("person:laurent", { target_id: "person:laurent" } as any);
    expect(lensIds(s, temporal(), "feelings")).toEqual(new Set(["rec1", "standing:person:laurent"]));
  });

  it("feelings resolves GRAPH-id targets through graph_to_row (two-namespace rule)", () => {
    const s = createFoldState();
    node(s, "row_7", "summary");
    s.graph_to_row.set("ex:memory-abc", "row_7");
    s.standings.set("ex:memory-abc", { target_id: "ex:memory-abc" } as any);
    // The feeling must land ON the node, never on a phantom standing key
    // that has no layout (which would DIM the very node carrying it).
    expect(lensIds(s, temporal(), "feelings")).toEqual(new Set(["row_7"]));
  });

  it("all = null (no filter), and every declared lens id resolves", () => {
    const s = createFoldState();
    expect(lensIds(s, temporal(), "all")).toBeNull();
    for (const l of LENSES) {
      const out = lensIds(s, temporal(), l.id as GraphLens);
      expect(out === null || out instanceof Set).toBe(true);
    }
  });
});

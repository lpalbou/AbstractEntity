/** A world-model card's own words, structured and never cut. */

import { describe, expect, it } from "vitest";

import { parseMechanicalCard } from "./card_words";
import { cardChange } from "./dream_detail";
import { createFoldState, type NodeState } from "./stream_fold";

// nerin's card as stored (abstractmemory mechanical-card-v2), 2026-11-07.
const CARD = [
  "What I know of unresolved-tension:",
  "- 2026-11-07: entity:nerin: None of this is owed - the day is yours. nerin: The survey remains complete, and the dream links are still candidates rather than evide…",
  "- 2026-11-07: entity:nerin: today is Saturday 2026-11-07, 15:37 - you rested (Resting again. nerin: The briefing can stand for now. I’ll rest rather than create an…",
  "(from 5 lived record(s), 2026-11-07 to 2026-11-07, 5 episode. Threads: resting, today, unresolved-tension, owed, question, briefing-stand. Orientation, never authority — follow the sources when it matters.)",
].join("\n");

describe("the card's own words", () => {
  it("parse into heading, quotes and footer", () => {
    const c = parseMechanicalCard(CARD);
    expect(c?.name).toBe("unresolved-tension");
    expect(c?.quotes).toHaveLength(2);
    expect(c?.quotes[0].cut).toBe(true);
    expect(c?.quotes[0].text.endsWith("rather than evide")).toBe(true);
    expect(c?.footer).toEqual({
      count: 5,
      first: "2026-11-07",
      last: "2026-11-07",
      kinds: "5 episode",
      threads: ["resting", "today", "unresolved-tension", "owed", "question", "briefing-stand"],
      reminder: "Orientation, never authority — follow the sources when it matters.",
    });
  });

  it("another shape (his own prose) is not forced into this one", () => {
    expect(parseMechanicalCard("I think of unresolved tension as…\n\nSince then (2 new record(s)): a; b")).toBeNull();
    expect(parseMechanicalCard("What I know of x:\nsome free line")).toBeNull();
  });

});

describe("a dream's changed understanding", () => {
  it("names the memories new since the card it refines", () => {
    const f = createFoldState();
    const add = (id: string) => {
      f.nodes.set(id, { id, graph_id: id, born_at: "2026-11-07T12:00:00+00:00", title: id } as NodeState);
      f.graph_to_row.set(id, id);
    };
    ["ex:world_model-new", "ex:world_model-old", "ex:episode-a", "ex:episode-b", "ex:episode-c"].forEach(add);
    let k = 0;
    const edge = (src: string, tgt: string, relation: string) =>
      f.structural_edges.set(String(k++), { key: String(k), source_graph_id: src, target_graph_id: tgt, relation, first_seq: 1 });
    edge("ex:world_model-old", "ex:episode-a", "derived_from");
    edge("ex:world_model-new", "ex:episode-a", "derived_from");
    edge("ex:world_model-new", "ex:episode-b", "derived_from");
    edge("ex:world_model-new", "ex:episode-c", "derived_from");
    edge("ex:world_model-new", "ex:world_model-old", "refines");
    const ch = cardChange(f, "ex:world_model-new");
    expect(ch.prior?.id).toBe("ex:world_model-old");
    expect(ch.added.map((s) => s.graphId).sort()).toEqual(["ex:episode-b", "ex:episode-c"]);
    expect(ch.all).toHaveLength(3);
  });
});

describe("his rest notes", () => {
  it("read as a line, every word kept; other fences untouched", async () => {
    const { restBlocksAsText } = await import("./verbatim_parse");
    expect(restBlocksAsText("Done for now.\n\n```rest\nResting with the open connections left provisional.\n```")).toBe(
      "Done for now.\n\n\n\n*Chose to rest:* Resting with the open connections left provisional.\n\n",
    );
    expect(restBlocksAsText("```python\nprint(1)\n```")).toBe("```python\nprint(1)\n```");
    expect(restBlocksAsText("inline ```rest marks``` stay")).toBe("inline ```rest marks``` stay");
  });
});

describe("a world model, read as a model", () => {
  const mk = () => {
    const f = createFoldState();
    const add = (id: string, born: string) => {
      f.nodes.set(id, { id, graph_id: id, born_at: born, title: "World model: admin" } as NodeState);
      f.graph_to_row.set(id, id);
    };
    add("ex:world_model-1", "2026-11-07T12:05:00+00:00");
    add("ex:world_model-2", "2026-11-07T14:37:00+00:00");
    add("ex:world_model-3", "2026-11-07T16:40:00+00:00");
    const edge = (k: string, a: string, b: string, relation = "refines") => f.structural_edges.set(k, { key: k, source_graph_id: a, target_graph_id: b, relation, first_seq: 1 });
    edge("x", "ex:world_model-3", "ex:world_model-2");
    edge("y", "ex:world_model-2", "ex:world_model-1");
    return { f, edge };
  };

  it("the whole chain, oldest first, wherever the reader stands in it", async () => {
    const { revisionChain } = await import("./world_model_view");
    const { f } = mk();
    const fromLatest = revisionChain(f, f.nodes.get("ex:world_model-3")!);
    expect(fromLatest.chain.map((n) => n.id)).toEqual(["ex:world_model-1", "ex:world_model-2", "ex:world_model-3"]);
    expect(fromLatest.index).toBe(2);
    const fromOld = revisionChain(f, f.nodes.get("ex:world_model-2")!);
    expect(fromOld.chain.map((n) => n.id)).toEqual(["ex:world_model-1", "ex:world_model-2", "ex:world_model-3"]);
    expect(fromOld.index).toBe(1);
    expect(fromOld.broken).toBe(false);
  });

  it("a chain that names a revision this view lacks says it is broken", async () => {
    const { revisionChain } = await import("./world_model_view");
    const { f, edge } = mk();
    edge("z", "ex:world_model-1", "ex:world_model-0");
    expect(revisionChain(f, f.nodes.get("ex:world_model-3")!).broken).toBe(true);
  });

  it("both sleep-pass shapes are evidence, never his understanding; counts come from the text", async () => {
    const { readCard } = await import("./world_model_view");
    const v2 = readCard(CARD);
    expect(v2).toMatchObject({ kind: "floor", format: "v2", name: "unresolved-tension", count: 5, first: "2026-11-07" });
    // abstractmemory af5d2c6 (the earlier floor), as stored in hypnos' home
    const v1 = readCard(
      "Refined understanding of memory-agent, distilled from 4 lived record(s) between 2026-07-12 and 2026-07-12 (3 episode, 1 summary). Recurring themes: memory, migration, schema. This card is orientation, never authority: the sources remain the evidence, and a live encounter always overrides it.",
    );
    expect(v1).toMatchObject({ kind: "floor", format: "v1", name: "memory-agent", count: 4, kinds: "3 episode, 1 summary", threads: ["memory", "migration", "schema"] });
    const prose = readCard("Admin gave me my first personal time.\n\nSince then (2 new record(s), through 2026-11-07): a; b");
    expect(prose).toEqual({ kind: "prose", lead: "Admin gave me my first personal time.", since: "Since then (2 new record(s), through 2026-11-07): a; b" });
  });

  it("its memories are every revision's links, once each", async () => {
    const { chainSources, revisionChain } = await import("./world_model_view");
    const { f, edge } = mk();
    for (const [i, id] of ["ex:episode-a", "ex:episode-b", "ex:episode-c"].entries()) {
      f.nodes.set(id, { id, graph_id: id, born_at: `2026-11-07T1${i}:00:00+00:00`, title: id } as NodeState);
      f.graph_to_row.set(id, id);
    }
    edge("d1", "ex:world_model-1", "ex:episode-a", "derived_from");
    edge("d2", "ex:world_model-3", "ex:episode-a", "derived_from");
    edge("d3", "ex:world_model-3", "ex:episode-c", "derived_from");
    edge("d4", "ex:world_model-2", "ex:episode-b", "derived_from");
    const { chain } = revisionChain(f, f.nodes.get("ex:world_model-3")!);
    expect(chainSources(f, chain).map((s) => s.graphId)).toEqual(["ex:episode-a", "ex:episode-b", "ex:episode-c"]);
  });
});

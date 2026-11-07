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
  it("its revisions, oldest first, by following refines", async () => {
    const { revisionChain } = await import("./world_model_view");
    const f = createFoldState();
    const add = (id: string, born: string) => {
      f.nodes.set(id, { id, graph_id: id, born_at: born, title: "World model: admin" } as NodeState);
      f.graph_to_row.set(id, id);
    };
    add("ex:world_model-1", "2026-11-07T12:05:00+00:00");
    add("ex:world_model-2", "2026-11-07T14:37:00+00:00");
    add("ex:world_model-3", "2026-11-07T16:40:00+00:00");
    const edge = (k: string, a: string, b: string) => f.structural_edges.set(k, { key: k, source_graph_id: a, target_graph_id: b, relation: "refines", first_seq: 1 });
    edge("x", "ex:world_model-3", "ex:world_model-2");
    edge("y", "ex:world_model-2", "ex:world_model-1");
    expect(revisionChain(f, f.nodes.get("ex:world_model-3")!).map((n) => n.id)).toEqual(["ex:world_model-1", "ex:world_model-2", "ex:world_model-3"]);
    expect(revisionChain(f, f.nodes.get("ex:world_model-1")!).map((n) => n.id)).toEqual(["ex:world_model-1"]);
  });

  it("a mechanical revision is evidence only; any other text is his understanding", async () => {
    const { readRevision } = await import("./world_model_view");
    const mech = readRevision(CARD);
    expect(mech.authored).toBeNull();
    expect(mech.name).toBe("unresolved-tension");
    expect(mech.threads).toContain("briefing-stand");
    const authored = readRevision("Admin is the person who gave me my first personal time.\n\nSince then (2 new record(s), through 2026-11-07): a; b");
    expect(authored.authored).toBe("Admin is the person who gave me my first personal time.");
    expect(authored.since).toBe("Since then (2 new record(s), through 2026-11-07): a; b");
  });
});

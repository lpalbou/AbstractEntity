/**
 * A world-model card shows its sources in full, oldest first (operator
 * 2026-11-07: never truncate what these cards show).
 */

import { describe, expect, it } from "vitest";

import { createFoldState, type NodeState } from "./stream_fold";
import { selectCardSources, sourceWords } from "./world_model_sources";

function node(id: string, born: string, extra: Partial<NodeState> = {}): NodeState {
  return { id, graph_id: id, born_at: born, title: id, ...extra } as NodeState;
}

describe("a card's sources", () => {
  it("are its derived_from records, oldest first, each once", () => {
    const fold = createFoldState();
    const card = node("ex:world_model-1", "2026-11-07T14:37:00+00:00", { kind: "world_model" } as Partial<NodeState>);
    for (const n of [card, node("ex:episode-b", "2026-11-07T13:07:25+00:00"), node("ex:episode-a", "2026-11-07T14:07:41+00:00")]) {
      fold.nodes.set(n.id, n);
      fold.graph_to_row.set(n.id, n.id);
    }
    const edge = (key: string, target: string, relation = "derived_from") =>
      fold.structural_edges.set(key, { key, source_graph_id: card.id, target_graph_id: target, relation, first_seq: 1 });
    edge("1", "ex:episode-a");
    edge("2", "ex:episode-b");
    edge("3", "ex:episode-a"); // a duplicate link
    edge("4", "ex:world_model-0", "refines"); // not a source
    const got = selectCardSources(fold, card);
    expect(got.map((s) => s.graphId)).toEqual(["ex:episode-b", "ex:episode-a"]);
    expect(got[0].node?.id).toBe("ex:episode-b");
  });

  it("a source missing from this view is still listed (read by its id)", () => {
    const fold = createFoldState();
    const card = node("ex:world_model-1", "");
    fold.structural_edges.set("k", { key: "k", source_graph_id: card.id, target_graph_id: "ex:episode-gone", relation: "derived_from", first_seq: 1 });
    expect(selectCardSources(fold, card)).toEqual([{ graphId: "ex:episode-gone", node: null, bornAt: "" }]);
  });
});

describe("a source's words", () => {
  const exchange = "entity:nerin:\nNone of this is owed - the day is yours.\n\nnerin:\nI examined the newer dream’s proposed connections. A long answer that never gets cut.\n\n(thinking, unspoken)\nweighing the links";

  it("lead with his own words, complete, and keep everything behind (…)", () => {
    const w = sourceWords(exchange, "nerin");
    if (w.phase !== "ready") throw new Error(w.phase);
    expect(w.lead).toBe("I examined the newer dream’s proposed connections. A long answer that never gets cut.");
    expect(w.full).toContain("None of this is owed");
    expect(w.full).toContain("weighing the links");
    expect(w.full).toContain(w.lead);
  });

  it("words that are not an exchange are shown whole", () => {
    const w = sourceWords("A plain record with no speakers.", "nerin");
    if (w.phase !== "ready") throw new Error(w.phase);
    expect(w.lead).toBe("A plain record with no speakers.");
    expect(w.full).toBe(w.lead);
  });
});

describe("his words, formatted", () => {
  it("his answer is his last turn, not a memory his tools quoted back", async () => {
    const { sourceWords } = await import("./world_model_sources");
    const text = [
      "entity:nerin:", "your own time continues", "", "[used tool: read_memory]", "", "(what the tools returned:)", "[read_memory]",
      "Full words of memory #1:", "", "entity:nerin:", "an older cue", "", "nerin:", "an older answer, quoted", "",
      "nerin:", "My answer today.",
    ].join("\n");
    const w = sourceWords(text, "nerin");
    if (w.phase !== "ready") throw new Error(w.phase);
    expect(w.lead).toBe("My answer today.");
    expect(w.full).toContain("an older answer, quoted");
  });

  it("tool output stays behind (…), not in the lead", async () => {
    const { sourceWords } = await import("./world_model_sources");
    const text = "entity:nerin:\nyour own time continues\n\nnerin (while looking things up):\n[read_memory]\nFull words of memory #1\n\nnerin:\nMy answer.";
    const w = sourceWords(text, "nerin");
    if (w.phase !== "ready") throw new Error(w.phase);
    expect(w.lead).toBe("My answer.");
    expect(w.full).toContain("[read_memory]");
  });

  it("a fenced block becomes a labelled note, every word kept", async () => {
    const { splitFences } = await import("./world_model_sources");
    const parts = splitFences("I will rest now.\n\n```rest\nResting after the first survey.\n```\nThen more.");
    expect(parts).toEqual([
      { kind: "text", text: "I will rest now.\n\n" },
      { kind: "fence", label: "rest", text: "Resting after the first survey." },
      { kind: "text", text: "\nThen more." },
    ]);
    expect(splitFences("no fences")).toEqual([{ kind: "text", text: "no fences" }]);
  });
});

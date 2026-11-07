/** A world-model card's own words, structured and never cut. */

import { describe, expect, it } from "vitest";

import { matchQuote, parseMechanicalCard } from "./card_words";
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

  it("each cut quote finds the one source it starts, on the same date", () => {
    const sources = [
      { graphId: "ex:episode-1", full: "", answer: "The briefing can stand for now. I’ll rest rather than create another task from its echoes.", date: "2026-11-07" },
      { graphId: "ex:episode-2", full: "", answer: "The survey remains complete, and the dream links are still candidates rather than evidence.", date: "2026-11-07" },
    ];
    const c = parseMechanicalCard(CARD)!;
    expect(matchQuote(c.quotes[0], "nerin", sources)).toBe("ex:episode-2");
    expect(matchQuote(c.quotes[1], "nerin", sources)).toBe("ex:episode-1");
    expect(matchQuote({ ...c.quotes[0], date: "2026-11-06" }, "nerin", sources)).toBeNull(); // dates must agree
    expect(matchQuote({ date: "2026-11-07", text: "nerin: words no source starts with at all", cut: true }, "nerin", sources)).toBeNull();
  });

  it("a quote too short to identify one memory, or fitting two, matches none", () => {
    const sources = [
      { graphId: "a", full: "", answer: "I examined the dream.", date: "2026-11-07" },
      { graphId: "b", full: "", answer: "I rested.", date: "2026-11-07" },
      { graphId: "c", full: "", answer: "The same long opening sentence of an answer, then more.", date: "2026-11-07" },
      { graphId: "d", full: "", answer: "The same long opening sentence of an answer, then other words.", date: "2026-11-07" },
    ];
    expect(matchQuote({ date: "2026-11-07", text: "entity:nerin: cue nerin: I", cut: true }, "nerin", sources)).toBeNull();
    // short but fitting only one memory: still too little to be sure
    expect(matchQuote({ date: "2026-11-07", text: "entity:nerin: cue nerin: I exa", cut: true }, "nerin", sources)).toBeNull();
    expect(matchQuote({ date: "2026-11-07", text: "nerin: The same long opening sentence of an answer", cut: true }, "nerin", sources)).toBeNull();
  });

  it("the part the card quoted from what was said to him is kept", async () => {
    const { quoteCue } = await import("./card_words");
    expect(quoteCue("entity:nerin: None of this is owed - the day is yours. nerin: The survey…", "nerin")).toBe("entity:nerin: None of this is owed - the day is yours.");
    expect(quoteCue("nerin: The survey…", "nerin")).toBe("");
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

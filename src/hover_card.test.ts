/**
 * The graph's hover cards — which text they lead with. Built on the real
 * fold (bindings + a recall snapshot carrying digests, the way the stream
 * serves them), never on hand-made nodes.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import {
  canvasLabel,
  cardKindLine,
  cardSummary,
  DIARY_CARD_LINE,
  isDiaryNode,
  markdownTitle,
  nodeActions,
  nodeCardText,
  needsWords,
  partnerCount,
  placeCard,
  topicActions,
  topicExemplarText,
} from "./hover_card";
import { Words } from "./verbatim_view";

function env(seq: number, family: ReplayEnvelope["family"], payload: Record<string, unknown>, display?: Record<string, unknown>): ReplayEnvelope {
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
    display: display as ReplayEnvelope["display"],
  } as ReplayEnvelope;
}

function binding(seq: number, id: string, kind: string, title: string, extra: Record<string, unknown> = {}): ReplayEnvelope {
  return env(
    seq,
    "binding",
    { record_id: id, scope: "life", owner_id: "entity:test", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    { record_id: id, kind, title, ...extra },
  );
}

function snapshot(seq: number, rows: Array<{ record_id: string; title: string; digest: string }>): ReplayEnvelope {
  return env(seq, "snapshot", { snapshot_id: `s${seq}`, trace_id: "tr1", used_record_ids: rows.map((r) => r.record_id), display: rows, prompt_token_estimate: 100, seq });
}

const DIGEST = "person:admin: what did WHO say? nerin: WHO’s **30 July** update says the outbreak is over.\n\n- **Uganda:** declared over on 28 July";

const life = [
  binding(1, "ex:episode-a", "episode", "exchange: WHO’s **30 July** update says Uganda declared…"),
  binding(2, "ex:memory-b", "memory", "the media server"),
  binding(3, "ex:diary-c", "diary", "the bridges were real", { diary: true }),
  binding(4, "ex:memory-d", "memory", ""),
  snapshot(10, [
    { record_id: "ex:episode-a", title: "exchange: WHO…", digest: DIGEST },
    { record_id: "ex:diary-c", title: "diary", digest: "private words" },
  ]),
];

describe("nodeCardText", () => {
  it("leads with the title (scaffolding stripped, Markdown kept) and the full summary", () => {
    const fold = foldEnvelopes(life);
    const t = nodeCardText(fold.nodes.get("ex:episode-a")!);
    expect(t.title).toBe("WHO’s **30 July** update says Uganda declared…");
    expect(t.summary).toBe(DIGEST); // in full, newlines and list kept
  });

  it("no summary before a recall served one (absent, never invented)", () => {
    const before = foldEnvelopes(life, 4);
    expect(nodeCardText(before.nodes.get("ex:episode-a")!).summary).toBeNull();
    expect(nodeCardText(before.nodes.get("ex:memory-b")!)).toEqual({ title: "the media server", summary: null, plain: false });
  });

  it("a diary entry never shows its words; a private one reads 'a diary entry'", () => {
    const fold = foldEnvelopes(life);
    const diary = fold.nodes.get("ex:diary-c")!;
    expect(nodeCardText(diary).summary).toBeNull();
    const redacted = foldEnvelopes([binding(1, "ex:diary-z", "memory", "x")]).nodes.get("ex:diary-z")!;
    expect(redacted.redacted).toBe(true);
    expect(nodeCardText(redacted)).toEqual({ title: "a diary entry", summary: null, plain: false });
  });

  it("the card keeps its own guard: a digest on a diary node (the fold never keeps one) is not shown", () => {
    // An operator-audience diary node (its gist as title, not redacted).
    const diary = foldEnvelopes(life, 4).nodes.get("ex:diary-c")!;
    expect(diary.diary && !diary.redacted).toBe(true);
    expect(diary.digest ?? null).toBeNull(); // the fold's rule
    expect(nodeCardText({ ...diary, digest: "private words" })).toEqual({ title: "the bridges were real", summary: null, plain: false });
  });

  it("a multi-line title keeps its lines: a heading stays a heading (never a raw '###' mid-line)", () => {
    const raw = "exchange: North America housing pass — what is now supported\n### United States\n- **HUD:** the 2026 count";
    expect(markdownTitle(raw)).toBe("North America housing pass — what is now supported\n### United States\n- **HUD:** the 2026 count");
    const fold = foldEnvelopes([binding(1, "ex:episode-h", "episode", raw)]);
    expect(nodeCardText(fold.nodes.get("ex:episode-h")!).title.split("\n")[1]).toBe("### United States");
  });

  it("an untitled record shows its id's head", () => {
    const fold = foldEnvelopes(life);
    expect(nodeCardText(fold.nodes.get("ex:memory-d")!).title).toBe("ex:memory-d");
  });

  it("a summary equal to the title is not said twice", () => {
    const fold = foldEnvelopes([binding(1, "ex:memory-e", "memory", "one line"), snapshot(5, [{ record_id: "ex:memory-e", title: "one line", digest: "one line" }])]);
    expect(nodeCardText(fold.nodes.get("ex:memory-e")!).summary).toBeNull();
  });
});

describe("topicExemplarText", () => {
  const fold = foldEnvelopes(life);
  it("the exemplar by its summary when the fold holds it, else its title", () => {
    expect(topicExemplarText(fold, "ex:episode-a", "ignored")).toEqual({ text: DIGEST, plain: false });
    expect(topicExemplarText(fold, "ex:memory-b", "ignored")).toEqual({ text: "the media server", plain: false });
  });

  it("never a diary entry's words — in the fold or not", () => {
    expect(topicExemplarText(fold, "ex:diary-c", "the bridges were real")).toBeNull();
    expect(topicExemplarText(fold, "ex:diary-unseen", "private")).toBeNull();
    // A diary record known by its ROW id (re-keyed by a usage event).
    const rekeyed = foldEnvelopes([
      ...life.slice(0, 4),
      env(6, "event", { kind: "listed", scope: "life", owner_id: "entity:test", record_id: "row-dc", pair_ids: null, weight: 0, matched: false, event_id: "e6", seq: 6 }, {
        record_id: "row-dc",
        graph_id: "ex:diary-c",
        title: "the bridges were real",
      }),
    ]);
    expect(rekeyed.nodes.get("row-dc")?.graph_id).toBe("ex:diary-c");
    expect(topicExemplarText(rekeyed, "row-dc", "the bridges were real")).toBeNull();
  });

  it("an exemplar not in the fold yet: the payload's title, scaffolding stripped", () => {
    expect(topicExemplarText(fold, "ex:memory-later", "lesson: keep the record honest")).toEqual({ text: "keep the record honest", plain: false });
    expect(topicExemplarText(fold, "ex:memory-later", "")).toBeNull();
  });
});

describe("placeCard", () => {
  it("beside the cursor when it fits", () => {
    expect(placeCard(100, 100, 420, 200, 1600, 1000)).toEqual({ left: 116, top: 112 });
  });

  it("kept whole inside the viewport — a tall summary or a 400 px phone", () => {
    expect(placeCard(1500, 900, 420, 300, 1600, 1000)).toEqual({ left: 1172, top: 692 });
    expect(placeCard(300, 100, 384, 200, 400, 860)).toEqual({ left: 8, top: 112 });
    expect(placeCard(10, 10, 420, 2000, 1600, 1000).top).toBe(8);
  });
});

/** The text the shared renderer shows for the FIRST block of `md` —
 * from its real HTML (the test reads the renderer, never a guess). */
function rendererFirstBlockText(md: string): string {
  const html = renderToStaticMarkup(React.createElement(Words, { text: md, className: "" }));
  const inner = html.replace(/^<div[^>]*>/, "").replace(/<\/div>$/, "");
  const first = inner.match(/^<(\w+)[^>]*>([\s\S]*?)<\/\1>/);
  const body = (first ? first[2] : inner).replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "");
  return body
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("canvasLabel", () => {
  it("is what the shared renderer shows — never raw markers, never changed content", () => {
    for (const md of [
      "**Lookup failure:** I searched for *Social Panorama* 2026…",
      "`__init__` takes **kwargs",
      "5**2 is 25",
      "see [the UNHCR page](https://www.unhcr.org/data) for more",
      "web_search continues, bridge_index",
      "line one of a paragraph\nline two of it",
      "```\nprint(1)\n```",
    ]) {
      expect(canvasLabel(md)).toBe(rendererFirstBlockText(md));
    }
    expect(canvasLabel("**Lookup failure:** I searched")).toBe("Lookup failure: I searched");
    expect(canvasLabel("`__init__` and more")).toContain("__init__");
    expect(canvasLabel("```\nprint(1)\n```")).toBe("print(1)");
  });

  it("strips the runtime's title prefix first, so a heading under it parses as a heading", () => {
    expect(canvasLabel("exchange: ## Regional survey of housing")).toBe("Regional survey of housing");
    expect(canvasLabel("exchange: North America housing pass\n### United States")).toBe("North America housing pass");
  });

  it("draws the first block only (the card carries the rest)", () => {
    expect(canvasLabel("First line of a note\n\nSecond paragraph")).toBe("First line of a note");
  });
});

describe("dreams and diaries", () => {
  const dreamFold = foldEnvelopes([
    binding(1, "ex:dream-n", "dream", "Diary entry (note) — `bridges` the night revised 3 cards"),
    snapshot(5, [{ record_id: "ex:dream-n", title: "x", digest: "Dream: revised `card A, `card B`\n- touched 3" }]),
  ]);
  it("a dream is named as Detail names it and its born digest is plain text", () => {
    const t = nodeCardText(dreamFold.nodes.get("ex:dream-n")!);
    expect(t.title).toBe("A dream");
    expect(t.plain).toBe(true);
    expect(t.summary).toBe("Dream: revised `card A, `card B`\n- touched 3");
    expect(topicExemplarText(dreamFold, "ex:dream-n", "")).toEqual({ text: "Dream: revised `card A, `card B`\n- touched 3", plain: true });
  });

  it("a diary record by its graph id is a diary record (no summary, no exemplar words)", () => {
    const n = foldEnvelopes(life, 4).nodes.get("ex:memory-b")!;
    const disguised = { ...n, diary: false, redacted: false, id: "row-x", graph_id: "ex:diary-x", digest: "private words" };
    expect(isDiaryNode(disguised)).toBe(true);
    expect(nodeCardText(disguised).summary).toBeNull();
    expect(isDiaryNode({ ...disguised, graph_id: null, id: "ex:diary-y" })).toBe(true);
    expect(isDiaryNode({ ...disguised, graph_id: "ex:memory-b", id: "row-x" })).toBe(false);
  });
});

describe("cardSummary — the summary every card leads with, per kind", () => {
  const kinds = foldEnvelopes([
    binding(1, "ex:world_model-w", "world_model", "World model: housing"),
    binding(2, "ex:episode-e", "episode", "exchange: what did you find?"),
    binding(3, "ex:lesson-l", "lesson", "lesson: check the date first"),
    binding(4, "ex:dream-d", "dream", "Diary entry (note) — night"),
    binding(5, "ex:summary-s", "summary", "session reflection: owntime"),
    binding(6, "ex:value-v", "value", "honesty"),
    binding(7, "ex:diary-x", "diary", "the bridges were real", { diary: true }),
    binding(8, "ex:interest-i", "interest", "interest: maps"),
  ]);
  const node = (id: string) => kinds.nodes.get(id)!;
  const ready = (text: string) => ({ phase: "ready" as const, text, served: null });
  const FLOOR =
    "What I know of housing:\n- 2026-11-01: the HUD count rose…\nStanding feeling: warm toward the work\n(from 12 lived record(s), 2026-10-01T10:00:00 to 2026-11-01T09:00:00, 9 episodes, 3 summaries. Threads: housing, refugees. This card is orientation, never authority.)";
  const EXCHANGE = "person:admin:\nwhat did you find?\n\nnerin:\nI found the **UNHCR** portal and its 2026 tables.";

  it("a world model: its card's floor (name, evidence, threads, feeling), through Detail's readCard", () => {
    expect(cardSummary(node("ex:world_model-w"), ready(FLOOR), "nerin")).toEqual({
      kind: "floor",
      name: "housing",
      lines: ["12 lived memories, 2026-10-01 to 2026-11-01 (9 episodes, 3 summaries)"],
      threads: ["housing", "refugees"],
      feeling: "warm toward the work",
    });
    // An authored card: its lead.
    expect(cardSummary(node("ex:world_model-w"), ready("He sees housing as a slow emergency.\n\nSince then two counts rose."), "nerin")).toEqual({
      kind: "words",
      text: "He sees housing as a slow emergency.",
      plain: false,
    });
  });

  it("a lived moment: its digest when the fold holds one, else his answer's lead", () => {
    expect(cardSummary(node("ex:episode-e"), ready(EXCHANGE), "nerin")).toEqual({ kind: "words", text: "I found the **UNHCR** portal and its 2026 tables.", plain: false });
    const withDigest = { ...node("ex:episode-e"), digest: "person:admin: what did you find? nerin: the portal." };
    expect(cardSummary(withDigest, ready(EXCHANGE), "nerin")).toEqual({ kind: "words", text: "person:admin: what did you find? nerin: the portal.", plain: false });
  });

  it("a dream: its summary as written (not Markdown)", () => {
    expect(cardSummary(node("ex:dream-d"), ready("Dream: revised `card A"), "nerin")).toEqual({ kind: "words", text: "Dream: revised `card A", plain: true });
  });

  it("lessons, interests, identity and summaries: the whole words", () => {
    for (const id of ["ex:lesson-l", "ex:interest-i", "ex:value-v", "ex:summary-s"]) {
      expect(cardSummary(node(id), ready("All of **its** words."), "nerin")).toEqual({ kind: "words", text: "All of **its** words.", plain: false });
    }
  });

  it("while reading, when nothing is kept, and before any read", () => {
    expect(cardSummary(node("ex:lesson-l"), { phase: "reading" }, "nerin")).toEqual({ kind: "reading" });
    expect(cardSummary(node("ex:lesson-l"), { phase: "none", message: "no words are kept for this memory" }, "nerin")).toEqual({ kind: "none", text: "no words are kept for this memory" });
    expect(cardSummary(node("ex:lesson-l"), null, "nerin")).toBeNull();
  });

  it("THE DIARY GUARD: a diary record never needs a read and never shows words, whatever is passed", () => {
    const diary = node("ex:diary-x");
    expect(needsWords(diary)).toBe(false);
    expect(cardSummary(diary, ready("private words"), "nerin")).toEqual({ kind: "diary", text: DIARY_CARD_LINE });
    expect(cardSummary({ ...diary, digest: "private words" }, null, "nerin")).toEqual({ kind: "diary", text: DIARY_CARD_LINE });
    // By its graph id alone (the /(^|:)diary-/ rule), and by kind alone.
    const byId = { ...node("ex:lesson-l"), id: "row-q", graph_id: "ex:diary-q", diary: false, redacted: false };
    expect(needsWords(byId)).toBe(false);
    expect(cardSummary(byId, ready("private words"), "nerin")!.kind).toBe("diary");
    const byKind = { ...node("ex:lesson-l"), kind: "diary", diary: false };
    expect(needsWords(byKind)).toBe(false);
    expect(cardSummary(byKind, ready("private words"), "nerin")!.kind).toBe("diary");
    // A diary-shaped ROW id or a redaction alone is enough for the card,
    // even where Detail's read rule looks at the graph id only.
    expect(needsWords({ ...node("ex:lesson-l"), id: "ex:diary-z", graph_id: "ex:memory-z" })).toBe(false);
    expect(needsWords({ ...node("ex:lesson-l"), redacted: true })).toBe(false);
  });

  it("reads only what the fold does not hold, and nothing Detail would not read", () => {
    expect(needsWords(node("ex:world_model-w"))).toBe(true);
    expect(needsWords({ ...node("ex:episode-e"), digest: "held" })).toBe(false);
    expect(needsWords({ ...node("ex:lesson-l"), kind: "relation" })).toBe(false);
    expect(needsWords({ ...node("ex:lesson-l"), bookkeeping: true })).toBe(false);
  });

  it("names the kind the way Detail opens", () => {
    expect(cardKindLine(node("ex:world_model-w"))).toBe("His working model of someone or something");
    expect(cardKindLine(node("ex:episode-e"))).toBe("A lived moment");
  });
});

describe("card actions", () => {
  const fold = foldEnvelopes([
    binding(1, "ex:episode-e", "episode", "exchange: hi"),
    binding(2, "ex:world_model-w", "world_model", "World model: x"),
    binding(3, "ex:diary-x", "diary", "an entry", { diary: true }),
    env(4, "event", { kind: "co_selected", scope: "life", owner_id: "entity:test", record_id: "ex:episode-e", pair_ids: ["ex:episode-e", "ex:world_model-w"], weight: 1, matched: true, event_id: "e4", seq: 4 }),
  ]);
  it("the default first: Detail, a world model's card, a diary entry's Book", () => {
    expect(nodeActions(fold.nodes.get("ex:episode-e")!, { topic: null, partners: 0 })).toEqual([{ id: "open", label: "Open in Detail" }]);
    expect(nodeActions(fold.nodes.get("ex:world_model-w")!, { topic: null, partners: 0 })[0]).toEqual({ id: "open", label: "Open the card" });
    expect(nodeActions(fold.nodes.get("ex:diary-x")!, { topic: null, partners: 0 })[0]).toEqual({ id: "book", label: "Show in Book" });
  });

  it("its topic and the memories it was used with, when there are any", () => {
    expect(partnerCount(fold, "ex:episode-e")).toBe(1);
    expect(partnerCount(fold, "ex:world_model-w")).toBe(1); // either end of the trail
    expect(partnerCount(fold, "ex:diary-x")).toBe(0);
    expect(nodeActions(fold.nodes.get("ex:episode-e")!, { topic: "housing, refugees", partners: partnerCount(fold, "ex:episode-e") })).toEqual([
      { id: "open", label: "Open in Detail" },
      { id: "topic", label: "Show its topic" },
      { id: "partners", label: "Used with 1 →" },
    ]);
    // A diary entry never opens Detail from its card.
    expect(nodeActions(fold.nodes.get("ex:diary-x")!, { topic: "t", partners: 3 }).map((a) => a.id)).toEqual(["book", "topic"]);
  });

  it("a topic: light it, or show its memories", () => {
    expect(topicActions(12)).toEqual([
      { id: "light", label: "Light this topic" },
      { id: "members", label: "12 memories →" },
    ]);
    expect(topicActions(1)[1].label).toBe("1 memory →");
  });
});

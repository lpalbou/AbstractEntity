/**
 * Every Detail card is informative first (operator 2026-11-07): what it is
 * (title, kind in plain words, summary in full when the app has it), then
 * the facts, then the rest one click away — and every text through the
 * shared Markdown renderer, never with its raw marks.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createFoldState, type BeatState, type NodeState, type StandingState } from "./stream_fold";
import { Inspector } from "./inspector";
import { RecordBody } from "./record_detail";
import { wordsFromCache } from "./verbatim_view";
import { beatTurnWords, dreamLine, kindWords, recallLine, standingLine, wordsReadOnOpen } from "./record_detail_parts";

const SOURCE = { baseUrl: "http://gw", entity: "nerin" };

function node(over: Partial<NodeState> = {}): NodeState {
  return {
    id: "row-1",
    graph_id: "ex:memory-41e5d3074b7145741eb6cdc8828423d4",
    kind: "lesson",
    title: "lesson: Do **not** guess a figure — ## open the source",
    token_estimate: 60,
    scope: "life",
    owner_id: "entity:nerin",
    first_seq: 9,
    born_at: "2026-11-07T10:00:00Z",
    search_state: "indexed",
    prompt_state: "inactive",
    lifecycle: "active",
    source: "remember",
    selected_count: 2,
    last_selected_seq: null,
    last_admission: null,
    closed: null,
    entry_id: null,
    diary_type: null,
    diary: false,
    redacted: false,
    pinned: false,
    silenced: false,
    bookkeeping: false,
    maintenance: null,
    visit_id: null,
    signals: null,
    ...over,
  };
}

const facts = (extra: React.ReactNode) => (
  <dl className="ei_facts">
    {extra}
    <dt>born</dt>
    <dd>then</dd>
  </dl>
);
const fold = createFoldState();
const body = (n: NodeState, state: Parameters<typeof RecordBody>[0]["state"], source: typeof SOURCE | null = SOURCE) =>
  renderToStaticMarkup(<RecordBody fold={fold} node={n} source={source} state={state} renderFacts={facts} onSelect={() => {}} />);
const inOrder = (html: string, pieces: string[]) => {
  let at = -1;
  for (const p of pieces) {
    const next = html.indexOf(p);
    expect(next, p).toBeGreaterThan(at);
    at = next;
  }
};

describe("what a record is, in plain words", () => {
  it("names every kind the Detail tab shows", () => {
    expect(kindWords(node({ kind: "diary", diary: true, diary_type: "question" }))).toBe("A diary entry — a question he left open");
    expect(kindWords(node({ kind: "diary", diary: true, diary_type: null }))).toBe("A diary entry");
    expect(kindWords(node({ kind: "diary", diary: true, diary_type: "new_type" }))).toBe("A diary entry — a new type");
    expect(kindWords(node({ kind: "lesson" }))).toBe("A lesson he drew");
    expect(kindWords(node({ kind: "interest" }))).toBe("An interest that took root");
    expect(kindWords(node({ kind: "summary" }))).toContain("A summary he formed");
    expect(kindWords(node({ kind: "observation" }))).toBe("An observation");
    expect(kindWords(node({ kind: "value" }))).toBe("One of his values");
    expect(kindWords(node({ kind: "trait" }))).toBe("One of his traits");
    expect(kindWords(node({ kind: "claim" }))).toBe("Something he holds true about himself");
    expect(kindWords(node({ kind: "claim", bookkeeping: true, maintenance: "reembed" }))).toBe("An engine act (reembed) — the engine's own bookkeeping, not a memory");
    expect(kindWords(node({ kind: "brand_new" }))).toBe("A brand new");
  });

  it("reads a record's words with the card only when nothing is recorded by it", () => {
    expect(wordsReadOnOpen(node())).toBe(true);
    expect(wordsReadOnOpen(node({ kind: "diary", diary: true }))).toBe(false);
    expect(wordsReadOnOpen(node({ kind: "episode", graph_id: "ex:diary-86444591ec14d1d97" }))).toBe(false);
    expect(wordsReadOnOpen(node({ kind: "relation" }))).toBe(false);
    expect(wordsReadOnOpen(node({ kind: "claim", bookkeeping: true }))).toBe(false);
  });

  it("the card reads with itself only by that rule (a diary read is recorded in his biography)", () => {
    const src = readFileSync(resolve(__dirname, "record_detail.tsx"), "utf8");
    expect(src).toContain("const eager = Boolean(source) && wordsReadOnOpen(node);");
    expect(src).toContain("if (!source || !eager) {");
  });

  it("tells a dream by what it moved", () => {
    expect(dreamLine(null)).toBe("The night left no record of what it moved.");
    expect(
      dreamLine([
        { kind: "changed_understanding", act: "card_revised", touched: ["ex:world_model-1", "ex:world_model-2"] },
        { kind: "unresolved_tension", touched: ["a", "b"] },
        { kind: "grouping", act: "grouped" },
      ] as NodeState["signals"]),
    ).toBe("The night changed his understanding of 2 things, set one tension side by side and moved one more thing.");
    expect(dreamLine([{ kind: "unresolved_tension" }, { kind: "unresolved_tension" }] as NodeState["signals"])).toBe("The night set 2 tensions side by side.");
  });

  it("says what a recall did and when, and keeps both sides of a feeling", () => {
    const beat = { candidate_count: 50, selected: ["a", "b"], committed: true, used_record_ids: ["a"], prompt_token_estimate: 120 };
    expect(recallLine(beat)).toBe("He considered 50 memories; 2 came to mind; 1 entered his context (about 120 tokens).");
    expect(recallLine({ ...beat, committed: false })).toBe("He considered 50 memories; 2 came to mind; none is recorded as entering his context.");
    expect(beatTurnWords("t-0006")).toBe("turn 6 of that session");
    expect(beatTurnWords("t-reflect-1")).toBe("the look back that closed a day");
    expect(beatTurnWords(null)).toBeNull();
    expect(standingLine({ positive: 3, negative: 1, positive_count: 2, negative_count: 1 })).toBe("+3 from 2 positive moments; −1 from 1 negative moment.");
  });
});

describe("a record's card", () => {
  it("leads with the title as Markdown, its kind, its whole words when born as words, then the facts", () => {
    const html = body(node(), { phase: "ready", words: { text: "Open the **source** before quoting.", note: "born", turnId: null, born: true } });
    inOrder(html, ["<strong>not</strong>", "A lesson he drew", "Open the <strong>source</strong> before quoting.", "These words are the whole record", "<dt>born</dt>"]);
    expect(html).not.toContain("**not**");
    expect(html).toContain("wl_inline");
    expect(html).not.toContain("The words as saved");
  });

  it("shows the digest a recall served as the summary, the words folded below", () => {
    const html = body(node({ kind: "summary", title: "session reflection: owntime", digest: "He **closed** the day on the survey." }), {
      phase: "ready",
      words: { text: "THE LONG REFLECTION WORDS", note: null, turnId: null, born: false },
    });
    inOrder(html, ["session reflection: owntime", "A summary he formed", "He <strong>closed</strong> the day on the survey.", "The summary saved with the record", "<dt>born</dt>", "The words as saved"]);
    expect(html).toMatch(/aria-expanded="false"[^>]*>.*The words as saved/s);
    expect(html).not.toContain("THE LONG REFLECTION WORDS");
  });

  it("says its summary is being read, and in an exported file when the fuller summary will come", () => {
    const html = body(node({ kind: "value", title: "honesty" }), { phase: "loading" });
    inOrder(html, ["honesty", "One of his values", "reading his summary…", "<dt>born</dt>"]);
    expect(html).not.toContain("The fuller summary arrives");
    const file = body(node({ kind: "value", title: "honesty" }), { phase: "idle" }, null);
    inOrder(file, ["honesty", "One of his values", "The fuller summary arrives once this memory is recalled.", "<dt>born</dt>"]);
  });

  it("keeps a diary entry's words behind a click that says the read is recorded", () => {
    const html = body(node({ kind: "diary", diary: true, diary_type: "note", graph_id: "ex:diary-86444591ec14d1d97", entry_id: "diary_3e8", title: "Kept the **commitment** open" }), { phase: "idle" });
    inOrder(html, ["<strong>commitment</strong>", "A diary entry — a note", "<dt>born</dt>", "His words in the book", "not read until you open them"]);
    expect(html).not.toContain("fuller summary");
  });

  it("shows an engine act and a link as what they are, with no words to read", () => {
    const act = body(node({ kind: "claim", bookkeeping: true, maintenance: "reembed", title: "reembed: 12 records" }), { phase: "idle" });
    expect(act).toContain("An engine act (reembed)");
    expect(act).not.toContain("The words as saved");
    expect(act).not.toContain("fuller summary");
    const link = body(node({ kind: "relation", title: "continues" }), { phase: "idle" });
    expect(link).toContain("A link between two memories");
    expect(link).not.toContain("The words as saved");
  });

  it("tells a dream by what it moved first, its own summary folded", () => {
    const html = body(node({ kind: "dream", title: "dream: …", signals: [{ kind: "unresolved_tension", touched: [] }] as NodeState["signals"] }), {
      phase: "ready",
      words: { text: "Mechanical words", note: "born", turnId: null, born: true },
    });
    inOrder(html, ["A dream", "A dream — the sleep pass at work", "The night set one tension side by side.", "<dt>born</dt>", "The sleep pass&#x27;s own summary"]);
    expect(html).not.toContain("Mechanical words");
  });

  it("shows a closed belief as key information, its reason as Markdown", () => {
    const html = body(node({ closed: { kind: "supersede", reason: "the **newer** source", seq: 3, replacement_ids: [] } }), { phase: "loading" });
    inOrder(html, ["A lesson he drew", "Superseded", "the <strong>newer</strong> source", "<dt>born</dt>"]);
  });

  it("knows a cached record born as words by the note it was cached with", () => {
    expect(wordsFromCache({ text: "w", note: "Born as words", turn_id: "t-0001" })).toEqual({ text: "w", note: "Born as words", turnId: "t-0001", born: true, understanding: null });
    expect(wordsFromCache({ text: "w", note: "", turn_id: "" })).toEqual({ text: "w", note: null, turnId: null, born: false, understanding: null });
  });

  it("says how its words can be read in an exported file", () => {
    const html = body(node({ kind: "summary" }), { phase: "idle" }, null);
    expect(html).toContain("The words as saved");
  });
});

describe("the recall and feeling cards", () => {
  const beat: BeatState = {
    trace_id: "t-1",
    turn_id: "t-0006",
    cue_text: "your **own** time continues",
    view: "working_set",
    first_seq: 5,
    last_seq: 6,
    candidate_count: 40,
    selected: ["r1", "r2"],
    admissions: { r1: "stm", r2: "both" },
    dropped: [{ record_id: "r3", reason: "below_shelf" }],
    used_record_ids: ["r1", "r2"],
    prompt_token_estimate: 300,
    committed: true,
    used_pairs: new Map(),
  };

  it("leads with what came to mind and why, then the facts, then each list with its titles as Markdown", () => {
    const f = createFoldState();
    f.nodes.set("r1", node({ id: "r1", title: "exchange: They do **not** yet show it" }));
    f.nodes.set("r2", node({ id: "r2", title: "## North America evidence update" }));
    f.nodes.set("r3", node({ id: "r3", title: "a *dropped* one" }));
    f.beats.set("t-1", beat);
    f.beat_order.push("t-1");
    const html = renderToStaticMarkup(<Inspector fold={f} scrubSeq={10} selectedId="beat:t-1" onSelect={() => {}} verbatimSource={SOURCE} />);
    inOrder(html, ["What came to mind", "A recall", "He considered 40 memories; 2 came to mind; 2 entered his context", "your <strong>own</strong> time continues", "<dt>considered</dt>", "turn 6 of that session", "continuity — was just working with it", "matched + continuity", "Considered but left out"]);
    expect(html).toContain("They do <strong>not</strong> yet show it");
    expect(html).toContain("<h2>North America evidence update</h2>");
    expect(html).toContain("a <em>dropped</em> one");
    expect(html).not.toContain("**not**");
    expect(html).not.toMatch(/>## North/);
  });

  it("names a feeling's target, both sides first, every event one click away", () => {
    const f = createFoldState();
    f.nodes.set("r9", node({ id: "r9", graph_id: "ex:memory-9", title: "the **survey** commitment" }));
    f.graph_to_row.set("ex:memory-9", "r9");
    const standing: StandingState = {
      target_id: "ex:memory-9",
      positive: 3,
      negative: 1,
      positive_count: 2,
      negative_count: 1,
      scars: [],
      bonds: [{ event_id: "e1", reason: "he **kept** his word", seq: 4, magnitude: 6 }],
      healed_count: 0,
      broken_count: 0,
      last_seq: 4,
      last_reason: null,
      events: [{ kind: "appraisal", sign: 1, magnitude: 3, reason: "a *good* day", seq: 4, observed_at: "2026-11-07T10:00:00Z" }],
    };
    f.standings.set("ex:memory-9", standing);
    const html = renderToStaticMarkup(<Inspector fold={f} scrubSeq={10} selectedId="standing:ex:memory-9" onSelect={() => {}} verbatimSource={SOURCE} />);
    inOrder(html, ["the <strong>survey</strong> commitment", "How he feels toward this memory", "+3 from 2 positive moments; −1 from 1 negative moment.", "he <strong>kept</strong> his word", "<dt>positive</dt>", "Every feeling event"]);
    expect(html).not.toContain("a <em>good</em> day");
  });

  it("names the memories a record was used with as Markdown", () => {
    const f = createFoldState();
    const n = node({ id: "rA" });
    f.nodes.set("rA", n);
    f.nodes.set("rB", node({ id: "rB", title: "exchange: the **partner** memory" }));
    f.edges.set("rA|rB", { key: "rA|rB", a: "rA", b: "rB", count: 4, last_seq: 3 });
    const html = renderToStaticMarkup(<Inspector fold={f} scrubSeq={10} selectedId="rA" onSelect={() => {}} verbatimSource={SOURCE} />);
    inOrder(html, ["A lesson he drew", "<dt>born</dt>", "Used together with", "the <strong>partner</strong> memory"]);
  });
});

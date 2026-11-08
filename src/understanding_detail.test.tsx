/**
 * Detail shows a memory's stored understanding for every kind (operator
 * 2026-11-08, on a session summary that opened as a shell: "extremely
 * useless, where is the summary?"): the summary itself first, who wrote it,
 * as of when and why, its earlier readings folded. `null` reads "not
 * computed yet"; a gateway without the fields gets ONE sentence. The stream
 * fold and the graph's hover cards use the served summary as served.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import READS from "./fixtures/understanding_record_reads.json";
import { createFoldState, foldEnvelopes, type NodeState } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { RecordBody } from "./record_detail";
import { EpisodeBody } from "./episode_view";
import { CardUnderstanding, cardTypeWords, type CardRead } from "./world_model_view";
import { readCard } from "./world_model_view";
import { EarlierUnderstandings } from "./understanding_view";
import { readUnderstanding, UNSERVED_SENTENCE, type UnderstandingRead } from "./understanding";
import { cardSummary } from "./hover_card";
import type { RecordWords } from "./verbatim_view";

type Read = Record<string, unknown>;
const R = READS as unknown as Record<"SERVED" | "NULLS" | "SERVED_CARD" | "SERVED_EPISODE" | "OLD_GATEWAY", Read>;
const SOURCE = { baseUrl: "http://gw", entity: "castor" };

function node(over: Partial<NodeState> = {}): NodeState {
  return {
    id: "row-1",
    graph_id: "ex:summary-5c1e",
    kind: "summary",
    title: "session reflection: owntime",
    token_estimate: 60,
    scope: "life",
    owner_id: "entity:castor",
    first_seq: 9,
    born_at: "2026-11-06T12:00:00Z",
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

/** What readRecordWords returns for a served body (verbatim_view). */
function words(body: Read, kind: string): RecordWords {
  return { text: String(body.text ?? ""), note: null, turnId: null, born: Boolean(body.born_digest), understanding: readUnderstanding(body, kind) };
}

const facts = (extra: React.ReactNode) => (
  <dl className="ei_facts">
    {extra}
    <dt>born</dt>
    <dd>then</dd>
  </dl>
);
const body = (n: NodeState, w: RecordWords) =>
  renderToStaticMarkup(<RecordBody fold={createFoldState()} node={n} source={SOURCE} state={{ phase: "ready", words: w }} renderFacts={facts} onSelect={() => {}} />);
const count = (html: string, s: string) => html.split(s).length - 1;
const inOrder = (html: string, pieces: string[]) => {
  let at = -1;
  for (const p of pieces) {
    const next = html.indexOf(p);
    expect(next, p).toBeGreaterThan(at);
    at = next;
  }
};

describe("a summary in Detail, as the gateway serves its understanding", () => {
  it("leads with the stored summary, then who wrote it, as of when and why, then the facts and its earlier readings", () => {
    const html = body(node(), words(R.SERVED, "summary"));
    inOrder(html, [
      "A summary he formed",
      "He closed the day on the <strong>survey</strong> and kept the open question for tomorrow.",
      "A passive memory process, part of him (qwen/qwen3.8-27b) · understood as of 8 Nov 2026 · rewritten after new evidence",
      "<dt>born</dt>",
      "Earlier understandings (2)",
    ]);
    // The summary IS its words: no empty shell, no "none kept" fold, no old note.
    expect(html).not.toContain("The fuller summary arrives");
    expect(html).not.toContain("The words as saved");
    expect(html).not.toContain(UNSERVED_SENTENCE);
    expect(html).not.toContain("**survey**");
  });

  it("renders null as not computed yet", () => {
    const html = body(node({ graph_id: "ex:summary-77aa" }), words(R.NULLS, "summary"));
    inOrder(html, ["Summary: not computed yet.", "Who wrote it: not computed yet · understood as of: not computed yet · why: not computed yet", "<dt>born</dt>", "Earlier understandings"]);
    expect(html).toMatch(/Earlier understandings<\/span><span class="rd_fold_summary">not computed yet<\/span>/);
    // No empty fold of words that were not served.
    expect(html).not.toContain("The words as saved");
    expect(html).not.toContain("The fuller summary arrives");
    expect(html).not.toContain(UNSERVED_SENTENCE);
  });

  it("says ONCE that an older gateway does not serve it — no provenance, no guess", () => {
    const html = body(node(), words(R.OLD_GATEWAY, "summary"));
    expect(count(html, UNSERVED_SENTENCE)).toBe(1);
    expect(html).not.toContain('data-understanding="served"');
    expect(html).not.toContain("Earlier understandings");
    expect(html).not.toContain("The fuller summary arrives");
    // One missing key is enough.
    const partial: Read = { ...R.SERVED };
    delete partial.versions;
    const one = body(node(), words(partial, "summary"));
    expect(count(one, UNSERVED_SENTENCE)).toBe(1);
    expect(one).not.toContain("A passive memory process");
  });

  it("folds the earlier readings, newest first, each through the shared renderer", () => {
    const u = readUnderstanding(R.SERVED, "summary") as Extract<UnderstandingRead, { served: true }>;
    const closed = renderToStaticMarkup(<EarlierUnderstandings understanding={u.understanding} />);
    expect(closed).toMatch(/aria-expanded="false"[^>]*>.*Earlier understandings \(2\)/s);
    expect(closed).not.toContain("quiet day");
    const open = renderToStaticMarkup(<EarlierUnderstandings understanding={u.understanding} defaultOpen timeZone="UTC" />);
    inOrder(open, [
      "7 Nov 2026 · a passive memory process, part of him (qwen/qwen3.8-27b) · backfilled — an older memory, understood again",
      "He looked back on a quiet day of <em>reading</em>.",
      "6 Nov 2026 · mechanical — a placeholder until he understands it · first formed",
      "session reflection: owntime — 4 episodes, 2 lookups (survey, archive)",
    ]);
    // The current reading is not repeated among the earlier ones.
    expect(open).not.toContain("kept the open question");
    // Never rewritten: nothing to fold.
    expect(renderToStaticMarkup(<EarlierUnderstandings understanding={{ ...u.understanding, versions: [], digest_version: 0 }} />)).toBe("");
  });

  it("a dream: its stored summary is the content, then what the night moved; no second copy folded", () => {
    const dreamRead = { ...R.SERVED, kind: "dream", born_digest: true, text: "The night revised *admin*.", digest: "The night revised *admin*.", versions: [] };
    const html = body(node({ kind: "dream", title: "dream: …", signals: [{ kind: "unresolved_tension", touched: [] }] as NodeState["signals"] }), words(dreamRead, "dream"));
    inOrder(html, ["The night revised <em>admin</em>.", "A passive memory process", "The night set one tension side by side.", "<dt>born</dt>"]);
    expect(html).not.toContain("The sleep pass&#x27;s own summary");
  });

  it("an identity record (a lesson) shows its served summary and author too", () => {
    const lesson = { ...R.SERVED, kind: "lesson", text: "Check the date first.", digest: "Check the date **first**.", authored_by: { kind: "entity-mind", id: "castor" }, cause: "formation", versions: [] };
    const html = body(node({ kind: "lesson", title: "lesson: check the date" }), words(lesson, "lesson"));
    inOrder(html, ["Check the date <strong>first</strong>.", "His own words · understood as of", "first formed", "<dt>born</dt>", "The words as saved"]);
  });

  it("THE DIARY RULE stays: a diary entry is never read with the card and shows no understanding", () => {
    const diary = node({ kind: "diary", diary: true, diary_type: "note", graph_id: "ex:diary-86444591ec14d1d97", entry_id: "diary_3e8", title: "Kept the commitment" });
    const html = renderToStaticMarkup(<RecordBody fold={createFoldState()} node={diary} source={SOURCE} state={{ phase: "idle" }} renderFacts={facts} onSelect={() => {}} />);
    expect(html).toContain("His words in the book");
    expect(html).not.toContain(UNSERVED_SENTENCE);
    expect(html).not.toContain('data-understanding="served"');
  });
});

describe("a lived moment's Summary", () => {
  const episodeNode = node({ kind: "episode", graph_id: "ex:episode-3d", title: "exchange: what did you find?", digest: "A RECALL'S OLDER DIGEST" });
  const render = (w: RecordWords) => renderToStaticMarkup(<EpisodeBody node={episodeNode} entity="castor" state={{ phase: "ready", words: w }} renderFacts={facts} />);

  it("leads with the stored summary and its provenance, then the exchange", () => {
    const html = render(words(R.SERVED_EPISODE, "episode"));
    inOrder(html, ["Summary", "Admin asked what I found; I pointed to the <strong>UNHCR</strong> portal", "His own words · understood as of", "first formed", "Earlier understandings (1)", "The exchange"]);
    expect(html).not.toContain("A RECALL&#x27;S OLDER DIGEST");
    expect(html).not.toContain("The fuller summary arrives");
  });

  it("an older gateway: the recall's digest, with the one sentence", () => {
    const old = { ...R.SERVED_EPISODE } as Read;
    for (const k of ["digest", "digest_method", "digest_version", "version_count", "authored_by", "reader", "understood_at", "cause", "versions"]) delete old[k];
    const html = render(words(old, "episode"));
    expect(html).toContain("A RECALL&#x27;S OLDER DIGEST");
    expect(count(html, UNSERVED_SENTENCE)).toBe(1);
    expect(html).not.toContain("His own words");
  });
});

describe("a card's understanding", () => {
  const card = node({ kind: "world_model", graph_id: "ex:world_model-9b", title: "World model: admin" });
  const ready = (b: Read): CardRead => {
    const w = words(b, "world_model");
    const u = w.understanding;
    const text = u && u.served ? u.understanding.digest ?? "" : w.text;
    return { state: "ready", text, shape: readCard(text), understanding: u };
  };
  const section = (read: CardRead) => renderToStaticMarkup(<CardUnderstanding read={read} name="admin" card={card} onRetry={() => {}} />);

  it("shows the card's words, who wrote them and when, and its earlier readings", () => {
    const html = section(ready(R.SERVED_CARD));
    inOrder(html, ["Understanding of admin", "Admin trusts me with my own time", "His own words · understood as of", "rewritten after new evidence", "Earlier understandings (1)"]);
    expect(html).not.toContain("does not say who wrote them");
    expect(cardTypeWords(ready(R.SERVED_CARD))).toEqual({ text: "person", known: true });
    expect(cardTypeWords(ready({ ...R.SERVED_CARD, target_type: null }))).toEqual({ text: "not computed yet", known: false });
  });

  it("an older gateway: the card's words and the one sentence", () => {
    const old = { ...R.SERVED_CARD } as Read;
    for (const k of ["digest", "digest_method", "digest_version", "version_count", "authored_by", "reader", "understood_at", "cause", "versions", "target", "target_type", "card_revision", "source_count"]) delete old[k];
    const html = section(ready(old));
    expect(html).toContain("Admin trusts me with my own time");
    expect(count(html, UNSERVED_SENTENCE)).toBe(1);
    expect(cardTypeWords(ready(old))).toEqual({ text: "not served by this gateway yet", known: false });
  });

  it("a card not computed yet says so", () => {
    const html = section(ready({ ...R.SERVED_CARD, digest: null }));
    expect(html).toContain("Summary: not computed yet.");
    expect(html).not.toContain("Admin trusts me");
  });
});

describe("the stream and the hover cards use the served summary as served", () => {
  const env = (seq: number, display: Record<string, unknown>, record = "ex:summary-5c1e"): ReplayEnvelope =>
    ({
      stream: "abstractmemory.replay",
      stream_version: 1,
      seq,
      observed_at: "2026-11-08T12:00:00+00:00",
      scope: "life",
      owner_id: "entity:castor",
      trace_id: null,
      turn_id: null,
      run_id: null,
      family: "binding",
      payload: { record_id: record, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "inactive", lifecycle: "active", source: "remember", seq },
      display: { record_id: record, graph_id: record, kind: "summary", title: "session reflection: owntime", ...display },
    }) as unknown as ReplayEnvelope;

  it("the fold keeps a binding's served digest, the newest one winning (rewritten in place)", () => {
    const fold = foldEnvelopes([env(1, { digest: "first reading", digest_method: "mechanical-v2" }), env(2, { digest: "He closed the day on the survey.", digest_method: "authored-v1" })]);
    const n = fold.nodes.get("ex:summary-5c1e")!;
    expect(n.digest).toBe("He closed the day on the survey.");
    expect(n.digest_method).toBe("authored-v1");
    expect(foldEnvelopes([env(1, { digest: "first reading" }), env(2, { digest: "later" })], 1).nodes.get("ex:summary-5c1e")!.digest).toBe("first reading");
  });

  it("never keeps a digest on a diary record", () => {
    const fold = foldEnvelopes([env(1, { kind: "memory", digest: "private words" }, "ex:diary-86444591ec14d1d97")]);
    const n = fold.nodes.get("ex:diary-86444591ec14d1d97")!;
    expect(n.diary).toBe(true);
    expect(n.digest ?? null).toBeNull();
  });

  it("a hover card leads with the read's served summary, never his answer's lead derived from the words", () => {
    const ep = node({ kind: "episode", graph_id: "ex:episode-3d", digest: null });
    const text = String(R.SERVED_EPISODE.text);
    const read = readUnderstanding(R.SERVED_EPISODE, "episode");
    if (!read.served) throw new Error("the fixture is a served read");
    expect(cardSummary(ep, { phase: "ready", text, served: read.understanding }, "castor", "UTC")).toEqual({
      kind: "words",
      text: "Admin asked what I found; I pointed to the **UNHCR** portal and its 2026 tables.",
      plain: false,
      provenance: "his own words · first formed · 8 Nov 2026",
    });
    // Not served (older gateway / not computed yet): the exchange's lead, as before.
    expect(cardSummary(ep, { phase: "ready", text, served: null }, "castor")).toEqual({ kind: "words", text: "I found the **UNHCR** portal and its 2026 tables.", plain: false, provenance: null });
  });
});

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
  currentReading,
  DIARY_CARD_LINE,
  isDiaryNode,
  markdownTitle,
  nodeActions,
  nodeCardText,
  needsWords,
  partnerCount,
  placeCard,
  plainCardTitle,
  topicActions,
  type ServedReading,
} from "./hover_card";
import { PLACEHOLDER_WORDS } from "./understanding";
import { TITLE_BEING_WRITTEN } from "./untitled";
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

  it("an untitled record: 'title being written…' ONLY when the stream says so (display.pending), else its raw kind and date — never its id (operator 2026-11-09, review S2)", () => {
    // No pending served (an older gateway, or authoring that gave up): the kind and the date.
    const plain = foldEnvelopes(life).nodes.get("ex:memory-d")!;
    expect(plain.title_pending).not.toBe(true);
    expect(nodeCardText(plain).title).toBe("memory · 2026-11-07 10:00");
    expect(plainCardTitle(plain)).toBe("memory · 2026-11-07 10:00");
    expect(nodeCardText(plain).title).not.toContain("ex:");
    // Served pending.title (title None): the stream says it is being written.
    const pendingTitle = { title: true, summary: false, since: "2026-11-07T10:00:00+00:00", attempts: 0 };
    const pending = foldEnvelopes([binding(4, "ex:episode-p", "episode", null as unknown as string, { pending: pendingTitle })]).nodes.get("ex:episode-p")!;
    expect(pending.title_pending).toBe(true);
    expect(nodeCardText(pending).title).toBe(TITLE_BEING_WRITTEN);
    expect(TITLE_BEING_WRITTEN).toBe("title being written…");
    expect(plainCardTitle(pending)).toBe(TITLE_BEING_WRITTEN);
    // Only the title's own flag counts: a pending summary alone says nothing about the title.
    const summaryOnly = foldEnvelopes([binding(4, "ex:episode-s", "episode", "", { pending: { title: false, summary: true } })]).nodes.get("ex:episode-s")!;
    expect(nodeCardText(summaryOnly).title).toBe("episode · 2026-11-07 10:00");
    // A later block with the authored title ends it; a later block that says nothing keeps it.
    const titled = foldEnvelopes([binding(4, "ex:episode-p", "episode", "", { pending: pendingTitle }), binding(9, "ex:episode-p", "episode", "His title")]).nodes.get("ex:episode-p")!;
    expect(titled.title_pending).toBe(false);
    expect(nodeCardText(titled).title).toBe("His title");
    const silent = foldEnvelopes([binding(4, "ex:episode-p", "episode", "", { pending: pendingTitle }), binding(9, "ex:episode-p", "episode", "")]).nodes.get("ex:episode-p")!;
    expect(nodeCardText(silent).title).toBe(TITLE_BEING_WRITTEN);
    // The memory no longer pending (pending: null served): kind and date again.
    const cleared = foldEnvelopes([binding(4, "ex:episode-p", "episode", "", { pending: pendingTitle }), binding(9, "ex:episode-p", "episode", "", { pending: null })]).nodes.get("ex:episode-p")!;
    expect(nodeCardText(cleared).title).toBe("episode · 2026-11-07 10:00");
  });

  it("a summary equal to the title is not said twice", () => {
    const fold = foldEnvelopes([binding(1, "ex:memory-e", "memory", "one line"), snapshot(5, [{ record_id: "ex:memory-e", title: "one line", digest: "one line" }])]);
    expect(nodeCardText(fold.nodes.get("ex:memory-e")!).summary).toBeNull();
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
      provenance: null,
    });
    // An authored card: its lead.
    expect(cardSummary(node("ex:world_model-w"), ready("He sees housing as a slow emergency.\n\nSince then two counts rose."), "nerin")).toEqual({
      kind: "words",
      text: "He sees housing as a slow emergency.",
      plain: false,
      provenance: null,
    });
  });

  it("a lived moment: its digest when the fold holds one and the read serves none, else his answer's lead", () => {
    expect(cardSummary(node("ex:episode-e"), ready(EXCHANGE), "nerin")).toEqual({ kind: "words", text: "I found the **UNHCR** portal and its 2026 tables.", plain: false, provenance: null });
    const withDigest = { ...node("ex:episode-e"), digest: "person:admin: what did you find? nerin: the portal." };
    expect(cardSummary(withDigest, ready(EXCHANGE), "nerin")).toEqual({ kind: "words", text: "person:admin: what did you find? nerin: the portal.", plain: false, provenance: null });
  });

  it("a dream: the sleep pass's own summary as written (not Markdown)", () => {
    expect(cardSummary(node("ex:dream-d"), ready("Dream: revised `card A"), "nerin")).toEqual({ kind: "words", text: "Dream: revised `card A", plain: true, provenance: null });
  });

  it("lessons, interests, identity and summaries: the whole words", () => {
    for (const id of ["ex:lesson-l", "ex:interest-i", "ex:value-v", "ex:summary-s"]) {
      expect(cardSummary(node(id), ready("All of **its** words."), "nerin")).toEqual({ kind: "words", text: "All of **its** words.", plain: false, provenance: null });
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

  it("reads every record Detail would read — one whose digest the fold holds too (rewritten in place) — and nothing else", () => {
    expect(needsWords(node("ex:world_model-w"))).toBe(true);
    expect(needsWords({ ...node("ex:episode-e"), digest: "held" })).toBe(true);
    expect(needsWords({ ...node("ex:lesson-l"), kind: "relation" })).toBe(false);
    expect(needsWords({ ...node("ex:lesson-l"), bookkeeping: true })).toBe(false);
  });

  it("names the kind the way Detail opens", () => {
    expect(cardKindLine(node("ex:world_model-w"))).toBe("His working model of someone or something");
    expect(cardKindLine(node("ex:episode-e"))).toBe("A lived moment");
  });
});

/** nerin's moment from the operator's screenshot (2026-11-08), as his store
 * keeps it: reading 0 is the driver's mechanical digest (one line, the
 * answer's own "###" and "-" inline), reading 1 the backfill's prose. */
const OLD_MECHANICAL =
  "person:admin: so why did you stop exploring the world ? you thought that by looking 8 sites you would get a world view of where we are and what's happening? why did you decided to stop and sleep? nerin: You’re right to challenge that. , not using their substantive claims ### Promising leads found - WFP’s hunger hotspots";
const BACKFILLED: ServedReading = {
  digest: "Admin challenged me for stopping my exploration of the world after reviewing only **eight sites**. I admitted that I had mistaken initial breadth for sufficiency.",
  digest_version: 1,
  digest_method: "authored-backfill-v1",
  authored_by: { kind: "capability-model", id: "endpoint:compat-theforge-nvidia/qwen/qwen3.8-27b" },
  reader: { provider: "endpoint:compat-theforge-nvidia", model: "qwen/qwen3.8-27b" },
  cause: "backfill",
  understood_at: "2026-11-07T15:48:50.027470+00:00",
};
const BACKFILL_HINT = "a passive memory process, part of him (qwen/qwen3.8-27b) · backfilled · 7 Nov 2026";

describe("the card leads with the record's CURRENT understanding (operator 2026-11-08: the backfilled moment still showed its mechanical digest)", () => {
  const ID = "ex:episode-caeae4edfb36ab4fe6c4f36386";
  const recalled = foldEnvelopes([
    binding(1, ID, "episode", "exchange: so why did you stop exploring the world ? you thought that by looking…", { digest: OLD_MECHANICAL, digest_method: "mechanical-v2", digest_version: 0 }),
  ]);
  const ep = recalled.nodes.get(ID)!;
  const ready = (served: ServedReading | null) => ({ phase: "ready" as const, text: "person:admin:\nso why did you stop?\n\nnerin:\nYou’re right to challenge that.", served });

  it("the fold keeps which reading its digest is (memory's digest_version), set with the digest", () => {
    expect(ep.digest).toBe(OLD_MECHANICAL);
    expect(ep.digest_version).toBe(0);
    expect(ep.digest_method).toBe("mechanical-v2");
    // A later binding carrying reading 2 moves both together.
    const later = foldEnvelopes([binding(1, ID, "episode", "t", { digest: OLD_MECHANICAL, digest_version: 0 }), binding(2, ID, "episode", "t", { digest: "He kept looking.", digest_version: 2 })]);
    expect([later.nodes.get(ID)!.digest, later.nodes.get(ID)!.digest_version]).toEqual(["He kept looking.", 2]);
    // A snapshot payload row names no reading: unknown.
    const row = foldEnvelopes([binding(1, ID, "episode", "t", { digest: "x", digest_version: 3 }), snapshot(5, [{ record_id: ID, title: "t", digest: "y" }])]);
    expect([row.nodes.get(ID)!.digest, row.nodes.get(ID)!.digest_version]).toEqual(["y", null]);
  });

  it("the card reads a record whose digest the fold holds (its understanding is rewritten in place)", () => {
    expect(needsWords(ep)).toBe(true);
  });

  it("the read's served digest replaces the fold's mechanical one, with its provenance in Detail's words", () => {
    expect(cardSummary(ep, ready(BACKFILLED), "nerin", "UTC")).toEqual({ kind: "words", text: BACKFILLED.digest, plain: false, provenance: BACKFILL_HINT });
    expect(currentReading(ep, BACKFILLED, "UTC")).toEqual({ text: BACKFILLED.digest, provenance: BACKFILL_HINT, current: true });
  });

  it("while the read is under way (or failed) the fold's text shows, marked a placeholder when its method is mechanical", () => {
    expect(cardSummary(ep, { phase: "reading" }, "nerin", "UTC")).toEqual({ kind: "words", text: OLD_MECHANICAL, plain: false, provenance: PLACEHOLDER_WORDS });
    expect(cardSummary(ep, null, "nerin", "UTC")).toEqual({ kind: "words", text: OLD_MECHANICAL, plain: false, provenance: PLACEHOLDER_WORDS });
    expect(cardSummary(ep, { phase: "none", message: "his words could not be read (HTTP 500)" }, "nerin")!.kind).toBe("words");
    // The fold's text is never rewritten: shown as held, "###" and all.
    expect(currentReading(ep, null)!.text).toBe(OLD_MECHANICAL);
  });

  it("a fold reading NEWER than the read's (a rewrite landed after the card read) stays; equal or unknown versions take the read's", () => {
    const newer = { ...ep, digest: "He went back out to look.", digest_method: "authored-v1", digest_version: 2 };
    expect(currentReading(newer, BACKFILLED)).toEqual({ text: "He went back out to look.", provenance: null, current: false });
    expect(currentReading({ ...ep, digest_version: 1 }, BACKFILLED)!.current).toBe(true);
    expect(currentReading({ ...ep, digest_version: null }, BACKFILLED)!.current).toBe(true);
    expect(currentReading(ep, { ...BACKFILLED, digest_version: null })!.current).toBe(true);
  });

  it("a read that serves no digest yet (not computed / older gateway) leaves the fold's", () => {
    expect(currentReading(ep, { ...BACKFILLED, digest: null })).toEqual({ text: OLD_MECHANICAL, provenance: PLACEHOLDER_WORDS, current: false });
    expect(cardSummary(ep, ready(null), "nerin")).toEqual({ kind: "words", text: OLD_MECHANICAL, plain: false, provenance: PLACEHOLDER_WORDS });
  });

  it("a current reading that is itself mechanical says so", () => {
    const mech: ServedReading = { ...BACKFILLED, digest: "person:admin: hi nerin: hello", digest_method: "mechanical-v2", authored_by: { kind: "mechanical", id: "mechanical-v2" }, reader: null, cause: "formation" };
    expect(currentReading(ep, mech)!.provenance).toBe(PLACEHOLDER_WORDS);
  });

  it("a dream's understanding renders as Markdown (Detail's rule); its own sleep-pass summary as written", () => {
    const dream = { ...ep, kind: "dream", digest: "Dream: revised `card A", digest_method: "mechanical-dream-v1", digest_version: 0 };
    expect(cardSummary(dream, ready({ ...BACKFILLED, digest: "The night **joined** two threads." }), "nerin", "UTC")).toMatchObject({ text: "The night **joined** two threads.", plain: false });
    expect(cardSummary(dream, { phase: "reading" }, "nerin")).toMatchObject({ text: "Dream: revised `card A", plain: true });
  });

  it("THE DIARY GUARD: a diary record is never read and never shows a served reading", () => {
    const diary = foldEnvelopes([binding(1, "ex:diary-q", "diary", "an entry", { diary: true })]).nodes.get("ex:diary-q")!;
    expect(needsWords(diary)).toBe(false);
    expect(currentReading(diary, BACKFILLED)).toBeNull();
    expect(cardSummary(diary, ready(BACKFILLED), "nerin")).toEqual({ kind: "diary", text: DIARY_CARD_LINE });
    expect(currentReading({ ...ep, graph_id: "ex:diary-q", id: "row-q" }, BACKFILLED)).toBeNull();
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

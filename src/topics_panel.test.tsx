/**
 * THE TOPICS PANEL's states (react-dom/server; no DOM in the tests): the one
 * sentence while his topics are not served (first sleep to come; a gateway
 * before v2), loading and failed reads, then the list — authored titles and
 * summaries, counts, "being written…", the focused topic's members with the
 * provisional badge — folded on a phone; the topic view's facts in words
 * (memories and topics named by their titles, never an id), the verdict's
 * sentence, the stale-placement note. Never a keyword, never a label the app
 * made.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FIRST_SLEEP_SENTENCE, readCommunities, UNSERVED_SENTENCE, type CommunitiesRead, type ServedCommunity } from "./communities";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { membershipOf, topicColor } from "./topic_layout";
import {
  cardStyle,
  CENTROID_STALE_NOTE,
  EMPTY_TOPIC_SENTENCE,
  FACTS_WINDOW_DAYS,
  factsText,
  memberOpensIn,
  memoriesWord,
  NO_TOPICS,
  PATHS_HEAD,
  TOPICS_LOADING,
  topicFacts,
  TopicsPanel,
  topicCountWords,
  topicOrder,
  topicsNote,
  UNLOADED_SENTENCE,
  VERDICT_SENTENCE,
  waitingLine,
  type TopicsView,
} from "./topics_panel";

function binding(seq: number, id: string, kind: string, title: string, extra: Record<string, unknown> = {}): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "binding",
    observed_at: "2026-11-10T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:castor",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { record_id: id, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    display: { record_id: id, kind, title, graph_id: id, ...extra } as ReplayEnvelope["display"],
  } as ReplayEnvelope;
}

const FOLD = foldEnvelopes([
  binding(1, "ex:episode-1", "episode", "exchange: the harbour archive opens at nine"),
  binding(2, "ex:episode-2", "episode", "exchange: tide tables for the week"),
  binding(3, "ex:diary-3", "diary", "the mirrors held overnight", { diary: true }),
  binding(4, "ex:episode-4", "episode", "exchange: a placed newcomer"),
  binding(5, "ex:lesson-5", "lesson", "keep the record honest"),
]);

const comm = (key: string, members: string[], over: Record<string, unknown> = {}) => ({
  id: `ex:community-${key}-r3`,
  key,
  title: `Title ${key}`,
  summary: `Summary of ${key}.`,
  pending: [],
  verdict: null,
  size: members.length,
  kinds: { episode: members.length },
  members: members.map((id) => ({ id, via: "detected" })),
  provisional_ids: [],
  cohesion: 0.6,
  layout: { xy: [0, 0], radius: 1, seats: {} },
  centroid_stale: false,
  facts: {},
  ...over,
});

const READ = readCommunities({
  version: 2,
  version_seq: 102850,
  first_sleep_pending: false,
  algorithm: "louvain-warm-v1",
  links: [],
  communities: [
    comm("small", ["ex:lesson-5"], { title: null, pending: ["title"] }),
    comm("harbour", ["ex:episode-1", "ex:episode-2", "ex:diary-3"], { provisional_ids: ["ex:episode-4"], title: "The harbour archive", summary: "Where he goes to read the port's old ledgers." }),
  ],
});
const SERVED: TopicsView = { kind: "read", read: READ };

function render(view: TopicsView, over: Partial<React.ComponentProps<typeof TopicsPanel>> = {}): string {
  const read = view.kind === "read" && view.read.kind === "served" ? view.read : READ;
  const rowsOf = read.kind === "served" ? membershipOf(FOLD, read.data).rowsOf : new Map();
  return renderToStaticMarkup(
    <TopicsPanel
      view={view}
      fold={FOLD}
      rowsOf={rowsOf}
      waiting={0}
      focused={null}
      open={true}
      onToggle={() => {}}
      onFocus={() => {}}
      onOpenMember={() => {}}
      onHoverRows={() => {}}
      onFrameRows={() => {}}
      onRetry={() => {}}
      colorOf={() => "#fff"}
      {...over}
    />,
  );
}

describe("not served: one sentence", () => {
  it("his first sleep has not formed topics yet", () => {
    const html = render({ kind: "read", read: { kind: "first_sleep" } });
    // COMMUNITIES-DESIGN §4: "topics form during his next sleep".
    expect(FIRST_SLEEP_SENTENCE).toBe("His topics form during his next sleep.");
    expect(html).toBe(`<div class="gc_topics gc_topics_note" role="status">${FIRST_SLEEP_SENTENCE}</div>`);
  });

  it("a gateway before v2 says so — no client-side topics", () => {
    const html = render({ kind: "read", read: { kind: "unserved" } });
    expect(UNSERVED_SENTENCE).toBe("This gateway does not serve topics yet.");
    expect(html).toBe(`<div class="gc_topics gc_topics_note" role="status">${UNSERVED_SENTENCE}</div>`);
  });

  it("loading, a failed read (with retry), a wrong shape (named), none yet", () => {
    expect(render({ kind: "loading" })).toContain(TOPICS_LOADING);
    const failed = render({ kind: "error", message: "HTTP 503" });
    expect(failed).toContain("His topics could not be read — HTTP 503");
    expect(failed).toContain("gc_topics_error");
    expect(failed).toContain(">retry</button>");
    const wrong: CommunitiesRead = { kind: "malformed", problem: "topic 1 (“The harbour archive”): layout is not an object" };
    expect(render({ kind: "read", read: wrong })).toContain("His topics could not be read: topic 1 (“The harbour archive”): layout is not an object.");
    expect(topicsNote({ kind: "read", read: { kind: "served", data: { versionSeq: 1, communities: [], links: [] } } })).toEqual({ text: NO_TOPICS, error: false });
    // A required field left out (an older v2 gateway) is the same one sentence.
    expect(render({ kind: "read", read: { kind: "unserved", missing: "communities[0].facts" } })).toBe(`<div class="gc_topics gc_topics_note" role="status">${UNSERVED_SENTENCE}</div>`);
  });
});

describe("served: the list", () => {
  it("every topic, biggest first: authored title, summary, count — 'title being written…' while pending", () => {
    const html = render(SERVED);
    const titles = [...html.matchAll(/class="gc_tp_title[^"]*">([^<]*)</g)].map((m) => m[1]);
    expect(titles).toEqual(["The harbour archive", "title being written…"]);
    expect(html).toContain("Where he goes to read the port&#x27;s old ledgers.");
    expect(html).toContain(memoriesWord(4)); // 3 members + 1 provisional
    expect(html).toContain(memoriesWord(1));
    expect(html).toContain('class="gc_tp_title gc_tp_pending"');
    // The head counts the topics and the titles being written.
    expect(html).toMatch(/<span class="gc_tp_head_count">2<\/span><span class="gc_tp_head_pending">1 being written<\/span>/);
  });

  it("nothing is listed under a topic until it is focused or unfolded", () => {
    expect(render(SERVED)).not.toContain("gc_tp_member");
  });

  it("the focused topic lists its memories by type (memory's order, then the rest; newest first) and marks the provisional one", () => {
    const html = render(SERVED, { focused: "harbour" });
    const members = [...html.matchAll(/data-member="([^"]+)"/g)].map((m) => m[1]);
    // harbour's served kinds: {episode: 3}; the diary entry is a type memory did not count there.
    expect(members).toEqual(["ex:episode-4", "ex:episode-2", "ex:episode-1", "ex:diary-3"]);
    // One static line per type, before its memories, with how many of it are listed.
    const groups = [...html.matchAll(/class="gc_tp_group gc_tp_card" style="[^"]*" data-group="([^"]+)"[^>]*><i[^>]*><\/i>([^<]+)</g)].map((m) => [m[1], m[2]]);
    expect(groups).toEqual([["episode", "3 episodes"], ["diary", "1 diary entry"]]);
    expect(html.indexOf('data-group="episode"')).toBeLessThan(html.indexOf('data-member="ex:episode-4"'));
    expect(html.indexOf('data-member="ex:episode-1"')).toBeLessThan(html.indexOf('data-group="diary"'));
    expect(html.indexOf('data-group="diary"')).toBeLessThan(html.indexOf('data-member="ex:diary-3"'));
    const groupRow = html.slice(html.lastIndexOf("<li", html.indexOf('data-group="episode"')), html.indexOf('data-group="episode"'));
    expect(groupRow).toContain("af-disclosure__row--static");
    expect(html).toContain("the harbour archive opens at nine");
    expect(html).toContain("gc_tp_focused");
    const badges = [...html.matchAll(/gc_tp_provisional[^>]*><span class="af-chip__label">([^<]+)</g)].map((m) => m[1]);
    expect(badges).toEqual(["placed until his next sleep"]);
    const provisionalRow = html.slice(html.indexOf('data-member="ex:episode-4"'), html.indexOf('data-member="ex:diary-3"'));
    expect(provisionalRow).toContain("placed until his next sleep");
  });

  it("the head is a real disclosure: folded (a phone), the list is hidden", () => {
    const folded = render(SERVED, { open: false });
    expect(folded).toMatch(/<button type="button" class="gc_tp_head" aria-expanded="false" aria-controls="[^"]+">/);
    expect(folded).toMatch(/<div class="gc_tp_body" id="[^"]+" hidden="">/);
    expect(render(SERVED)).toMatch(/aria-expanded="true"/);
  });

  it("newer memories the version does not list are said, in his words", () => {
    expect(render(SERVED, { waiting: 3 })).toContain("3 newer memories join a topic at his next sleep.");
    expect(waitingLine(1)).toBe("1 newer memory joins a topic at his next sleep.");
    expect(waitingLine(0)).toBeNull();
  });

  it("the list is the kit's DisclosureList, never a keyword", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "topics_panel.tsx"), "utf8");
    expect(src).toContain('import { AfChip, DisclosureList, type DisclosureListHandle, type DisclosureRow, type DisclosureSelection } from "@abstractframework/ui-kit";');
    expect(src).toContain("<DisclosureList<TopicRowData>");
    expect(render(SERVED, { focused: "harbour" })).not.toMatch(/keyword|exemplar|louvain/i);
  });

  it("biggest first, ties by key; a diary member opens in the Book, any other in Detail", () => {
    if (READ.kind !== "served") throw new Error("fixture");
    expect(topicOrder(READ.data.communities).map((c) => c.key)).toEqual(["harbour", "small"]);
    expect(memberOpensIn(FOLD.nodes.get("ex:diary-3")!)).toBe("book");
    expect(memberOpensIn(FOLD.nodes.get("ex:episode-1")!)).toBe("detail");
  });
});

// ------------------------------------------------------------ the topic view's facts

const FACTS = {
  span: { first: "2026-07-07T12:00:00+00:00", last: "2026-11-09T12:00:00+00:00" },
  activity: 12,
  hub: "ex:episode-2",
  bridges: ["ex:episode-1", "ex:diary-3"],
  paths: [
    { from: "ex:episode-1", to: "ex:episode-2", count: 4 },
    { from: "ex:episode-1", to: "ex:gone-9", count: 9 },
  ],
  changed_since_last_sleep: { added: 2, moved: 1, split_from: "tides" },
};
const READ_FACTS = readCommunities({
  version: 2,
  version_seq: 102850,
  first_sleep_pending: false,
  algorithm: "louvain-warm-v1",
  links: [{ a: "harbour", b: "tides", weight: 0.3 }],
  communities: [
    comm("harbour", ["ex:episode-1", "ex:episode-2", "ex:diary-3"], { title: "The harbour archive", summary: "Where he goes to read the port's old ledgers.", facts: FACTS, centroid_stale: true }),
    comm("tides", ["ex:lesson-5"], { title: "Tide tables", verdict: "no_common_subject", facts: { activity: 0, hub: null, bridges: [], paths: [], changed_since_last_sleep: { added: 0, moved: 0, split_from: null } } }),
  ],
});
const FACTS_VIEW: TopicsView = { kind: "read", read: READ_FACTS };
const factsSlice = (html: string) => {
  const at = html.indexOf('class="gc_tp_facts gc_tp_card"');
  return at < 0 ? "" : html.slice(at, html.indexOf("</li>", at));
};
const text = (html: string) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
function servedCommunity(key: string): ServedCommunity {
  if (READ_FACTS.kind !== "served") throw new Error(JSON.stringify(READ_FACTS));
  return READ_FACTS.data.communities.find((c) => c.key === key)!;
}
const titles: Record<string, string> = { "ex:episode-1": "the archive opens", "ex:episode-2": "tide tables" };
const NOW = Date.parse("2026-11-10T12:00:00Z");

describe("the topic view: what memory counts of it, in words", () => {
  it("each fact in end-user words, memories and topics by their titles", () => {
    const facts = topicFacts(servedCommunity("harbour"), (id) => titles[id] ?? null, (k) => (k === "tides" ? "Tide tables" : null), "UTC", NOW);
    expect(facts).toEqual([
      // What it holds by type (memory's kinds), and when its newest memory formed.
      { kind: "kinds", text: "3 episodes" },
      { kind: "span", text: "last formed yesterday · since 7 Jul 2026" },
      { kind: "activity", text: "used 12 times in the last 7 days" },
      { kind: "hub", text: "most used: tide tables" },
      { kind: "bridges", text: "2 memories bridge to other topics" },
      { kind: "changed", text: "changed since his last sleep: +2 joined · 1 moved out · split from “Tide tables”" },
      // The pair whose other memory the graph does not hold is not said (never an id).
      { kind: "paths", text: PATHS_HEAD, paths: [{ a: "the archive opens", b: "tide tables", count: 4 }] },
      { kind: "stale", text: CENTROID_STALE_NOTE },
    ]);
    expect(CENTROID_STALE_NOTE).toBe("placement may be stale until his next sleep");
    expect(factsText(facts)).toContain("paths most travelled: the archive opens ↔ tide tables (4)");
  });

  it("a fact that is empty, absent or would have to show an id is not said", () => {
    const tides = topicFacts(servedCommunity("tides"), () => "x", () => null, "UTC", NOW);
    expect(tides).toEqual([{ kind: "kinds", text: "1 episode" }, { kind: "activity", text: "not used in the last 7 days" }]);
    // Nothing the graph holds: no hub, no paths; a split from no served topic (or itself) is "a larger topic".
    const harbour = servedCommunity("harbour");
    const bare = topicFacts(harbour, () => null, () => null, "UTC", NOW);
    expect(bare.map((f) => f.kind)).toEqual(["kinds", "span", "activity", "bridges", "changed", "stale"]);
    expect(bare.find((f) => f.kind === "changed")?.text).toBe("changed since his last sleep: +2 joined · 1 moved out · split from a larger topic");
    const self = { ...harbour, kinds: new Map(), facts: { changed: { added: 0, moved: 0, splitFrom: "harbour" } } };
    expect(topicFacts(self, () => null, () => "The harbour archive", "UTC", NOW)).toEqual([{ kind: "changed", text: "changed since his last sleep: split from a larger topic" }, { kind: "stale", text: CENTROID_STALE_NOTE }]);
    // Facts and kinds not served at all: nothing said; one use, one bridge in the singular; one day said once.
    expect(topicFacts({ ...harbour, kinds: new Map(), centroidStale: false, facts: {} }, () => "x", () => "y", "UTC", NOW)).toEqual([]);
    expect(topicFacts({ ...harbour, kinds: new Map([["episode", 0]]), centroidStale: false, facts: {} }, () => "x", () => "y", "UTC", NOW)).toEqual([]);
    const one = topicFacts({ ...harbour, kinds: new Map(), centroidStale: false, facts: { activity: 1, bridges: ["ex:episode-1"], span: { first: "2026-11-09T08:00:00+00:00", last: "2026-11-09T20:00:00+00:00" } } }, () => null, () => null, "UTC", NOW);
    expect(one.map((f) => f.text)).toEqual(["last formed 16 hours ago", "used 1 time in the last 7 days", "1 memory bridges to other topics"]);
    // Only a first day served: since that day.
    const firstOnly = topicFacts({ ...harbour, kinds: new Map(), centroidStale: false, facts: { span: { first: "2026-07-07T12:00:00+00:00", last: null } } }, () => null, () => null, "UTC", NOW);
    expect(firstOnly).toEqual([{ kind: "span", text: "since 7 Jul 2026" }]);
  });

  it("the facts show in the topic view only (unfolded), first under its title, a static row, never an id", () => {
    expect(render(FACTS_VIEW)).not.toContain("gc_tp_facts");
    const html = render(FACTS_VIEW, { focused: "harbour" });
    const facts = factsSlice(html);
    expect(facts).not.toBe("");
    // Before the members; one static row (not focusable, not selectable).
    expect(html.indexOf("gc_tp_facts")).toBeLessThan(html.indexOf("gc_tp_member"));
    const row = html.slice(html.lastIndexOf("<li", html.indexOf("gc_tp_facts")), html.indexOf("gc_tp_facts"));
    expect(row).toContain('aria-disabled="true"');
    expect(row).toContain('tabindex="-1"');
    expect(row).toContain("af-disclosure__row--static");
    const words = text(facts);
    // Types and recency are the topic row's own lines (under its title, before its summary): not repeated here.
    expect(words).not.toContain("|since ");
    expect(words).not.toContain("last formed");
    expect(words).not.toContain("3 episodes");
    expect(words).toContain("|used 12 times in the last 7 days|");
    // Titles from the graph's nodes.
    expect(words).toContain("|most used: tide tables for the week|");
    expect(words).toContain("|2 memories bridge to other topics|");
    expect(words).toContain("|changed since his last sleep: +2 joined · 1 moved out · split from “Tide tables”|");
    expect(words).toContain(`|${PATHS_HEAD}|the harbour archive opens at nine|↔|tide tables for the week|(4)|`);
    expect(words).toContain(`|${CENTROID_STALE_NOTE}|`);
    expect(facts).not.toContain("ex:");
    expect(facts).not.toContain("(9)");
  });

  it("the verdict 'no common subject' is said under the summary, as his author's", () => {
    expect(VERDICT_SENTENCE.no_common_subject).toBe("He found no common subject in these memories.");
    const html = render(FACTS_VIEW);
    expect(html).toContain('<span class="gc_tp_verdict">He found no common subject in these memories.</span>');
    expect(html.match(/gc_tp_verdict/g)?.length).toBe(1);
    expect(html.indexOf("gc_tp_verdict")).toBeGreaterThan(html.indexOf('data-topic="tides"'));
  });

  const MEMORY_INDEX_PY = path.resolve(__dirname, "../../abstractmemory/src/abstractmemory/community_index.py");
  it.skipIf(!fs.existsSync(MEMORY_INDEX_PY))("the window said is memory's FACTS_WINDOW_DAYS (drift pin)", () => {
    const m = fs.readFileSync(MEMORY_INDEX_PY, "utf8").match(/^FACTS_WINDOW_DAYS = (\d+)$/m);
    expect(Number(m?.[1])).toBe(FACTS_WINDOW_DAYS);
  });
});

// ------------------------------------------------------------ counts that agree with the lists (review S1)

describe("a topic's count says what it holds and what the graph has loaded — the length of its list", () => {
  // "ghost": every member outside the loaded graph; "empty": served holding
  // none; "harbour" lists ex:episode-2, which "tides" listed first.
  const ODD = readCommunities({
    version: 2,
    version_seq: 102851,
    first_sleep_pending: false,
    algorithm: "louvain-warm-v1",
    links: [],
    communities: [
      comm("tides", ["ex:episode-2", "ex:lesson-5"]),
      comm("harbour", ["ex:episode-1", "ex:episode-2", "ex:diary-3", "ex:episode-absent-1"]),
      comm("ghost", ["ex:episode-gone-1", "ex:episode-gone-2", "ex:episode-gone-3"], { size: 28 }),
      comm("empty", [], { size: 0 }),
    ],
  });
  const ODD_VIEW: TopicsView = { kind: "read", read: ODD };
  const rows = (html: string) => {
    // Each topic row's count, and what is listed under it (members, or the sentence).
    const out = new Map<string, { count: string; members: string[]; sentence: string | null }>();
    let at: string | null = null;
    for (const m of html.matchAll(/data-topic="([^"]+)"|gc_tp_count[^>]*><span class="af-chip__label">([^<]+)<|data-member="([^"]+)"|class="gc_tp_unloaded gc_tp_card" style="[^"]*" data-unloaded="[^"]+">([^<]+)</g)) {
      if (m[1]) {
        at = m[1];
        out.set(at, { count: "", members: [], sentence: null });
      } else if (m[2] && at) out.get(at)!.count = m[2];
      else if (m[3] && at) out.get(at)!.members.push(m[3]);
      else if (m[4] && at) out.get(at)!.sentence = m[4];
    }
    return out;
  };

  it("the words: the count alone when every memory is loaded, else beside how many are", () => {
    expect(topicCountWords(84, 84)).toBe("84 memories");
    expect(topicCountWords(1, 1)).toBe("1 memory");
    expect(topicCountWords(28, 0)).toBe("28 memories · 0 loaded in this view");
    expect(topicCountWords(4, 3)).toBe("4 memories · 3 loaded in this view");
  });

  it("every topic row: memory's count, and the loaded number when it differs", () => {
    const r = rows(render(ODD_VIEW));
    expect(r.get("ghost")!.count).toBe("28 memories · 0 loaded in this view");
    expect(r.get("empty")!.count).toBe("0 memories");
    expect(r.get("tides")!.count).toBe("2 memories");
    // One absent, one seated in "tides" (listed there first).
    expect(r.get("harbour")!.count).toBe("4 memories · 2 loaded in this view");
  });

  it("focused, a topic none of whose memories the graph has loaded says so in one sentence — never an empty list", () => {
    expect(UNLOADED_SENTENCE).toBe("Its memories are outside the loaded window.");
    const ghost = rows(render(ODD_VIEW, { focused: "ghost" })).get("ghost")!;
    expect(ghost.members).toEqual([]);
    expect(ghost.sentence).toBe(UNLOADED_SENTENCE);
    const html = render(ODD_VIEW, { focused: "ghost" });
    expect(html).toContain("gc_tp_focused");
    // A static row: never selected, never focused.
    const row = html.slice(html.lastIndexOf("<li", html.indexOf("gc_tp_unloaded")), html.indexOf("</li>", html.indexOf("gc_tp_unloaded")));
    expect(row).toContain("af-disclosure__row--static");
    // A topic served holding none says that instead.
    expect(rows(render(ODD_VIEW, { focused: "empty" })).get("empty")!.sentence).toBe(EMPTY_TOPIC_SENTENCE);
    // A topic with loaded memories lists them, no sentence.
    expect(rows(render(ODD_VIEW, { focused: "tides" })).get("tides")!.sentence).toBeNull();
  });

  it("unfolded, every topic lists exactly the number its count says is loaded; a memory listed by two topics is listed once", () => {
    if (ODD.kind !== "served") throw new Error("fixture");
    const rowsOf = membershipOf(FOLD, ODD.data).rowsOf;
    for (const key of ["tides", "harbour"]) {
      const r = rows(render(ODD_VIEW, { focused: key })).get(key)!;
      expect(r.members.length, key).toBe(rowsOf.get(key)!.length);
      expect(r.count, key).toMatch(new RegExp(`^\\d+ memor(y|ies)( · ${r.members.length} loaded in this view)?$`));
    }
    const listedBy = (id: string) => ["tides", "harbour"].filter((k) => rows(render(ODD_VIEW, { focused: k })).get(k)!.members.includes(id));
    expect(listedBy("ex:episode-2")).toEqual(["tides"]);
  });

  it("biggest first by the count each row says", () => {
    if (ODD.kind !== "served") throw new Error("fixture");
    expect(topicOrder(ODD.data.communities).map((c) => c.key)).toEqual(["ghost", "harbour", "tides", "empty"]);
  });
});

// ------------------------------------------------------------ one card per topic (backlog 0014)

describe("one card per topic, tinted with its colour (backlog 0014)", () => {
  const CARD_CSS = fs.readFileSync(path.resolve(__dirname, "topics_panel.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector: string) => {
    const at = CARD_CSS.indexOf(`${selector} {`);
    return at < 0 ? "" : CARD_CSS.slice(at, CARD_CSS.indexOf("}", at));
  };
  /** Every row's content in order: its class and the colour it carries. */
  const cards = (html: string) => [...html.matchAll(/<span (?:data-tkey="[^"]+" )?class="(gc_tp_\w+) gc_tp_card[^"]*" style="--gc-tp-color:([^"]+)"[^>]*data-tkey="([^"]+)"|<span data-tkey="([^"]+)" class="(gc_tp_\w+) gc_tp_card[^"]*" style="--gc-tp-color:([^"]+)"/g)].map((m) => (m[1] ? { cls: m[1], color: m[2], tkey: m[3] } : { cls: m[5], color: m[6], tkey: m[4] }));

  it("every row of a topic — its own, its facts, its memories, its sentence — carries the topic's circle colour", () => {
    const html = render(FACTS_VIEW, { focused: "harbour" });
    const rows = cards(html);
    expect(rows.map((r) => r.cls)).toEqual(expect.arrayContaining(["gc_tp_topic", "gc_tp_facts", "gc_tp_member"]));
    for (const r of rows) expect(r.color, r.cls).toBe(topicColor(r.tkey));
    expect(rows.filter((r) => r.tkey === "harbour").length).toBeGreaterThan(3);
    // The other topic's card is its own colour (a folded topic is a card of one row).
    expect(rows.filter((r) => r.tkey === "tides").map((r) => r.cls)).toEqual(["gc_tp_topic"]);
    const ghost = render({ kind: "read", read: readCommunities({ version: 2, version_seq: 1, first_sleep_pending: false, algorithm: "a", links: [], communities: [comm("ghost", ["ex:gone-1"])] }) }, { focused: "ghost" });
    expect(cards(ghost).map((r) => [r.cls, r.color])).toEqual([["gc_tp_topic", topicColor("ghost")], ["gc_tp_unloaded", topicColor("ghost")]]);
    // The tint carries the colour: no dot before the title.
    expect(html).not.toContain("gc_tp_dot");
    expect(cardStyle("#79c7ff")).toEqual({ "--gc-tp-color": "#79c7ff" });
  });

  it("the card: the colour at ~9 % over the panel, a 1 px edge in it, rounded at its first and last rows, a gap between cards", () => {
    const panel = fs.readFileSync(path.resolve(__dirname, "topics_panel.tsx"), "utf8");
    expect(panel).toContain('import "./topics_panel.css";');
    const tint = rule(".gc_topics .gc_tp_card::before");
    expect(tint).toContain("position: absolute;");
    expect(tint).toContain("inset: 0;");
    expect(tint).toContain("z-index: -1;");
    expect(tint).toContain("background: color-mix(in srgb, var(--gc-tp-color) 9%, transparent);");
    expect(tint).toContain("border-inline: 1px solid color-mix(in srgb, var(--gc-tp-color) 40%, transparent);");
    // The row is the tint's box, under its content and above the kit's washes.
    const row = rule(".gc_topics .gc_tp_list .af-disclosure__row[data-depth]");
    expect(row).toContain("position: relative;");
    expect(row).toContain("isolation: isolate;");
    expect(row).toContain("border: 0;");
    expect(rule(".gc_topics .gc_tp_list.af-disclosure")).toContain("gap: 0;");
    expect(rule('.gc_topics .gc_tp_list .af-disclosure__row[data-depth="0"]:not(:first-child)')).toContain("margin-top: 6px;");
    expect(rule('.gc_topics .gc_tp_list .af-disclosure__row[data-depth="0"] .gc_tp_card::before')).toContain("border-top: 1px solid");
    expect(rule('.gc_topics .gc_tp_list .af-disclosure__row[data-depth]:is(:last-child, :has(+ .af-disclosure__row[data-depth="0"])) .gc_tp_card::before')).toContain("border-bottom: 1px solid");
    // The kit's selection ring stays visible over the card (an outline, not the border the card removed).
    expect(rule(".gc_topics .gc_tp_list .af-disclosure__row--selected[data-depth]")).toContain("outline: 1px solid var(--accent-border);");
    // No colour of its own: the tint is the topic's, in every theme.
    expect(CARD_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

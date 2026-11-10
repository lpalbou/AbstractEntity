/**
 * A TOPIC BY MEMORY TYPE (operator 2026-11-10, Entity backlog 0005: "a
 * topic's member list grouped by memory type (xx episodes, xx dreams, xx
 * interests…); the topic's description carries those type stats and when
 * the last memories formed" — and "he checked and still sees none": the
 * facts sat below a long summary, out of the open panel's view). The words,
 * the groups, and the topic row that says them the moment it unfolds.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { readCommunities } from "./communities";
import { foldEnvelopes, type NodeState } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { membershipOf } from "./topic_layout";
import { agoWords, groupsCache, kindCountWords, kindsLine, LEAD_FACTS, memberGroups, memoryKindOf, topicKinds, topicRows, TopicsPanel, typesRowKey, type TopicsView } from "./topics_panel";

const CSS = fs.readFileSync(path.resolve(__dirname, "graph_canvas.css"), "utf8");
const CARD_CSS = fs.readFileSync(path.resolve(__dirname, "topics_panel.css"), "utf8");
const NOW = Date.parse("2026-11-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("agoWords", () => {
  it("says how long ago in words, then the day past eight weeks", () => {
    expect(agoWords(ago(0), NOW)).toBe("just now");
    expect(agoWords(ago(59_000), NOW)).toBe("just now");
    expect(agoWords(ago(MIN), NOW)).toBe("1 minute ago");
    expect(agoWords(ago(5 * MIN), NOW)).toBe("5 minutes ago");
    expect(agoWords(ago(HOUR), NOW)).toBe("1 hour ago");
    expect(agoWords(ago(9 * HOUR + 59 * MIN), NOW)).toBe("9 hours ago");
    expect(agoWords(ago(DAY), NOW)).toBe("yesterday");
    expect(agoWords(ago(2 * DAY), NOW)).toBe("2 days ago");
    expect(agoWords(ago(13 * DAY), NOW)).toBe("13 days ago");
    expect(agoWords(ago(14 * DAY), NOW)).toBe("2 weeks ago");
    expect(agoWords(ago(55 * DAY), NOW)).toBe("7 weeks ago");
    expect(agoWords("2026-07-08T14:20:52+00:00", NOW, "UTC")).toBe("on 8 Jul 2026");
  });

  it("a time ahead of the clock is 'just now'; an unreadable one is said as served", () => {
    expect(agoWords(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe("just now");
    expect(agoWords("not a time", NOW)).toBe("not a time");
  });
});

describe("the type words and counts", () => {
  it("names each type in the singular and the plural; an unnamed one by its served name", () => {
    expect(kindCountWords("episode", 118)).toBe("118 episodes");
    expect(kindCountWords("episode", 1)).toBe("1 episode");
    expect(kindCountWords("diary", 29)).toBe("29 diary entries");
    expect(kindCountWords("diary", 1)).toBe("1 diary entry");
    expect(kindCountWords("summary", 17)).toBe("17 summaries");
    expect(kindCountWords("world_model", 3)).toBe("3 world models");
    expect(kindCountWords("dream", 4)).toBe("4 dreams");
    expect(kindCountWords("interest", 3)).toBe("3 interests");
    expect(kindCountWords("new_kind", 2)).toBe("2 new kinds");
  });

  it("a topic's types: memory's counts, most first (ties by name), none at zero", () => {
    const c = { kinds: new Map([["interest", 10], ["episode", 118], ["summary", 17], ["dream", 10], ["value", 0]]) };
    expect(topicKinds(c)).toEqual([["episode", 118], ["summary", 17], ["dream", 10], ["interest", 10]]);
    expect(kindsLine(c)).toBe("118 episodes · 17 summaries · 10 dreams · 10 interests");
    expect(kindsLine({ kinds: new Map() })).toBeNull();
  });

  it("a memory's type is memory's: a diary entry is 'diary' whatever its kind says", () => {
    expect(memoryKindOf({ kind: "episode", diary: false })).toBe("episode");
    expect(memoryKindOf({ kind: "reflection", diary: true })).toBe("diary");
  });
});

const node = (id: string, kind: string, seq: number, diary = false) => ({ id, kind, first_seq: seq, diary }) as unknown as NodeState;

describe("memberGroups", () => {
  it("each type keeps its memories' graph node ids (what a hover on it lights), grouped once per answer and fold", () => {
    const c = { key: "k", kinds: new Map([["episode", 2]]) } as unknown as Parameters<ReturnType<typeof groupsCache>>[0];
    const nodes = [node("e1", "episode", 1), node("e2", "episode", 5), node("d1", "diary", 3, true)];
    expect(memberGroups(c, nodes).map((g) => [g.memoryKind, g.ids])).toEqual([["episode", ["e2", "e1"]], ["diary", ["d1"]]]);
    const groupsOf = groupsCache();
    const first = groupsOf(c, nodes);
    // The rows rebuilt for a disclosure reuse the groups (same answer, same fold): never regrouped.
    expect(groupsOf(c, [])).toBe(first);
    expect(groupsCache()(c, [])).toEqual([]);
  });

  it("groups in memory's order of types, then the rest (most first, ties by name); newest first inside", () => {
    const c = { kinds: new Map([["episode", 5], ["dream", 2]]) };
    const groups = memberGroups(c, [
      node("e1", "episode", 1),
      node("d1", "diary", 2, true),
      node("e2", "episode", 9),
      node("i1", "interest", 3),
      node("dr1", "dream", 4),
      node("i2", "interest", 7),
      node("l1", "lesson", 8),
    ]);
    expect(groups.map((g) => [g.memoryKind, g.nodes.map((n) => n.id)])).toEqual([
      ["episode", ["e2", "e1"]],
      ["dream", ["dr1"]],
      ["interest", ["i2", "i1"]],
      ["diary", ["d1"]],
      ["lesson", ["l1"]],
    ]);
  });
});

// A topic with a long summary: its types and recency must be in its own row, before the summary.
function binding(seq: number, id: string, kind: string, title: string, diary = false): ReplayEnvelope {
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
    display: { record_id: id, kind, title, graph_id: id, ...(diary ? { diary: true } : {}) } as ReplayEnvelope["display"],
  } as ReplayEnvelope;
}
const FOLD = foldEnvelopes([
  binding(1, "ex:episode-1", "episode", "exchange: the bridges"),
  binding(2, "ex:episode-2", "episode", "exchange: the checklist"),
  binding(3, "ex:diary-3", "diary", "the mirrors held", true),
  binding(4, "ex:interest-4", "interest", "bridges"),
]);
const LONG = "This community groups memories about maintaining a set of twelve concept-pair bridges. ".repeat(4).trim();
const READ = readCommunities({
  version: 2,
  version_seq: 107166,
  first_sleep_pending: false,
  algorithm: "louvain-warm-v1",
  links: [],
  communities: [
    {
      id: "ex:community-r1",
      key: "bridges",
      title: "Tending the twelve continuity bridges",
      summary: LONG,
      pending: [],
      verdict: null,
      size: 4,
      kinds: { episode: 2, diary: 1, interest: 1 },
      members: ["ex:episode-1", "ex:episode-2", "ex:diary-3", "ex:interest-4"].map((id) => ({ id, via: "detected" })),
      provisional_ids: [],
      cohesion: 0.5,
      layout: { xy: [0, 0], radius: 1, seats: {} },
      centroid_stale: false,
      facts: { span: { first: "2026-07-08T14:20:52+00:00", last: "2026-11-10T02:00:00+00:00" }, activity: 0 },
    },
  ],
});
const VIEW: TopicsView = { kind: "read", read: READ };
function render(over: Partial<React.ComponentProps<typeof TopicsPanel>> = {}): string {
  if (READ.kind !== "served") throw new Error(JSON.stringify(READ));
  return renderToStaticMarkup(
    <TopicsPanel
      view={VIEW}
      fold={FOLD}
      rowsOf={membershipOf(FOLD, READ.data).rowsOf}
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

describe("the unfolded topic says its types and recency in its own row", () => {
  it("under its title and count, before its summary: the type counts, then 'last formed … · since …'", () => {
    const html = render({ focused: "bridges" });
    const lead = [...html.matchAll(/class="gc_tp_lead gc_tp_lead_(\w+)">([^<]+)</g)].map((m) => [m[1], m[2]]);
    expect(lead[0]).toEqual(["kinds", "2 episodes · 1 diary entry · 1 interest"]);
    expect(lead[1][0]).toBe("span");
    expect(lead[1][1]).toMatch(/^last formed .+ · since 8 Jul 2026$/);
    const title = html.indexOf("gc_tp_title");
    const kinds = html.indexOf("gc_tp_lead_kinds");
    const summary = html.indexOf("gc_tp_summary");
    expect(title).toBeGreaterThan(0);
    expect(kinds).toBeGreaterThan(title);
    expect(summary).toBeGreaterThan(kinds);
    // Inside the topic row itself (not the facts row below the summary).
    const topicRow = html.slice(html.indexOf('class="gc_tp_topic'), html.indexOf("</li>", html.indexOf('class="gc_tp_topic')));
    expect(topicRow).toContain("gc_tp_lead_kinds");
    expect(topicRow).toContain("gc_tp_lead_span");
    // Not repeated in the facts row.
    const facts = html.slice(html.indexOf('class="gc_tp_facts gc_tp_card"'));
    expect(facts).not.toContain("last formed");
    expect(LEAD_FACTS.has("kinds") && LEAD_FACTS.has("span")).toBe(true);
  });

  it("then its memory types (folded), one row per type with how many are listed", () => {
    if (READ.kind !== "served") throw new Error(JSON.stringify(READ));
    expect(render({ focused: "bridges" })).toContain('data-types="bridges"');
    const rows = topicRows(READ.data.communities, new Set(["bridges"]), membershipOf(FOLD, READ.data).rowsOf, FOLD, { opened: new Set([typesRowKey("bridges")]) });
    expect(rows.filter((r) => r.data?.kind === "group").map((r) => r.textValue)).toEqual(["2 episodes", "1 diary entry", "1 interest"]);
  });

  it("folded (not focused, not unfolded): no type line, no groups", () => {
    const html = render();
    expect(html).not.toContain("gc_tp_lead");
    expect(html).not.toContain("gc_tp_group");
  });

  it("the lead lines and the type rows are styled to show, and no phone rule hides them", () => {
    expect(CSS).toMatch(/\.gc_tp_lead \{[^}]*flex-basis: 100%;/);
    // A type row: its dot and its plain words ("80 episodes"), its head the sub-panel's bold line.
    expect(CARD_CSS).toMatch(/\.gc_topics \.gc_tp_group \{[^}]*display: flex;[^}]*font-weight: 400;/);
    expect(CARD_CSS).toMatch(/\.gc_topics \.gc_tp_types_head \{[^}]*font-weight: 600;/);
    for (const block of [...CSS.split("}"), ...CARD_CSS.split("}")]) {
      if (block.includes("gc_tp_lead") || block.includes("gc_tp_group") || block.includes("gc_tp_types_head")) expect(block).not.toMatch(/display:\s*none/);
    }
  });
});

/**
 * THE TOPICS PANEL (memory-owned communities, COMMUNITIES-DESIGN 2026-11-10
 * §4): the drill-down over the graph. Topic -> its members -> the memory.
 *
 * - Each topic (the kit's DisclosureList, one row per community, biggest
 *   first) is ONE CARD (operator 2026-11-10, Entity backlog 0014): its rows
 *   (the topic's own, then what it unfolds) share one rounded box tinted
 *   with the topic's colour — its circle's on the graph (topicColor) — at a
 *   low alpha over the panel, its edge the same colour; a gap between the
 *   cards. Its authored title, its summary and how many memories it holds;
 *   "title being written…" / "summary being written…" while memory says so,
 *   never a label the app made. The count is memory's (its size plus the
 *   memories placed since) and, when the graph has loaded a different
 *   number of them, that number too ("28 memories · 0 loaded in this
 *   view") — the length of the list it unfolds. A focused topic none of
 *   whose memories the graph has loaded says so in one sentence ("Its
 *   memories are outside the loaded window."), never an empty list.
 * - A click on a topic FOCUSES it: the graph frames its circle and lights
 *   its memories, and the topic unfolds. A click on an unfolded topic (its
 *   row, its chevron; Enter or Space on its row) FOLDS it back to the card
 *   it was, nothing else changed (operator 2026-11-10 20:13, Entity backlog
 *   0026: "we can't refold the topic as they were before clicking"): it
 *   stays focused — the filter chip on the graph lets it go — and the next
 *   click unfolds it again.
 * - ITS MEMORY TYPES (operator 2026-11-10, Entity backlog 0016): one
 *   sub-panel "Memory types" in its card, folded by default (a disclosure
 *   whose mark says its state). Unfolded, one row per type with how many of
 *   that type the graph has loaded ("80 episodes"), its dot the graph's
 *   colour for the type. The pointer resting on a type (HOVER_INTENT_MS),
 *   or the keyboard on it, LIGHTS those memories on the graph — where they
 *   sit in the circles (onHoverRows); leaving it lets go. A click on a type
 *   unfolds its memories (titles, newest first) in the panel, which scrolls
 *   to show them.
 * - A click on a member opens it (Detail; a diary entry shows in the Book —
 *   the graph's rule). A member placed since his last sleep carries the
 *   badge "placed until his next sleep".
 * - The topic view (unfolded) says first what it holds by memory type, from
 *   memory's own counts ("118 episodes · 29 diary entries · 10 interests"),
 *   and when its newest memory formed ("last formed 9 hours ago · since 8
 *   Jul 2026"); then what memory counts of it (`facts`), in words: how much it was used this week,
 *   its most used memory, its bridges to other topics, what his last sleep
 *   changed, the pairs of memories most used together; and, when its
 *   centroid is stale, that its placement may be. Memories and topics are
 *   named by their titles (the graph's nodes, the served topics) — a fact
 *   naming one the graph does not hold is not said, never an id.
 * - THE PATHS MOST TRAVELLED (operator 2026-11-10, Entity backlog 0015):
 *   memory's pairs of members most used together this week (at most
 *   PATHS_SHOWN, its own top), one row each: "a ↔ b (count)" on one line,
 *   each title cut on its own, the count always shown. The pointer resting
 *   on one (HOVER_INTENT_MS), or the keyboard on it, says the whole pair
 *   (the line unfolds) and LIGHTS its two memories on the graph
 *   (onHoverRows); leaving it lets go (the topic's own light comes back). A
 *   click (a tap, Enter) frames the two (onFrameRows) and keeps them lit
 *   until it is clicked again, another is, or the topic changes. On the
 *   phone layout a tap also folds the panel (it covered the frame), the
 *   pair kept lit.
 * - His author's verdict "no common subject" is said under the summary.
 * - Not served: ONE sentence instead of the list — his first sleep has not
 *   formed topics yet, or this gateway serves the old shape.
 *
 * - The pointer resting on a topic (its row, its facts or one of its
 *   memories) for HOVER_INTENT_MS, or the keyboard on its row, LIGHTS it on
 *   the graph (the spotlight, graph_canvas_spotlight.ts) and dims the rest;
 *   a sweep across the rows lights nothing; leaving the list lets go (the
 *   focused topic, if any, is lit again). A touch never hovers.
 *
 * Over the graph: open on a wide screen, folded on a phone (a real
 * disclosure: the head is a button with aria-expanded), so the graph keeps
 * its tap targets.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AfChip, DisclosureList, type DisclosureListHandle, type DisclosureRow, type DisclosureSelection } from "@abstractframework/ui-kit";

import { FIRST_SLEEP_SENTENCE, heldCount, NO_COMMON_SUBJECT, PROVISIONAL_BADGE, topicSummary, topicTitle, UNSERVED_SENTENCE, type CommunitiesRead, type ServedCommunity } from "./communities";
import { topicColor } from "./topic_layout";
import type { FoldState, NodeState } from "./stream_fold";
import { isDiaryNode, plainCardTitle } from "./hover_card";
import { dayWords } from "./understanding";
import { TITLE_BEING_WRITTEN } from "./untitled";
import { hoverIntent, HOVER_INTENT_MS, type HoverIntentTimers } from "./hover_intent";
import "./topics_panel.css";

/** What the panel shows: the answer being read, a failed read, or the read. */
export type TopicsView = { kind: "loading" } | { kind: "error"; message: string } | { kind: "read"; read: CommunitiesRead };

export const TOPICS_LOADING = "Reading his topics…";
export const NO_TOPICS = "No topics yet.";

/** The one line a view that has no list shows (null when it has a list). */
export function topicsNote(view: TopicsView): { text: string; error: boolean } | null {
  if (view.kind === "loading") return { text: TOPICS_LOADING, error: false };
  if (view.kind === "error") return { text: `His topics could not be read — ${view.message}`, error: true };
  const read = view.read;
  if (read.kind === "first_sleep") return { text: FIRST_SLEEP_SENTENCE, error: false };
  if (read.kind === "unserved") return { text: UNSERVED_SENTENCE, error: false };
  if (read.kind === "malformed") return { text: `His topics could not be read: ${read.problem}.`, error: true };
  if (read.data.communities.length === 0) return { text: NO_TOPICS, error: false };
  return null;
}

/** A request to open the panel on a topic (a ledger row about it,
 * ledger_lines.topicTarget), once the topics are known: "wait" while they
 * are being read; then "focus" when this topic is among them, else "open"
 * (the panel opens on its list or its one sentence — a topic that has
 * dissolved since, a read that failed). */
export function topicRequestStep(view: TopicsView | null, known: boolean): "wait" | "focus" | "open" {
  if (view?.kind === "loading") return "wait";
  return known ? "focus" : "open";
}

/** "84 memories" (the served count). */
export function memoriesWord(n: number): string {
  return `${n} ${n === 1 ? "memory" : "memories"}`;
}

/** A topic's count: how many memories it holds (communities.heldCount) and,
 * when the graph has loaded a different number of them (a scrubbed past,
 * members outside the loaded window, a member another topic lists first),
 * how many — the number its list shows. "28 memories · 0 loaded in this
 * view". */
export function topicCountWords(held: number, loaded: number): string {
  return loaded === held ? memoriesWord(held) : `${memoriesWord(held)} · ${loaded} loaded in this view`;
}

/** What a focused topic none of whose memories the graph has loaded says
 * where its members would be listed (review S1): one sentence, never an
 * empty list. */
export const UNLOADED_SENTENCE = "Its memories are outside the loaded window.";
/** …and a topic served holding none (memory counts it 0). */
export const EMPTY_TOPIC_SENTENCE = "It holds no memories.";

/** The newer memories the version does not list (they join a topic at his
 * next sleep). */
export function waitingLine(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 newer memory joins a topic at his next sleep." : `${n} newer memories join a topic at his next sleep.`;
}

/** The window memory counts `facts.activity` and `facts.paths` over
 * (abstractmemory community_index.FACTS_WINDOW_DAYS; pinned by the test). */
export const FACTS_WINDOW_DAYS = 7;
/** The sentence of each verdict memory's author may return. */
export const VERDICT_SENTENCE: Record<typeof NO_COMMON_SUBJECT, string> = {
  [NO_COMMON_SUBJECT]: "He found no common subject in these memories.",
};
export const CENTROID_STALE_NOTE = "placement may be stale until his next sleep";
export const PATHS_HEAD = "paths most travelled";
/** The most paths a topic lists: memory's own top (abstractmemory
 * community_index.FACTS_PATHS_TOP; pinned by the test). */
export const PATHS_SHOWN = 5;

/** A memory type in words, singular and plural ("diary entry", "diary
 * entries"); a type this app does not name is its served name, spaced. */
const KIND_NAMES: Record<string, [string, string]> = {
  episode: ["episode", "episodes"],
  diary: ["diary entry", "diary entries"],
  summary: ["summary", "summaries"],
  interest: ["interest", "interests"],
  dream: ["dream", "dreams"],
  lesson: ["lesson", "lessons"],
  world_model: ["world model", "world models"],
  value: ["value", "values"],
  purpose: ["purpose", "purposes"],
  trait: ["trait", "traits"],
  limit: ["limit", "limits"],
  claim: ["claim", "claims"],
  memory: ["memory", "memories"],
  observation: ["observation", "observations"],
  realization: ["realization", "realizations"],
  question: ["question", "questions"],
  relation: ["link", "links"],
};

/** "118 episodes", "1 diary entry". */
export function kindCountWords(kind: string, n: number): string {
  const [one, many] = KIND_NAMES[kind] ?? [kind.replace(/_/g, " "), `${kind.replace(/_/g, " ")}s`];
  return `${n} ${n === 1 ? one : many}`;
}

/** A memory's type as memory counts it in a topic's `kinds`. */
export function memoryKindOf(node: Pick<NodeState, "kind" | "diary">): string {
  return node.diary ? "diary" : node.kind;
}

/** A topic's types, most first (ties by name), from memory's own counts. */
export function topicKinds(c: Pick<ServedCommunity, "kinds">): Array<[string, number]> {
  return [...c.kinds.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** The memory types sub-panel's head. */
export const MEMORY_TYPES_HEAD = "Memory types";

/** "118 episodes · 29 diary entries · 10 interests" (null: no counts served). */
export function kindsLine(c: Pick<ServedCommunity, "kinds">): string | null {
  const kinds = topicKinds(c);
  return kinds.length ? kinds.map(([k, n]) => kindCountWords(k, n)).join(" · ") : null;
}

/** How long ago, in words: "just now", "5 minutes ago", "9 hours ago",
 * "yesterday", "4 days ago", "3 weeks ago", then the day ("on 8 Jul 2026"). */
export function agoWords(iso: string, nowMs: number, timeZone?: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const s = Math.max(0, (nowMs - at) / 1000);
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"} ago`;
  if (s < 60) return "just now";
  if (s < 3600) return n(Math.floor(s / 60), "minute");
  if (s < 86400) return n(Math.floor(s / 3600), "hour");
  if (s < 2 * 86400) return "yesterday";
  if (s < 14 * 86400) return n(Math.floor(s / 86400), "day");
  if (s < 56 * 86400) return n(Math.floor(s / (7 * 86400)), "week");
  return `on ${dayWords(iso, timeZone)}`;
}

export type TopicFact =
  | { kind: "kinds" | "span" | "activity" | "hub" | "bridges" | "changed" | "stale"; text: string }
  | { kind: "paths"; text: string; paths: TopicPath[] };

/** A pair of memories most used together: their titles (a, b), how often,
 * and their served record ids (from, to). */
export interface TopicPath {
  a: string;
  b: string;
  count: number;
  from: string;
  to: string;
}

/** What memory counts of a topic, in words: first what it holds by type
 * (`kinds`) and when its newest memory formed (`span.last`, relative to
 * `nowMs`), then the rest. `titleOf` names a member record (its graph id)
 * by the graph's node, null when the graph does not hold it;
 * `topicTitleOf` names another topic by its key, null when not served or
 * its title is not written. Nothing is said for an absent fact, an empty
 * one, or one that would have to show an id. */
export function topicFacts(c: ServedCommunity, titleOf: (graphId: string) => string | null, topicTitleOf: (key: string) => string | null, timeZone?: string, nowMs: number = Date.now()): TopicFact[] {
  const f = c.facts;
  const out: TopicFact[] = [];
  const kinds = kindsLine(c);
  if (kinds) out.push({ kind: "kinds", text: kinds });
  const first = f.span?.first ?? null;
  const last = f.span?.last ?? null;
  const span: string[] = [];
  if (last) span.push(`last formed ${agoWords(last, nowMs, timeZone)}`);
  if (first && !(last && dayWords(first, timeZone) === dayWords(last, timeZone))) span.push(`since ${dayWords(first, timeZone)}`);
  if (span.length) out.push({ kind: "span", text: span.join(" · ") });
  if (f.activity !== undefined) {
    const n = f.activity;
    out.push({ kind: "activity", text: n === 0 ? `not used in the last ${FACTS_WINDOW_DAYS} days` : `used ${n} ${n === 1 ? "time" : "times"} in the last ${FACTS_WINDOW_DAYS} days` });
  }
  const hub = f.hub ? titleOf(f.hub) : null;
  if (hub) out.push({ kind: "hub", text: `most used: ${hub}` });
  const bridges = f.bridges?.length ?? 0;
  if (bridges > 0) out.push({ kind: "bridges", text: `${bridges} ${bridges === 1 ? "memory bridges" : "memories bridge"} to other topics` });
  const ch = f.changed;
  if (ch) {
    const parts: string[] = [];
    if (ch.added > 0) parts.push(`+${ch.added} joined`);
    if (ch.moved > 0) parts.push(`${ch.moved} moved out`);
    if (ch.splitFrom) {
      const origin = ch.splitFrom !== c.key ? topicTitleOf(ch.splitFrom) : null;
      parts.push(origin ? `split from “${origin}”` : "split from a larger topic");
    }
    if (parts.length) out.push({ kind: "changed", text: `changed since his last sleep: ${parts.join(" · ")}` });
  }
  const paths: TopicPath[] = [];
  for (const p of f.paths ?? []) {
    const a = titleOf(p.from);
    const b = titleOf(p.to);
    if (a && b && paths.length < PATHS_SHOWN) paths.push({ a, b, count: p.count, from: p.from, to: p.to });
  }
  if (paths.length) out.push({ kind: "paths", text: PATHS_HEAD, paths });
  if (c.centroidStale) out.push({ kind: "stale", text: CENTROID_STALE_NOTE });
  return out;
}

/** A path in words: "a ↔ b (4)" (its row's text). */
export function pathText(p: Pick<TopicPath, "a" | "b" | "count">): string {
  return `${p.a} ↔ ${p.b} (${p.count})`;
}

/** The facts as one line of text (the row's accessible text). */
export function factsText(facts: TopicFact[]): string {
  return facts.map((f) => (f.kind === "paths" ? `${f.text}: ${f.paths.map(pathText).join("; ")}` : f.text)).join(". ");
}

/** Topics biggest first (the count each row says; ties by key: stable). */
export function topicOrder(communities: ServedCommunity[]): ServedCommunity[] {
  return [...communities].sort((a, b) => heldCount(b) - heldCount(a) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export type TopicRowData =
  | { kind: "topic"; c: ServedCommunity; loaded: number; lead: TopicFact[] }
  | { kind: "facts"; c: ServedCommunity; facts: TopicFact[] }
  | { kind: "paths_head"; c: ServedCommunity }
  /** `ids`: its two memories' graph node ids (the fold's rows). */
  | { kind: "path"; c: ServedCommunity; path: TopicPath; ids: string[] }
  | { kind: "types"; c: ServedCommunity }
  /** A memory type of the topic: `ids`, its loaded memories' graph node ids. */
  | { kind: "group"; c: ServedCommunity; memoryKind: string; count: number; sample: NodeState; ids: readonly string[] }
  | { kind: "unloaded"; c: ServedCommunity; text: string }
  | { kind: "member"; c: ServedCommunity; node: NodeState; provisional: boolean };
export type TopicRow = DisclosureRow<TopicRowData>;

export const topicRowKey = (key: string) => `topic:${key}`;
export const memberRowKey = (key: string, row: string) => `member:${key}:${row}`;
export const factsRowKey = (key: string) => `facts:${key}`;
export const pathsHeadRowKey = (key: string) => `paths:${key}`;
export const pathRowKey = (key: string, p: Pick<TopicPath, "from" | "to">) => `path:${key}:${p.from}:${p.to}`;
export const unloadedRowKey = (key: string) => `unloaded:${key}`;
export const groupRowKey = (key: string, memoryKind: string) => `group:${key}:${memoryKind}`;
export const typesRowKey = (key: string) => `types:${key}`;

/** A topic's loaded memories of one type (memberGroups), with their graph
 * node ids (what a hover on the type lights). */
export interface MemberGroup {
  memoryKind: string;
  nodes: NodeState[];
  ids: string[];
}

/** A topic's loaded memories by type: memory's order of its types (most
 * first), then any other type loaded (most first, ties by name); newest
 * first inside a type. */
export function memberGroups(c: Pick<ServedCommunity, "kinds">, nodes: NodeState[]): MemberGroup[] {
  const byKind = new Map<string, NodeState[]>();
  for (const node of nodes) {
    const k = memoryKindOf(node);
    const list = byKind.get(k);
    if (list) list.push(node);
    else byKind.set(k, [node]);
  }
  const served = topicKinds(c).map(([k]) => k);
  const rank = new Map(served.map((k, i) => [k, i]));
  const order = [...byKind.keys()].sort((a, b) => {
    const ra = rank.get(a) ?? Infinity;
    const rb = rank.get(b) ?? Infinity;
    if (ra !== rb) return ra - rb;
    return byKind.get(b)!.length - byKind.get(a)!.length || (a < b ? -1 : a > b ? 1 : 0);
  });
  return order.map((memoryKind) => {
    const sorted = byKind.get(memoryKind)!.sort((a, b) => b.first_seq - a.first_seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { memoryKind, nodes: sorted, ids: sorted.map((n) => n.id) };
  });
}

/** A topic's types, grouped once per answer and fold (the rows rebuilt for
 * a fold or a disclosure reuse them; a hover only looks its ids up). */
export type GroupsOf = (c: ServedCommunity, nodes: NodeState[]) => MemberGroup[];
export function groupsCache(): GroupsOf {
  const cache = new Map<string, MemberGroup[]>();
  return (c, nodes) => {
    let groups = cache.get(c.key);
    if (!groups) {
      groups = memberGroups(c, nodes);
      cache.set(c.key, groups);
    }
    return groups;
  };
}

/** The facts an unfolded topic says in its own row, under its title and
 * before its summary (visible the moment it unfolds, never below a long
 * summary): what it holds by type and when its newest memory formed. */
export const LEAD_FACTS: ReadonlySet<TopicFact["kind"]> = new Set(["kinds", "span"]);

/** The panel's visible rows: every topic (its count beside how many the
 * graph has loaded); an unfolded one's facts (a static row: never focused
 * or selected), its paths most travelled (a static head, then one row per
 * path: focusable, it lights and frames its two memories), then its
 * memory types: the sub-panel's head (a fold, `opened` holds the row keys
 * of the unfolded heads and types), its types ("80 episodes"; each a fold
 * too), an unfolded type's memories of the fold, newest first — or, with
 * none loaded, the one sentence that says so (a static row). */
export function topicRows(
  communities: ServedCommunity[],
  expanded: ReadonlySet<string>,
  rowsOf: ReadonlyMap<string, string[]>,
  fold: FoldState,
  opts: { opened?: ReadonlySet<string>; groupsOf?: GroupsOf; nowMs?: number } = {},
): TopicRow[] {
  const nowMs = opts.nowMs ?? Date.now();
  const opened = opts.opened ?? new Set<string>();
  const groupsOf = opts.groupsOf ?? groupsCache();
  const out: TopicRow[] = [];
  const byKey = new Map(communities.map((c) => [c.key, c]));
  const rowOf = (gid: string): string => fold.graph_to_row.get(gid) ?? gid;
  const titleOf = (gid: string): string | null => {
    const node = fold.nodes.get(rowOf(gid));
    return node ? plainCardTitle(node) : null;
  };
  const topicTitleOf = (key: string): string | null => {
    const t = byKey.get(key);
    return t && !t.titlePending && t.title ? t.title : null;
  };
  for (const c of topicOrder(communities)) {
    const open = expanded.has(c.key);
    const nodes = (rowsOf.get(c.key) ?? []).map((r) => fold.nodes.get(r)).filter((n): n is NodeState => Boolean(n));
    const all = open ? topicFacts(c, titleOf, topicTitleOf, undefined, nowMs) : [];
    const lead = all.filter((f) => LEAD_FACTS.has(f.kind));
    out.push({ key: topicRowKey(c.key), entityId: c.key, depth: 0, expandable: true, expanded: open, textValue: topicTitle(c, TITLE_BEING_WRITTEN), data: { kind: "topic", c, loaded: nodes.length, lead } });
    if (!open) continue;
    const facts = all.filter((f) => !LEAD_FACTS.has(f.kind) && f.kind !== "paths");
    if (facts.length) {
      out.push({ key: factsRowKey(c.key), entityId: factsRowKey(c.key), parentKey: topicRowKey(c.key), depth: 1, expandable: false, selectable: false, textValue: factsText(facts), data: { kind: "facts", c, facts } });
    }
    const paths = all.find((f): f is Extract<TopicFact, { kind: "paths" }> => f.kind === "paths");
    if (paths) {
      out.push({ key: pathsHeadRowKey(c.key), entityId: pathsHeadRowKey(c.key), parentKey: topicRowKey(c.key), depth: 1, expandable: false, selectable: false, textValue: paths.text, data: { kind: "paths_head", c } });
      for (const p of paths.paths) {
        const key = pathRowKey(c.key, p);
        out.push({ key, entityId: key, parentKey: topicRowKey(c.key), depth: 1, expandable: false, textValue: pathText(p), data: { kind: "path", c, path: p, ids: [rowOf(p.from), rowOf(p.to)] } });
      }
    }
    if (nodes.length === 0) {
      const text = heldCount(c) > 0 ? UNLOADED_SENTENCE : EMPTY_TOPIC_SENTENCE;
      out.push({ key: unloadedRowKey(c.key), entityId: unloadedRowKey(c.key), parentKey: topicRowKey(c.key), depth: 1, expandable: false, selectable: false, textValue: text, data: { kind: "unloaded", c, text } });
      continue;
    }
    const typesKey = typesRowKey(c.key);
    const typesOpen = opened.has(typesKey);
    out.push({ key: typesKey, entityId: typesKey, parentKey: topicRowKey(c.key), depth: 1, expandable: true, expanded: typesOpen, textValue: MEMORY_TYPES_HEAD, data: { kind: "types", c } });
    if (!typesOpen) continue;
    for (const group of groupsOf(c, nodes)) {
      const groupKey = groupRowKey(c.key, group.memoryKind);
      const groupOpen = opened.has(groupKey);
      const words = kindCountWords(group.memoryKind, group.nodes.length);
      out.push({ key: groupKey, entityId: groupKey, parentKey: typesKey, depth: 2, expandable: true, expanded: groupOpen, textValue: words, data: { kind: "group", c, memoryKind: group.memoryKind, count: group.nodes.length, sample: group.nodes[0], ids: group.ids } });
      if (!groupOpen) continue;
      for (const node of group.nodes) {
        out.push({
          key: memberRowKey(c.key, node.id),
          entityId: node.id,
          parentKey: groupKey,
          depth: 3,
          expandable: false,
          textValue: plainCardTitle(node),
          data: { kind: "member", c, node, provisional: c.provisional.has(node.graph_id ?? node.id) },
        });
      }
    }
  }
  return out;
}

/** THE TOPIC HOVER (operator 2026-11-10, Entity backlog 0002): which topic
 * the panel lights on the graph. A mouse or pen resting on a topic's rows
 * (HOVER_INTENT_MS, hover_intent.ts: a sweep lights nothing), or the
 * keyboard on one (a focus the keyboard made: :focus-visible, never a
 * click's or a tap's), emits its key; a touch never does (a tap focuses).
 * Moving to another topic keeps the lit one until the new one has rested;
 * leaving the list (or the keyboard leaving it) emits null at once. */
export interface TopicHover {
  pointerOver(key: string | null, pointerType: string): void;
  pointerLeave(pointerType: string): void;
  focus(key: string | null): void;
  blur(stillInside: boolean): void;
  dispose(): void;
}

export function topicHover(emit: (key: string | null) => void, timers?: HoverIntentTimers): TopicHover {
  let shown: string | null = null;
  const show = (key: string | null) => {
    if (key === shown) return;
    shown = key;
    emit(key);
  };
  const intent = hoverIntent((key) => show(key), HOVER_INTENT_MS, timers);
  const letGo = () => {
    intent.cancel();
    show(null);
  };
  return {
    pointerOver(key, pointerType) {
      // Back on the lit topic, a pending other is forgotten (its rest re-emits
      // nothing); over a gap between rows, a pending one is forgotten too.
      if (pointerType === "touch") return;
      if (key === null) intent.cancel();
      else intent.over(key);
    },
    pointerLeave(pointerType) {
      if (pointerType !== "touch") letGo();
    },
    focus(key) {
      if (key === null) return;
      intent.over(key);
    },
    blur(stillInside) {
      if (!stillInside) letGo();
    },
    dispose: letGo,
  };
}

/** THE ROWS HOVER (Entity backlog 0015/0016): which of the panel's rows
 * that light memories of their own (a path, a memory type) the graph
 * lights. A mouse or pen resting on one (HOVER_INTENT_MS: a sweep lights
 * nothing), or the keyboard on one (:focus-visible), emits its row key;
 * moving to another such row keeps the lit one until the new one has
 * rested; moving onto any other row, or leaving the list, emits null at
 * once (the topic's own light comes back). A touch never hovers. */
export interface RowsHover {
  pointerOver(key: string | null, pointerType: string): void;
  pointerLeave(pointerType: string): void;
  /** A keyboard focus (:focus-visible) on a row: its key, null for a row
   * that lights nothing of its own. */
  focus(key: string | null): void;
  blur(stillInside: boolean): void;
  dispose(): void;
}

export function rowsHover(emit: (key: string | null) => void, timers?: HoverIntentTimers): RowsHover {
  let shown: string | null = null;
  const show = (key: string | null) => {
    if (key === shown) return;
    shown = key;
    emit(key);
  };
  const intent = hoverIntent((key) => show(key), HOVER_INTENT_MS, timers);
  const letGo = () => {
    intent.cancel();
    show(null);
  };
  const over = (key: string | null) => {
    if (key === null) letGo();
    else if (key === shown) intent.cancel();
    else intent.over(key);
  };
  return {
    pointerOver(key, pointerType) {
      if (pointerType !== "touch") over(key);
    },
    pointerLeave(pointerType) {
      if (pointerType !== "touch") letGo();
    },
    focus: over,
    blur(stillInside) {
      if (!stillInside) letGo();
    },
    dispose: letGo,
  };
}

/** The row whose memories the graph lights: the one the pointer (or the
 * keyboard) rests on, else the clicked one; null when neither is listed
 * (its topic folded, the version changed). */
export function shownRowKey(hovered: string | null, pinned: string | null, idsOf: ReadonlyMap<string, readonly string[]>): string | null {
  if (hovered !== null && idsOf.has(hovered)) return hovered;
  if (pinned !== null && idsOf.has(pinned)) return pinned;
  return null;
}

/** A click on a path: the clicked one again lets it go; another is kept lit
 * and framed. */
export function pathClick(pinned: string | null, clicked: string): { pinned: string | null; frame: boolean } {
  return pinned === clicked ? { pinned: null, frame: false } : { pinned: clicked, frame: true };
}

/** The style that tints a row with its topic's card colour (topics_panel.css
 * .gc_tp_card): the topic's circle colour, as a custom property. */
export function cardStyle(color: string): React.CSSProperties {
  return { ["--gc-tp-color" as string]: color } as React.CSSProperties;
}

/** The topic a panel row belongs to (its content's data-tkey), from any
 * element inside the row. */
function rowTopicKey(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const row = target.closest(".af-disclosure__row");
  return row?.querySelector("[data-tkey]")?.getAttribute("data-tkey") ?? null;
}

/** The row key of a row that lights memories of its own (its content's
 * data-rows), from any element inside the row; null for any other row. */
function rowLitKey(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const row = target.closest(".af-disclosure__row");
  return row?.querySelector("[data-rows]")?.getAttribute("data-rows") ?? null;
}

export interface TopicsPanelProps {
  view: TopicsView;
  fold: FoldState;
  /** Community key -> its rows in the fold (communities.membershipOf). */
  rowsOf: ReadonlyMap<string, string[]>;
  /** Memories of the fold the version does not list. */
  waiting: number;
  /** The focused topic's key. */
  focused: string | null;
  open: boolean;
  onToggle(open: boolean): void;
  onFocus(key: string | null): void;
  onOpenMember(node: NodeState): void;
  /** The topic the panel lights on the graph (topicHover), null to let go. */
  onHoverTopic?(key: string | null): void;
  /** Light exactly these nodes on the canvas (a path's two memories, a
   * memory type's memories in a topic); null lets go (the topic hover, if
   * any, lights again). The ids are the canvas's node ids: NodeState.id,
   * the fold's rows as `rowsOf` lists them (a served record id is resolved
   * through fold.graph_to_row before it is handed here). */
  onHoverRows: (ids: string[] | null) => void;
  /** The camera glides to frame these nodes (the same ids as onHoverRows). */
  onFrameRows: (ids: string[]) => void;
  onRetry(): void;
  /** The memory's kind colour (the graph's). */
  colorOf(node: NodeState): string;
}

/** THE PANEL'S OWN LIGHTS (Entity backlog 0015/0016; review 2026-11-10 F2):
 * one controller for the rows that light memories of their own (a path, a
 * memory type). The panel feeds it the DOM's pointer and keyboard targets
 * (rowLitKey: the row's data-rows), its visible rows, a path's click and a
 * fold that opens; the tests drive the same calls. It lights the rested row
 * (rowsHover), else the clicked path (pathClick): those memories go to
 * onHoverRows once per change (never per render, never twice), null when
 * nothing is lit; a click frames them (onFrameRows). A row that rests (or
 * is clicked) without memories of its own is a broken seam: said loudly
 * (#SEAM), never a silent nothing. A fold that opened is revealed once its
 * rows are in: its row and what it lists, down to its last row. */
export interface PanelLightsHost {
  onHoverRows(ids: string[] | null): void;
  onFrameRows(ids: string[]): void;
  /** The row whose memories are lit (its line unfolds); null for none. */
  onShown(key: string | null): void;
  /** Scroll the panel so the unfolded row `first` and its rows down to `last` show. */
  reveal(first: string, last: string): void;
}

export interface PanelLights {
  /** The visible rows (topicRows), after each render that changed them. */
  setRows(rows: readonly TopicRow[]): void;
  pointerOver(target: EventTarget | null, pointerType: string): void;
  pointerLeave(pointerType: string): void;
  /** A keyboard focus (:focus-visible) on `target`. */
  focus(target: EventTarget | null): void;
  blur(stillInside: boolean): void;
  clickPath(rowKey: string): void;
  /** A fold (the memory types, a type) opens: it is revealed once its rows are in. */
  opening(rowKey: string): void;
  /** The clicked path lets go (another topic focused, or none). */
  unpin(): void;
  /** Nothing the pointer lit stays lit; nor the clicked path, unless `keepPin`. */
  release(keepPin?: boolean): void;
}

const sameIds = (a: readonly string[] | null, b: readonly string[] | null) => a === b || (a !== null && b !== null && a.length === b.length && a.every((id, i) => id === b[i]));

export function panelLights(host: PanelLightsHost, timers?: HoverIntentTimers): PanelLights {
  let idsOf = new Map<string, readonly string[]>();
  let hovered: string | null = null;
  let pinned: string | null = null;
  let shown: string | null = null;
  let emitted: readonly string[] | null = null;
  let revealing: string | null = null;
  const seam = (what: string, key: string) => console.error(`#SEAM TopicsPanel: the ${what} row ${key} lights no memories (its data-rows names no listed path or memory type)`);
  const update = () => {
    const key = shownRowKey(hovered, pinned, idsOf);
    if (key !== shown) {
      shown = key;
      host.onShown(key);
    }
    const ids = key === null ? null : idsOf.get(key)!;
    if (sameIds(emitted, ids)) return;
    emitted = ids;
    host.onHoverRows(ids === null ? null : [...ids]);
  };
  const hover = rowsHover((key) => {
    if (key !== null && !idsOf.has(key)) seam("rested", key);
    hovered = key;
    update();
  }, timers);
  return {
    setRows(rows) {
      idsOf = new Map();
      for (const r of rows) if (r.data?.kind === "path" || r.data?.kind === "group") idsOf.set(r.key, r.data.ids);
      if (pinned !== null && !idsOf.has(pinned)) pinned = null;
      update();
      const key = revealing;
      revealing = null;
      const at = key === null ? -1 : rows.findIndex((r) => r.key === key);
      if (at < 0) return;
      let last = at;
      while (last + 1 < rows.length && rows[last + 1].depth > rows[at].depth) last += 1;
      host.reveal(rows[at].key, rows[last].key);
    },
    pointerOver: (target, pointerType) => hover.pointerOver(rowLitKey(target), pointerType),
    pointerLeave: (pointerType) => hover.pointerLeave(pointerType),
    focus: (target) => hover.focus(rowLitKey(target)),
    blur: (stillInside) => hover.blur(stillInside),
    clickPath(key) {
      const ids = idsOf.get(key);
      if (!ids) return seam("clicked", key);
      const next = pathClick(pinned, key);
      pinned = next.pinned;
      update();
      if (next.frame) host.onFrameRows([...ids]);
    },
    opening(key) {
      revealing = key;
    },
    unpin() {
      pinned = null;
      update();
    },
    release(keepPin = false) {
      hover.dispose();
      if (!keepPin) pinned = null;
      update();
    },
  };
}

/** Where the panel scrolls (its body's scrollTop) to reveal an unfolded
 * row and what it lists: nowhere when all of it shows; else as much of it
 * as fits, the row itself never above the top. Rectangles in viewport px. */
export function revealScrollTop(body: { top: number; scrollTop: number; height: number }, first: { top: number }, last: { bottom: number }): number | null {
  const start = first.top - body.top + body.scrollTop;
  const end = last.bottom - body.top + body.scrollTop;
  if (start >= body.scrollTop && end <= body.scrollTop + body.height) return null;
  return Math.max(0, Math.min(start, end - body.height));
}

/** The panel's body scrolled to reveal rows `first`..`last` (their content's
 * data-row), inside the body only (never the page). */
function revealRows(body: HTMLElement | null, first: string, last: string): void {
  if (!body) return;
  const rowEl = (key: string) => [...body.querySelectorAll("[data-row]")].find((el) => el.getAttribute("data-row") === key)?.closest(".af-disclosure__row") ?? null;
  const a = rowEl(first);
  const b = rowEl(last);
  if (!a || !b) {
    console.error(`#SEAM TopicsPanel: an unfolded row is not in the list (${a ? last : first})`);
    return;
  }
  const box = body.getBoundingClientRect();
  const top = revealScrollTop({ top: box.top, scrollTop: body.scrollTop, height: body.clientHeight }, a.getBoundingClientRect(), b.getBoundingClientRect());
  if (top !== null) body.scrollTop = top;
}

/** The phone layout: the viewport graph_canvas.narrowViewport calls narrow
 * (where a topic picked in the panel folds it; the same query, pinned by the
 * test). */
export const PHONE_LAYOUT_QUERY = "(max-width: 599.98px)";
function phoneLayout(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(PHONE_LAYOUT_QUERY).matches;
}

/** What a click (Enter, Space) on a topic's own row does: an unfolded card
 * folds back to the card it was (the focus kept); a folded one unfolds —
 * focused (the graph frames it) when it is not yet. */
export function topicClick(key: string, expanded: ReadonlySet<string>, focused: string | null): "fold" | "unfold" | "focus" {
  if (expanded.has(key)) return "fold";
  return focused === key ? "unfold" : "focus";
}

/** The topic whose own row `target` is (the row itself, as the keyboard
 * focuses it), else null. */
export function topicRowOf(target: EventTarget | null): string | null {
  if (!(target instanceof Element) || target.closest(".af-disclosure__row") !== target) return null;
  return target.querySelector("[data-topic]")?.getAttribute("data-topic") ?? null;
}

/** What a row's content needs from the panel. */
export interface RowContext {
  focused: string | null;
  /** The row whose memories are lit (panelLights.onShown). */
  shownRow: string | null;
  cardOf: ReadonlyMap<string, React.CSSProperties>;
  colorOf(node: NodeState): string;
  /** A click on a topic's own row (topicClick). */
  clickTopic(key: string): void;
  clickPath(rowKey: string): void;
  toggleOpen(rowKey: string): void;
  openMember(node: NodeState): void;
}

/** A row's content (the kit's DisclosureList renders the row around it). */
export function renderTopicRow(row: TopicRow, ctx: RowContext): React.ReactNode {
  const { focused, shownRow, cardOf, colorOf } = ctx;
  const d = row.data!;
  if (d.kind === "topic") {
    const c = d.c;
    const summary = topicSummary(c);
    return (
      // Folded, a focused topic is the card it was before its click (its summary cut).
      <span className={`gc_tp_topic gc_tp_card${focused === c.key && row.expanded ? " gc_tp_focused" : ""}`} style={cardOf.get(c.key)} data-topic={c.key} data-tkey={c.key} onClick={() => ctx.clickTopic(c.key)}>
        <span className={`gc_tp_title${c.titlePending ? " gc_tp_pending" : ""}`}>{row.textValue}</span>
        <AfChip size="sm" tone="muted" className="gc_tp_count">
          {topicCountWords(heldCount(c), d.loaded)}
        </AfChip>
        {d.lead.map((f) => (
          <span key={f.kind} className={`gc_tp_lead gc_tp_lead_${f.kind}`}>
            {f.text}
          </span>
        ))}
        {summary ? <span className={`gc_tp_summary${c.summaryPending ? " gc_tp_pending" : ""}`}>{summary}</span> : null}
        {c.verdict ? <span className="gc_tp_verdict">{VERDICT_SENTENCE[c.verdict]}</span> : null}
      </span>
    );
  }
  if (d.kind === "facts") {
    return (
      <span className="gc_tp_facts gc_tp_card" style={cardOf.get(d.c.key)} data-facts={d.c.key} data-tkey={d.c.key}>
        {d.facts.map((f) => (
          <span key={f.kind} className={`gc_tp_fact gc_tp_fact_${f.kind}`}>
            {f.text}
          </span>
        ))}
      </span>
    );
  }
  if (d.kind === "paths_head") {
    return (
      <span className="gc_tp_paths_head gc_tp_card" style={cardOf.get(d.c.key)} data-tkey={d.c.key}>
        {row.textValue}
      </span>
    );
  }
  if (d.kind === "path") {
    // One line, each title cut on its own; the whole pair once lit.
    const lit = shownRow === row.key;
    return (
      <span className={`gc_tp_path gc_tp_card${lit ? " gc_tp_path_lit" : ""}`} style={cardOf.get(d.c.key)} data-path={row.key} data-rows={row.key} data-tkey={d.c.key} onClick={() => ctx.clickPath(row.key)}>
        <span className="gc_tp_path_end">{d.path.a}</span>
        <span className="gc_tp_path_sep">↔</span>
        <span className="gc_tp_path_end">{d.path.b}</span>
        <span className="gc_tp_path_count">({d.path.count})</span>
      </span>
    );
  }
  if (d.kind === "types") {
    return (
      <span className="gc_tp_types_head gc_tp_card" style={cardOf.get(d.c.key)} data-types={d.c.key} data-tkey={d.c.key} data-row={row.key} onClick={() => ctx.toggleOpen(row.key)}>
        {row.textValue}
      </span>
    );
  }
  if (d.kind === "group") {
    return (
      <span className="gc_tp_group gc_tp_card" style={cardOf.get(d.c.key)} data-group={d.memoryKind} data-rows={row.key} data-tkey={d.c.key} data-row={row.key} onClick={() => ctx.toggleOpen(row.key)}>
        <i className="gc_tp_kdot" style={{ background: colorOf(d.sample) }} aria-hidden="true" />
        {row.textValue}
      </span>
    );
  }
  if (d.kind === "unloaded") {
    return (
      <span data-tkey={d.c.key} className="gc_tp_unloaded gc_tp_card" style={cardOf.get(d.c.key)} data-unloaded={d.c.key}>
        {d.text}
      </span>
    );
  }
  return (
    <span className="gc_tp_member gc_tp_card" style={cardOf.get(d.c.key)} data-member={d.node.id} data-tkey={d.c.key} data-row={row.key} onClick={() => ctx.openMember(d.node)}>
      <i className="gc_tp_kdot" style={{ background: colorOf(d.node) }} aria-hidden="true" />
      <span className="gc_tp_mtitle">{row.textValue}</span>
      {d.provisional ? (
        <AfChip size="sm" tone="warning" className="gc_tp_provisional">
          {PROVISIONAL_BADGE}
        </AfChip>
      ) : null}
    </span>
  );
}

export function TopicsPanel({ view, fold, rowsOf, waiting, focused, open, onToggle, onFocus, onOpenMember, onHoverTopic, onHoverRows, onFrameRows, onRetry, colorOf }: TopicsPanelProps): React.ReactElement {
  const bodyId = useId();
  const onHoverRef = useRef(onHoverTopic);
  onHoverRef.current = onHoverTopic;
  const host = useRef({ onHoverRows, onFrameRows, onToggle });
  host.current = { onHoverRows, onFrameRows, onToggle };
  const hover = useMemo(() => topicHover((key) => onHoverRef.current?.(key)), []);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // The row (a path, a type) whose memories are lit: its line unfolds.
  const [shownRow, setShownRow] = useState<string | null>(null);
  // A path framed by a tap on the phone layout folds the panel (it covered
  // the frame) and keeps the pair lit; any other fold lets it go.
  const foldedToFrame = useRef(false);
  const lights = useMemo(
    () =>
      panelLights({
        onHoverRows: (ids) => host.current.onHoverRows(ids),
        onFrameRows: (ids) => {
          host.current.onFrameRows(ids);
          if (phoneLayout()) {
            foldedToFrame.current = true;
            host.current.onToggle(false);
          }
        },
        onShown: setShownRow,
        reveal: (first, last) => revealRows(bodyRef.current, first, last),
      }),
    [],
  );
  // Unmounted (the panel goes, topics off) or folded: nothing stays lit.
  useEffect(() => () => hover.dispose(), [hover]);
  useEffect(() => () => lights.release(), [lights]);
  useEffect(() => {
    if (open) return;
    hover.dispose();
    lights.release(foldedToFrame.current);
    foldedToFrame.current = false;
  }, [open, hover, lights]);
  // Another topic focused (or none): the clicked path lets go.
  useEffect(() => lights.unpin(), [focused, lights]);
  const listRef = useRef<DisclosureListHandle | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(focused ? [focused] : []));
  const [selection, setSelection] = useState<DisclosureSelection | null>(null);
  // A topic focused (here, or by its title on the graph) unfolds and is marked.
  useEffect(() => {
    if (!focused) return;
    setExpanded((prev) => (prev.has(focused) ? prev : new Set([...prev, focused])));
    setSelection({ entityId: focused, rowKey: topicRowKey(focused) });
    const t = window.setTimeout(() => listRef.current?.scrollToRow(topicRowKey(focused), "nearest"), 60);
    return () => window.clearTimeout(t);
  }, [focused]);
  const communities = view.kind === "read" && view.read.kind === "served" ? view.read.data.communities : null;
  // The unfolded memory-types heads and types (row keys): folded by default.
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const groupsOf = useMemo(() => groupsCache(), [communities, rowsOf, fold]);
  const rows = useMemo(() => (communities ? topicRows(communities, expanded, rowsOf, fold, { opened, groupsOf }) : []), [communities, expanded, rowsOf, fold, opened, groupsOf]);
  // The lights see the rows they light (and reveal a fold that just opened).
  useEffect(() => lights.setRows(rows), [lights, rows]);
  // One card style per topic, per payload version (never per row or render).
  const cardOf = useMemo(() => new Map((communities ?? []).map((c) => [c.key, cardStyle(topicColor(c.key))])), [communities]);

  const note = topicsNote(view);
  if (note || !communities) {
    return (
      <div className={`gc_topics gc_topics_note${note?.error ? " gc_topics_error" : ""}`} role="status">
        {note?.text}
        {view.kind === "error" ? (
          <button type="button" className="gc_topic_retry" onClick={onRetry}>
            retry
          </button>
        ) : null}
      </div>
    );
  }

  const pending = communities.filter((c) => c.titlePending).length;
  const toggleRow = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const clickTopic = (key: string) => {
    if (topicClick(key, expanded, focused) === "focus") onFocus(key);
    else toggleRow(key);
  };
  const toggleOpen = (rowKey: string) => {
    if (!opened.has(rowKey)) lights.opening(rowKey);
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };
  const ctx: RowContext = { focused, shownRow, cardOf, colorOf, clickTopic, clickPath: lights.clickPath, toggleOpen, openMember: onOpenMember };
  const waitingWords = waitingLine(waiting);
  return (
    <section className={`gc_topics${open ? " gc_tp_open" : ""}`} aria-label="His topics">
      <button type="button" className="gc_tp_head" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(!open)}>
        <span className="gc_tp_head_word">Topics</span>
        <span className="gc_tp_head_count">{communities.length}</span>
        {pending > 0 ? <span className="gc_tp_head_pending">{pending} being written</span> : null}
      </button>
      <div
        ref={bodyRef}
        className="gc_tp_body"
        id={bodyId}
        hidden={!open}
        onPointerOver={(e) => {
          hover.pointerOver(rowTopicKey(e.target), e.pointerType);
          lights.pointerOver(e.target, e.pointerType);
        }}
        onPointerLeave={(e) => {
          hover.pointerLeave(e.pointerType);
          lights.pointerLeave(e.pointerType);
        }}
        onFocus={(e) => {
          const keyboard = e.target instanceof Element && e.target.matches(":focus-visible");
          hover.focus(keyboard ? rowTopicKey(e.target) : null);
          if (keyboard) lights.focus(e.target);
        }}
        onBlur={(e) => {
          const stillInside = e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget);
          hover.blur(stillInside);
          lights.blur(stillInside);
        }}
        onKeyDown={(e) => {
          // Space on a topic's row folds or unfolds it, as Enter does (the kit's Space only selects).
          const key = e.key === " " ? topicRowOf(e.target) : null;
          if (key !== null) clickTopic(key);
        }}
      >
        <DisclosureList<TopicRowData>
          ref={listRef}
          className="gc_tp_list"
          ariaLabel="His topics and their memories"
          rows={rows}
          selection={selection}
          onSelect={setSelection}
          onToggleExpand={(_key, row) => {
            if (row.data?.kind === "topic") toggleRow(row.data.c.key);
            else if (row.data?.kind === "types" || row.data?.kind === "group") toggleOpen(row.key);
          }}
          onActivate={(_sel, row) => {
            const d = row.data;
            if (!d) return;
            if (d.kind === "topic") clickTopic(d.c.key);
            else if (d.kind === "path") lights.clickPath(row.key);
            else if (d.kind === "types" || d.kind === "group") toggleOpen(row.key);
            else if (d.kind === "member") onOpenMember(d.node);
          }}
          renderRow={(row) => renderTopicRow(row as TopicRow, ctx)}
          scrollOnSelect={false}
        />
        {waitingWords ? <p className="gc_tp_waiting">{waitingWords}</p> : null}
      </div>
    </section>
  );
}

/** A member opens where the graph opens it: a diary entry in the Book (no
 * read), anything else in Detail. */
export function memberOpensIn(node: NodeState): "book" | "detail" {
  return isDiaryNode(node) ? "book" : "detail";
}

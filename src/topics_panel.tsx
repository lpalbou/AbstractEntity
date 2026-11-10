/**
 * THE TOPICS PANEL (memory-owned communities, COMMUNITIES-DESIGN 2026-11-10
 * §4): the drill-down over the graph. Topic -> its members -> the memory.
 *
 * - Each topic (the kit's DisclosureList, one row per community, biggest
 *   first): its authored title, its summary and how many memories it holds;
 *   "title being written…" / "summary being written…" while memory says so,
 *   never a label the app made. The count is memory's (its size plus the
 *   memories placed since) and, when the graph has loaded a different
 *   number of them, that number too ("28 memories · 0 loaded in this
 *   view") — the length of the list it unfolds. A focused topic none of
 *   whose memories the graph has loaded says so in one sentence ("Its
 *   memories are outside the loaded window."), never an empty list.
 * - A click on a topic FOCUSES it: the graph frames its circle and lights
 *   its memories, and the topic unfolds to list them by memory type: one
 *   line per type with how many of that type the graph has loaded ("80
 *   episodes"), then those memories (titles, newest first) — open by
 *   default, never behind a fold.
 *   A click on the focused topic lets it go.
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
  | { kind: "paths"; text: string; paths: { a: string; b: string; count: number }[] };

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
  const paths: { a: string; b: string; count: number }[] = [];
  for (const p of f.paths ?? []) {
    const a = titleOf(p.from);
    const b = titleOf(p.to);
    if (a && b) paths.push({ a, b, count: p.count });
  }
  if (paths.length) out.push({ kind: "paths", text: PATHS_HEAD, paths });
  if (c.centroidStale) out.push({ kind: "stale", text: CENTROID_STALE_NOTE });
  return out;
}

/** The facts as one line of text (the row's accessible text). */
export function factsText(facts: TopicFact[]): string {
  return facts.map((f) => (f.kind === "paths" ? `${f.text}: ${f.paths.map((p) => `${p.a} ↔ ${p.b} (${p.count})`).join("; ")}` : f.text)).join(". ");
}

/** Topics biggest first (the count each row says; ties by key: stable). */
export function topicOrder(communities: ServedCommunity[]): ServedCommunity[] {
  return [...communities].sort((a, b) => heldCount(b) - heldCount(a) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

type TopicRowData =
  | { kind: "topic"; c: ServedCommunity; loaded: number; lead: TopicFact[] }
  | { kind: "facts"; c: ServedCommunity; facts: TopicFact[] }
  | { kind: "group"; c: ServedCommunity; memoryKind: string; count: number; sample: NodeState }
  | { kind: "unloaded"; c: ServedCommunity; text: string }
  | { kind: "member"; c: ServedCommunity; node: NodeState; provisional: boolean };
type TopicRow = DisclosureRow<TopicRowData>;

export const topicRowKey = (key: string) => `topic:${key}`;
export const memberRowKey = (key: string, row: string) => `member:${key}:${row}`;
export const factsRowKey = (key: string) => `facts:${key}`;
export const unloadedRowKey = (key: string) => `unloaded:${key}`;
export const groupRowKey = (key: string, memoryKind: string) => `group:${key}:${memoryKind}`;

/** A topic's loaded memories by type: memory's order of its types (most
 * first), then any other type loaded (most first, ties by name); newest
 * first inside a type. */
export function memberGroups(c: Pick<ServedCommunity, "kinds">, nodes: NodeState[]): Array<{ memoryKind: string; nodes: NodeState[] }> {
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
  return order.map((memoryKind) => ({
    memoryKind,
    nodes: byKind.get(memoryKind)!.sort((a, b) => b.first_seq - a.first_seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  }));
}

/** The facts an unfolded topic says in its own row, under its title and
 * before its summary (visible the moment it unfolds, never below a long
 * summary): what it holds by type and when its newest memory formed. */
export const LEAD_FACTS: ReadonlySet<TopicFact["kind"]> = new Set(["kinds", "span"]);

/** The panel's visible rows: every topic (its count beside how many the
 * graph has loaded); an unfolded one's facts (a static row: never focused
 * or selected) then its members by type — a static line per type ("80
 * episodes"), then those memories of the fold, newest first — or, with
 * none loaded, the one sentence that says so (a static row). */
export function topicRows(communities: ServedCommunity[], expanded: ReadonlySet<string>, rowsOf: ReadonlyMap<string, string[]>, fold: FoldState, nowMs: number = Date.now()): TopicRow[] {
  const out: TopicRow[] = [];
  const byKey = new Map(communities.map((c) => [c.key, c]));
  const titleOf = (gid: string): string | null => {
    const node = fold.nodes.get(fold.graph_to_row.get(gid) ?? gid);
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
    const facts = all.filter((f) => !LEAD_FACTS.has(f.kind));
    if (facts.length) {
      out.push({ key: factsRowKey(c.key), entityId: factsRowKey(c.key), parentKey: topicRowKey(c.key), depth: 1, expandable: false, selectable: false, textValue: factsText(facts), data: { kind: "facts", c, facts } });
    }
    if (nodes.length === 0) {
      const text = heldCount(c) > 0 ? UNLOADED_SENTENCE : EMPTY_TOPIC_SENTENCE;
      out.push({ key: unloadedRowKey(c.key), entityId: unloadedRowKey(c.key), parentKey: topicRowKey(c.key), depth: 1, expandable: false, selectable: false, textValue: text, data: { kind: "unloaded", c, text } });
      continue;
    }
    for (const group of memberGroups(c, nodes)) {
      const words = kindCountWords(group.memoryKind, group.nodes.length);
      out.push({ key: groupRowKey(c.key, group.memoryKind), entityId: groupRowKey(c.key, group.memoryKind), parentKey: topicRowKey(c.key), depth: 1, expandable: false, selectable: false, textValue: words, data: { kind: "group", c, memoryKind: group.memoryKind, count: group.nodes.length, sample: group.nodes[0] } });
      for (const node of group.nodes) {
        out.push({
          key: memberRowKey(c.key, node.id),
          entityId: node.id,
          parentKey: topicRowKey(c.key),
          depth: 1,
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

/** The topic a panel row belongs to (its content's data-tkey), from any
 * element inside the row. */
function rowTopicKey(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const row = target.closest(".af-disclosure__row");
  return row?.querySelector("[data-tkey]")?.getAttribute("data-tkey") ?? null;
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
  /** Light exactly these graph node ids on the canvas (a path, a memory
   * type's memories); null lets go (the topic hover, if any, lights again). */
  onHoverRows: (ids: string[] | null) => void;
  /** The camera glides to frame these graph node ids. */
  onFrameRows: (ids: string[]) => void;
  onRetry(): void;
  /** The memory's kind colour (the graph's). */
  colorOf(node: NodeState): string;
}

export function TopicsPanel({ view, fold, rowsOf, waiting, focused, open, onToggle, onFocus, onOpenMember, onHoverTopic, onRetry, colorOf }: TopicsPanelProps): React.ReactElement {
  const bodyId = useId();
  const onHoverRef = useRef(onHoverTopic);
  onHoverRef.current = onHoverTopic;
  const hover = useMemo(() => topicHover((key) => onHoverRef.current?.(key)), []);
  // Unmounted (the panel goes, topics off) or folded: nothing stays lit.
  useEffect(() => () => hover.dispose(), [hover]);
  useEffect(() => {
    if (!open) hover.dispose();
  }, [open, hover]);
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
  const rows = useMemo(() => (communities ? topicRows(communities, expanded, rowsOf, fold) : []), [communities, expanded, rowsOf, fold]);

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
  const focus = (key: string) => onFocus(focused === key ? null : key);
  const renderRow = (row: TopicRow): React.ReactNode => {
    const d = row.data!;
    if (d.kind === "topic") {
      const c = d.c;
      const summary = topicSummary(c);
      return (
        <span className={`gc_tp_topic${focused === c.key ? " gc_tp_focused" : ""}`} data-topic={c.key} data-tkey={c.key} onClick={() => focus(c.key)}>
          <i className="gc_tp_dot" style={{ background: topicColor(c.key) }} aria-hidden="true" />
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
        <span className="gc_tp_facts" data-facts={d.c.key} data-tkey={d.c.key}>
          {d.facts.map((f) =>
            f.kind === "paths" ? (
              <span key={f.kind} className="gc_tp_fact gc_tp_fact_paths">
                <span className="gc_tp_paths_head">{f.text}</span>
                {f.paths.map((p, i) => (
                  <span key={i} className="gc_tp_path">
                    <span className="gc_tp_path_end">{p.a}</span>
                    <span className="gc_tp_path_sep">↔</span>
                    <span className="gc_tp_path_end">{p.b}</span>
                    <span className="gc_tp_path_count">({p.count})</span>
                  </span>
                ))}
              </span>
            ) : (
              <span key={f.kind} className={`gc_tp_fact gc_tp_fact_${f.kind}`}>
                {f.text}
              </span>
            ),
          )}
        </span>
      );
    }
    if (d.kind === "group") {
      return (
        <span className="gc_tp_group" data-group={d.memoryKind} data-tkey={d.c.key}>
          <i className="gc_tp_kdot" style={{ background: colorOf(d.sample) }} aria-hidden="true" />
          {row.textValue}
        </span>
      );
    }
    if (d.kind === "unloaded") {
      return (
        <span data-tkey={d.c.key} className="gc_tp_unloaded" data-unloaded={d.c.key}>
          {d.text}
        </span>
      );
    }
    return (
      <span className="gc_tp_member" data-member={d.node.id} data-tkey={d.c.key} onClick={() => onOpenMember(d.node)}>
        <i className="gc_tp_kdot" style={{ background: colorOf(d.node) }} aria-hidden="true" />
        <span className="gc_tp_mtitle">{row.textValue}</span>
        {d.provisional ? (
          <AfChip size="sm" tone="warning" className="gc_tp_provisional">
            {PROVISIONAL_BADGE}
          </AfChip>
        ) : null}
      </span>
    );
  };
  const waitingWords = waitingLine(waiting);
  return (
    <section className={`gc_topics${open ? " gc_tp_open" : ""}`} aria-label="His topics">
      <button type="button" className="gc_tp_head" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(!open)}>
        <span className="gc_tp_head_word">Topics</span>
        <span className="gc_tp_head_count">{communities.length}</span>
        {pending > 0 ? <span className="gc_tp_head_pending">{pending} being written</span> : null}
      </button>
      <div
        className="gc_tp_body"
        id={bodyId}
        hidden={!open}
        onPointerOver={(e) => hover.pointerOver(rowTopicKey(e.target), e.pointerType)}
        onPointerLeave={(e) => hover.pointerLeave(e.pointerType)}
        onFocus={(e) => hover.focus(e.target instanceof Element && e.target.matches(":focus-visible") ? rowTopicKey(e.target) : null)}
        onBlur={(e) => hover.blur(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))}
      >
        <DisclosureList<TopicRowData>
          ref={listRef}
          className="gc_tp_list"
          ariaLabel="His topics and their memories"
          rows={rows}
          selection={selection}
          onSelect={setSelection}
          onToggleExpand={(_key, row) => row.data?.kind === "topic" && toggleRow(row.data.c.key)}
          onActivate={(_sel, row) => {
            const d = row.data;
            if (!d) return;
            if (d.kind === "topic") focus(d.c.key);
            else if (d.kind === "member") onOpenMember(d.node);
          }}
          renderRow={(row) => renderRow(row as TopicRow)}
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

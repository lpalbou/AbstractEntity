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
 *   its memories, and the topic unfolds to list them (titles, newest first).
 *   A click on the focused topic lets it go.
 * - A click on a member opens it (Detail; a diary entry shows in the Book —
 *   the graph's rule). A member placed since his last sleep carries the
 *   badge "placed until his next sleep".
 * - The topic view (unfolded) says what memory counts of it (`facts`), in
 *   words: when its memories were formed, how much it was used this week,
 *   its most used memory, its bridges to other topics, what his last sleep
 *   changed, the pairs of memories most used together; and, when its
 *   centroid is stale, that its placement may be. Memories and topics are
 *   named by their titles (the graph's nodes, the served topics) — a fact
 *   naming one the graph does not hold is not said, never an id.
 * - His author's verdict "no common subject" is said under the summary.
 * - Not served: ONE sentence instead of the list — his first sleep has not
 *   formed topics yet, or this gateway serves the old shape.
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

export type TopicFact =
  | { kind: "span" | "activity" | "hub" | "bridges" | "changed" | "stale"; text: string }
  | { kind: "paths"; text: string; paths: { a: string; b: string; count: number }[] };

/** What memory counts of a topic, in words. `titleOf` names a member record
 * (its graph id) by the graph's node, null when the graph does not hold it;
 * `topicTitleOf` names another topic by its key, null when not served or
 * its title is not written. Nothing is said for an absent fact, an empty
 * one, or one that would have to show an id. */
export function topicFacts(c: ServedCommunity, titleOf: (graphId: string) => string | null, topicTitleOf: (key: string) => string | null, timeZone?: string): TopicFact[] {
  const f = c.facts;
  const out: TopicFact[] = [];
  const first = f.span?.first ?? null;
  const last = f.span?.last ?? null;
  if (first) {
    const a = dayWords(first, timeZone);
    const b = last ? dayWords(last, timeZone) : a;
    out.push({ kind: "span", text: b === a ? `since ${a}` : `since ${a} · last ${b}` });
  }
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
  | { kind: "topic"; c: ServedCommunity; loaded: number }
  | { kind: "facts"; c: ServedCommunity; facts: TopicFact[] }
  | { kind: "unloaded"; c: ServedCommunity; text: string }
  | { kind: "member"; c: ServedCommunity; node: NodeState; provisional: boolean };
type TopicRow = DisclosureRow<TopicRowData>;

export const topicRowKey = (key: string) => `topic:${key}`;
export const memberRowKey = (key: string, row: string) => `member:${key}:${row}`;
export const factsRowKey = (key: string) => `facts:${key}`;
export const unloadedRowKey = (key: string) => `unloaded:${key}`;

/** The panel's visible rows: every topic (its count beside how many the
 * graph has loaded); an unfolded one's facts (a static row: never focused
 * or selected) then its members (the memories of the fold, newest first) —
 * or, with none loaded, the one sentence that says so (a static row). */
export function topicRows(communities: ServedCommunity[], expanded: ReadonlySet<string>, rowsOf: ReadonlyMap<string, string[]>, fold: FoldState): TopicRow[] {
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
    out.push({ key: topicRowKey(c.key), entityId: c.key, depth: 0, expandable: true, expanded: open, textValue: topicTitle(c, TITLE_BEING_WRITTEN), data: { kind: "topic", c, loaded: nodes.length } });
    if (!open) continue;
    const facts = topicFacts(c, titleOf, topicTitleOf);
    if (facts.length) {
      out.push({ key: factsRowKey(c.key), entityId: factsRowKey(c.key), parentKey: topicRowKey(c.key), depth: 1, expandable: false, selectable: false, textValue: factsText(facts), data: { kind: "facts", c, facts } });
    }
    if (nodes.length === 0) {
      const text = heldCount(c) > 0 ? UNLOADED_SENTENCE : EMPTY_TOPIC_SENTENCE;
      out.push({ key: unloadedRowKey(c.key), entityId: unloadedRowKey(c.key), parentKey: topicRowKey(c.key), depth: 1, expandable: false, selectable: false, textValue: text, data: { kind: "unloaded", c, text } });
      continue;
    }
    nodes.sort((a, b) => b.first_seq - a.first_seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const node of nodes) {
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
  return out;
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
  onRetry(): void;
  /** The memory's kind colour (the graph's). */
  colorOf(node: NodeState): string;
}

export function TopicsPanel({ view, fold, rowsOf, waiting, focused, open, onToggle, onFocus, onOpenMember, onRetry, colorOf }: TopicsPanelProps): React.ReactElement {
  const bodyId = useId();
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
        <span className={`gc_tp_topic${focused === c.key ? " gc_tp_focused" : ""}`} data-topic={c.key} onClick={() => focus(c.key)}>
          <i className="gc_tp_dot" style={{ background: topicColor(c.key) }} aria-hidden="true" />
          <span className={`gc_tp_title${c.titlePending ? " gc_tp_pending" : ""}`}>{row.textValue}</span>
          <AfChip size="sm" tone="muted" className="gc_tp_count">
            {topicCountWords(heldCount(c), d.loaded)}
          </AfChip>
          {summary ? <span className={`gc_tp_summary${c.summaryPending ? " gc_tp_pending" : ""}`}>{summary}</span> : null}
          {c.verdict ? <span className="gc_tp_verdict">{VERDICT_SENTENCE[c.verdict]}</span> : null}
        </span>
      );
    }
    if (d.kind === "facts") {
      return (
        <span className="gc_tp_facts" data-facts={d.c.key}>
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
    if (d.kind === "unloaded") {
      return (
        <span className="gc_tp_unloaded" data-unloaded={d.c.key}>
          {d.text}
        </span>
      );
    }
    return (
      <span className="gc_tp_member" data-member={d.node.id} onClick={() => onOpenMember(d.node)}>
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
      <div className="gc_tp_body" id={bodyId} hidden={!open}>
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

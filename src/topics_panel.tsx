/**
 * THE TOPICS PANEL (memory-owned communities, COMMUNITIES-DESIGN 2026-11-10
 * §4): the drill-down over the graph. Topic -> its members -> the memory.
 *
 * - Each topic (the kit's DisclosureList, one row per community, biggest
 *   first): its authored title, its summary and how many memories it holds;
 *   "title being written…" / "summary being written…" while memory says so,
 *   never a label the app made.
 * - A click on a topic FOCUSES it: the graph frames its circle and lights
 *   its memories, and the topic unfolds to list them (titles, newest first).
 *   A click on the focused topic lets it go.
 * - A click on a member opens it (Detail; a diary entry shows in the Book —
 *   the graph's rule). A member placed since his last sleep carries the
 *   badge "placed until his next sleep".
 * - Not served: ONE sentence instead of the list — his first sleep has not
 *   formed topics yet, or this gateway serves the old shape.
 *
 * Over the graph: open on a wide screen, folded on a phone (a real
 * disclosure: the head is a button with aria-expanded), so the graph keeps
 * its tap targets.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AfChip, DisclosureList, type DisclosureListHandle, type DisclosureRow, type DisclosureSelection } from "@abstractframework/ui-kit";

import { FIRST_SLEEP_SENTENCE, PROVISIONAL_BADGE, topicSummary, topicTitle, UNSERVED_SENTENCE, type CommunitiesRead, type ServedCommunity } from "./communities";
import { topicColor } from "./topic_layout";
import type { FoldState, NodeState } from "./stream_fold";
import { isDiaryNode, plainCardTitle } from "./hover_card";
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

/** "84 memories" (the served count). */
export function memoriesWord(n: number): string {
  return `${n} ${n === 1 ? "memory" : "memories"}`;
}

/** The newer memories the version does not list (they join a topic at his
 * next sleep). */
export function waitingLine(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 newer memory joins a topic at his next sleep." : `${n} newer memories join a topic at his next sleep.`;
}

/** Topics biggest first (ties by key: stable). */
export function topicOrder(communities: ServedCommunity[]): ServedCommunity[] {
  return [...communities].sort((a, b) => b.members.length - a.members.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

type TopicRowData = { kind: "topic"; c: ServedCommunity } | { kind: "member"; c: ServedCommunity; node: NodeState; provisional: boolean };
type TopicRow = DisclosureRow<TopicRowData>;

export const topicRowKey = (key: string) => `topic:${key}`;
export const memberRowKey = (key: string, row: string) => `member:${key}:${row}`;

/** The panel's visible rows: every topic; an unfolded one's members (the
 * memories of the fold, newest first). */
export function topicRows(communities: ServedCommunity[], expanded: ReadonlySet<string>, rowsOf: ReadonlyMap<string, string[]>, fold: FoldState): TopicRow[] {
  const out: TopicRow[] = [];
  for (const c of topicOrder(communities)) {
    const open = expanded.has(c.key);
    out.push({ key: topicRowKey(c.key), entityId: c.key, depth: 0, expandable: true, expanded: open, textValue: topicTitle(c, TITLE_BEING_WRITTEN), data: { kind: "topic", c } });
    if (!open) continue;
    const nodes = (rowsOf.get(c.key) ?? []).map((r) => fold.nodes.get(r)).filter((n): n is NodeState => Boolean(n));
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
            {memoriesWord(c.members.length)}
          </AfChip>
          {summary ? <span className={`gc_tp_summary${c.summaryPending ? " gc_tp_pending" : ""}`}>{summary}</span> : null}
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
            else onOpenMember(d.node);
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

/**
 * THE RING OUTSIDE HIS TOPICS (operator 2026-11-10: "why so many isolated
 * nodes sit on the periphery arc?"). Served, every memory sits in its one
 * circle; what the version does not list waits on a ring outside every
 * circle (topic_layout.waitingSeat). On castor's live life (2026-11-10
 * 14:09Z, untracked/graph-periphery-2026-11-10/ANSWER.md) that ring held 151
 * records: 149 CLOSED ones (superseded — mostly the operator's 2026-07-13
 * dedup of near-identical wake-cue episodes and re-digestions; 130 of them
 * have their replacement in a topic) and 2 engine records (the engram and
 * re-embed markers) — none an open memory waiting for his next sleep.
 *
 * Memory never lists a closed record, an engine record or a link row as a
 * member, so "place them in their topic" has nothing to place: seating them
 * by their replacement would be the app inventing a membership. They are
 * HIDDEN by default instead, and one pressed toggle ("151 outside topics")
 * shows them on their ring. An open memory the version does not list yet
 * (formed since, no placement) is never hidden: it joins a topic at his
 * next sleep and the Topics panel says so.
 *
 * Pure; computed once per fold (and served version), never per frame.
 */
import type { FoldState, NodeState } from "./stream_fold";

export interface OutsideTopics {
  /** Row ids of the records that never join a topic (closed, engine, link). */
  hidden: ReadonlySet<string>;
  closed: number;
  engine: number;
  links: number;
}

/** Why a record outside every circle never joins one (null: an open memory
 * that will, at his next sleep). */
export function neverJoins(node: Pick<NodeState, "closed" | "bookkeeping" | "kind">): "closed" | "engine" | "link" | null {
  if (node.closed !== null) return "closed";
  if (node.bookkeeping) return "engine";
  if (node.kind === "relation") return "link";
  return null;
}

/** The records outside every circle that never join a topic. */
export function outsideTopics(fold: FoldState, circleOfRow: ReadonlyMap<string, string>): OutsideTopics {
  const hidden = new Set<string>();
  let closed = 0;
  let engine = 0;
  let links = 0;
  for (const node of fold.nodes.values()) {
    if (circleOfRow.has(node.id)) continue;
    const why = neverJoins(node);
    if (why === null) continue;
    hidden.add(node.id);
    if (why === "closed") closed += 1;
    else if (why === "engine") engine += 1;
    else links += 1;
  }
  return { hidden, closed, engine, links };
}

/** The toggle's word after its count ("151 outside topics"; on a phone the
 * count shows and the word is its accessible name). */
export const OUTSIDE_WORD = "outside topics";

/** Its tooltip: what they are, why they sit outside, what the toggle does. */
export function outsideTitle(o: OutsideTopics, shown: boolean): string {
  const parts: string[] = [];
  if (o.closed) parts.push(`${o.closed} closed (rewritten, merged or retracted)`);
  if (o.engine) parts.push(`${o.engine} engine ${o.engine === 1 ? "record" : "records"}`);
  if (o.links) parts.push(`${o.links} ${o.links === 1 ? "link" : "links"}`);
  const what = `${o.hidden.size} ${o.hidden.size === 1 ? "record" : "records"} outside his topics: ${parts.join(", ")}. They never join a topic.`;
  return shown ? `${what} Shown on the ring around the graph — click to hide them.` : `${what} Hidden — click to show them on the ring around the graph.`;
}

/** Whether a record is drawn: hidden ones only while the toggle is off and
 * the record is not the selected one (a ledger row opened it). */
export function drawnOutside(hidden: ReadonlySet<string> | null, id: string, selectedId: string | null): boolean {
  return hidden === null || !hidden.has(id) || id === selectedId;
}

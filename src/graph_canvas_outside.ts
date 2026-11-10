/**
 * THE CLOSED MEMORIES (operator 2026-11-10: "why so many isolated nodes sit
 * on the periphery arc?", then backlog 0021: "default-hide closed records and
 * name the toggle for what they are"). Served, every memory sits in its one
 * circle; what the version does not list sits on a ring outside every circle
 * (topic_layout.waitingSeat). On castor's live life (2026-11-10) that ring
 * held only records that never join a topic: 132 CLOSED memories (superseded
 * — mostly the operator's 2026-07-13 dedup of near-identical wake-cue
 * episodes and re-digestions), 2 engine records (the engram and re-embed
 * markers) and 17 links between two versions of a topic (which the fold no
 * longer makes nodes: stream_fold.isTopicChainRow). Aletheia's: 229 closed
 * memories, 1 engine record (and 247 such links). None an open memory.
 *
 * Memory never lists a closed record, an engine record or a link row as a
 * member, so "place them in their topic" has nothing to place: seating them
 * by their replacement would be the app inventing a membership. They are
 * HIDDEN by default instead; one pressed toggle ("◌ 132 closed memories")
 * shows the closed memories on their ring. Engine records and link rows are
 * not memories: they stay hidden and are not counted. An open memory the
 * version does not list yet (formed since, no placement) is never hidden: it
 * joins a topic at his next sleep and the Topics panel says so.
 *
 * Pure; computed once per fold (and served version), never per frame.
 */
import type { FoldState, NodeState } from "./stream_fold";

export interface OutsideTopics {
  /** Row ids left undrawn while the toggle is off: every record outside
   * the circles that never joins one (closed memories, engine, links). */
  hidden: ReadonlySet<string>;
  /** Row ids left undrawn while it is on: the engine records and link rows
   * (not memories; the toggle never shows them). */
  hiddenWhenShown: ReadonlySet<string>;
  /** The closed memories outside every circle (what the toggle counts). */
  closed: number;
  /** Those closed memories by how they were closed (the closure's kind). */
  closedBy: ReadonlyMap<string, number>;
  engine: number;
  links: number;
}

/** Why a record outside every circle never joins one (null: an open memory
 * that will, at his next sleep). An engine record or a link row is never a
 * memory, closed or not. */
export function neverJoins(node: Pick<NodeState, "closed" | "bookkeeping" | "kind">): "closed" | "engine" | "link" | null {
  if (node.bookkeeping) return "engine";
  if (node.kind === "relation") return "link";
  if (node.closed !== null) return "closed";
  return null;
}

/** The records outside every circle that never join a topic. */
export function outsideTopics(fold: FoldState, circleOfRow: ReadonlyMap<string, string>): OutsideTopics {
  const hidden = new Set<string>();
  const hiddenWhenShown = new Set<string>();
  const closedBy = new Map<string, number>();
  let closed = 0;
  let engine = 0;
  let links = 0;
  for (const node of fold.nodes.values()) {
    if (circleOfRow.has(node.id)) continue;
    const why = neverJoins(node);
    if (why === null) continue;
    hidden.add(node.id);
    if (why === "closed" && node.closed) {
      closed += 1;
      closedBy.set(node.closed.kind, (closedBy.get(node.closed.kind) ?? 0) + 1);
      continue;
    }
    hiddenWhenShown.add(node.id);
    if (why === "engine") engine += 1;
    else links += 1;
  }
  return { hidden, hiddenWhenShown, closed, closedBy, engine, links };
}

/** The toggle's word after its count ("132 closed memories"; on a phone the
 * count shows and the word is its accessible name). */
export function closedWord(n: number): string {
  return n === 1 ? "closed memory" : "closed memories";
}

/** How a memory was closed, in words (memory's closure kinds; journal.py
 * CLOSURE_KINDS). A kind memory adds later is said as it is named. */
const CLOSED_HOW: ReadonlyArray<[string, string]> = [
  ["supersede", "replaced by a newer version"],
  ["retract", "retracted"],
  ["merged", "merged into another memory"],
  ["reinterpreted", "understood differently now"],
];

/** Its tooltip: "132 closed memories: 120 replaced by a newer version, 12
 * retracted" (words, never ids). */
export function closedTitle(o: Pick<OutsideTopics, "closed" | "closedBy">): string {
  const known = new Set(CLOSED_HOW.map(([kind]) => kind));
  const parts: string[] = [];
  for (const [kind, words] of CLOSED_HOW) {
    const n = o.closedBy.get(kind) ?? 0;
    if (n > 0) parts.push(`${n} ${words}`);
  }
  for (const [kind, n] of o.closedBy) if (!known.has(kind) && n > 0) parts.push(`${n} ${kind}`);
  return `${o.closed} ${closedWord(o.closed)}: ${parts.join(", ")}`;
}

/** The records left undrawn this frame: the closed memories too while the
 * toggle is off; null = every record drawn. */
export function hiddenOutside(o: OutsideTopics | null, shown: boolean): ReadonlySet<string> | null {
  if (!o) return null;
  const set = shown ? o.hiddenWhenShown : o.hidden;
  return set.size > 0 ? set : null;
}

/** Whether a record is drawn: a hidden one only when it is the selected one
 * (a ledger row opened it). */
export function drawnOutside(hidden: ReadonlySet<string> | null, id: string, selectedId: string | null): boolean {
  return hidden === null || !hidden.has(id) || id === selectedId;
}

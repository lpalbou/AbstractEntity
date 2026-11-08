/**
 * Recall highlight (operator 2026-11-07: "when I ask a question, it
 * selects memories — we should have a nice representation in the graph of
 * the selected memories … slowly dim the other non-selected nodes and
 * edges, so we can really see which parts of the graph are being used").
 *
 * Pure reading of the fold the app already has — no guess at model
 * behaviour: the recall BEAT active at the scrub position (the same rule
 * the Inspector uses for "No selection: show the beat active at the scrub
 * position") names the memories on the shelf and WHY each entered
 * (trace admissions). The highlight holds until the turn's answer lands —
 * the first episode BORN after the recall — or until the next recall
 * replaces it. The canvas feeds the lit ids into its ONE emphasis/dim
 * mechanism (the hover mechanism); nothing here draws.
 */

import { edgeKey, type BeatState, type FoldState } from "./stream_fold";

/** The three classes a person reads (the ledger's own grouping:
 * "present by right / from continuity / matched"; "both" = matched +
 * continuity reads as matched, like the ledger line counts it). */
export type RecallClass = "self" | "stm" | "matched";

export function admissionClass(label: string | null | undefined): RecallClass | null {
  if (label === "self") return "self";
  if (label === "stm") return "stm";
  if (label === "stimulus" || label === "both") return "matched";
  return null;
}

export const RECALL_CLASS_WORDS: Record<RecallClass, string> = {
  self: "present by right",
  stm: "from continuity",
  matched: "matched",
};

export interface RecallEmphasis {
  trace_id: string;
  /** Fold node ids lit by the recall (the shelf, resolved to nodes). */
  ids: Set<string>;
  /** node id -> class (only nodes whose admission label is known). */
  classes: Map<string, RecallClass>;
  /** node id -> the raw admission label (self/stm/stimulus/both). */
  labels: Map<string, string>;
  /** Edge keys ("a|b", the fold's edges) of the pairs THIS turn used
   * together — its co_selected events so far, re-resolved to today's node
   * ids. Two memories that merely share the shelf, or that earlier turns
   * used together, are not in it. */
  pairs: Set<string>;
  /** Counts over the SHELF (beat.selected), node or not — the truth the
   * ledger line states ("50 on the shelf (6 present by right, …)"). */
  counts: { total: number; self: number; stm: number; matched: number };
}

/** The beat active at the scrub position — the Inspector's rule: the last
 * beat (in first-seen order) whose first seq is at or before the scrub. */
export function activeBeat(fold: FoldState, scrubSeq: number): BeatState | null {
  let active: BeatState | null = null;
  for (const tid of fold.beat_order) {
    const beat = fold.beats.get(tid);
    if (beat && beat.first_seq <= scrubSeq) active = beat;
  }
  return active;
}

/** Did the turn's answer land? = an EPISODE node first seen after the
 * recall and at or before the scrub (the exchange binding that closes a
 * turn). Records the recall itself touched (shelf, dropped, labelled) are
 * excluded: a usage event can REVEAL an old record after the trace, and a
 * revealed old episode is not this turn's answer. */
export function answerLanded(fold: FoldState, beat: BeatState, scrubSeq: number): boolean {
  const touched = new Set<string>(beat.selected);
  for (const d of beat.dropped) touched.add(d.record_id);
  for (const id of Object.keys(beat.admissions)) touched.add(id);
  for (const node of fold.nodes.values()) {
    if (node.kind !== "episode") continue;
    if (node.first_seq <= beat.first_seq || node.first_seq > scrubSeq) continue;
    if (touched.has(node.id) || (node.graph_id !== null && touched.has(node.graph_id))) continue;
    return true;
  }
  return false;
}

function resolveNodeId(fold: FoldState, id: string): string | null {
  if (fold.nodes.has(id)) return id;
  const row = fold.graph_to_row.get(id);
  return row !== undefined && fold.nodes.has(row) ? row : null;
}

/** The recall to light at the scrub position, or null (no recall yet, the
 * answer already landed, or an empty shelf). */
export function recallEmphasis(fold: FoldState, scrubSeq: number): RecallEmphasis | null {
  const beat = activeBeat(fold, scrubSeq);
  if (!beat || answerLanded(fold, beat, scrubSeq)) return null;
  return beatEmphasis(fold, beat);
}

/** The selection as the canvas keys it: a memory opened by its GRAPH id
 * (a ledger moment in Live) resolves to its row id — the Inspector's own
 * rule (fold.graph_to_row); anything else passes through. */
export function resolveSelection(fold: FoldState, selectedId: string | null): string | null {
  if (selectedId === null || fold.nodes.has(selectedId)) return selectedId;
  return fold.graph_to_row.get(selectedId) ?? selectedId;
}

/** What the canvas lights: a recall line picked in the ledger (selection
 * id `beat:<trace>`) is an explicit ask — that beat lights, answered or
 * not; otherwise the recall active at the scrub position. */
export function canvasRecall(fold: FoldState, scrubSeq: number, selectedId: string | null): RecallEmphasis | null {
  if (selectedId?.startsWith("beat:")) {
    const beat = fold.beats.get(selectedId.slice("beat:".length));
    return beat ? beatEmphasis(fold, beat) : null;
  }
  return recallEmphasis(fold, scrubSeq);
}

/** One beat's shelf as emphasis (null for an empty shelf). */
export function beatEmphasis(fold: FoldState, beat: BeatState): RecallEmphasis | null {
  if (beat.selected.length === 0) return null;
  const ids = new Set<string>();
  const classes = new Map<string, RecallClass>();
  const labels = new Map<string, string>();
  const counts = { total: beat.selected.length, self: 0, stm: 0, matched: 0 };
  for (const rid of beat.selected) {
    const label = beat.admissions[rid];
    const cls = admissionClass(label);
    if (cls) counts[cls] += 1;
    const nodeId = resolveNodeId(fold, rid);
    if (nodeId === null) continue;
    ids.add(nodeId);
    if (cls) classes.set(nodeId, cls);
    if (label) labels.set(nodeId, label);
  }
  return { trace_id: beat.trace_id, ids, classes, labels, counts, pairs: turnPairs(fold, beat) };
}

/** The pairs a turn used together, as today's edge keys: each endpoint
 * re-resolves through graph_to_row (a node re-keyed after the deposit);
 * a pair whose ends merged into one node, or whose end no longer resolves,
 * names no edge and is skipped. */
export function turnPairs(fold: FoldState, beat: BeatState): Set<string> {
  const pairs = new Set<string>();
  for (const [a, b] of beat.used_pairs.values()) {
    const ra = resolveNodeId(fold, a);
    const rb = resolveNodeId(fold, b);
    if (ra === null || rb === null || ra === rb) continue;
    pairs.add(edgeKey(ra, rb));
  }
  return pairs;
}

/** The legend line: "50 memories recalled for this turn: 6 present by
 * right · 12 from continuity · 32 matched" (zero classes are omitted). */
export function recallLegendParts(e: RecallEmphasis): { head: string; parts: Array<{ cls: RecallClass; text: string }> } {
  const n = e.counts.total;
  const head = `${n} memor${n === 1 ? "y" : "ies"} recalled for this turn`;
  const parts: Array<{ cls: RecallClass; text: string }> = [];
  for (const cls of ["self", "stm", "matched"] as const) {
    if (e.counts[cls] > 0) parts.push({ cls, text: `${e.counts[cls]} ${RECALL_CLASS_WORDS[cls]}` });
  }
  return { head, parts };
}

export function recallLegendText(e: RecallEmphasis): string {
  const { head, parts } = recallLegendParts(e);
  return parts.length ? `${head}: ${parts.map((p) => p.text).join(" · ")}` : head;
}

/** Which emphasis drives the canvas this frame — ONE mechanism, ordered
 * triggers: an explicit filter (lens/search/topic) wins; then the node
 * under the cursor; then the selected node (the Inspector's rule:
 * a selection outranks the current recall); then the recall. */
export type EmphasisDriver = "filter" | "focus" | "recall" | null;

export function emphasisDriver(args: {
  filter: boolean;
  hover: boolean;
  selected: boolean;
  recall: boolean;
}): EmphasisDriver {
  if (args.filter) return "filter";
  if (args.hover || args.selected) return "focus";
  if (args.recall) return "recall";
  return null;
}

/** Emphasis targets the canvas eases toward (1 = full). */
export const DIMMED_NODE = 0.12;
export const DIMMED_EDGE = 0.08;

/** The dim target of one edge this frame. `turnPairs` is the recall's
 * pairs when the RECALL drives the canvas (else null): then an edge is lit
 * only when this turn used its pair — two shelf memories that merely share
 * the shelf, or that earlier turns used together, dim like everything off
 * the shelf (operator 2026-11-08: "it selects more nodes & edges on the
 * graph than have been visited"). `pairKey` is the co-use edge's key; a
 * born-linked (structural) edge passes null — no turn uses it, so it dims
 * under the recall. Every other driver keeps its rule: lit when both ends
 * are emphasized. */
export function edgeDimTarget(
  emphasis: ReadonlySet<string> | null,
  turnPairs: ReadonlySet<string> | null,
  a: string,
  b: string,
  pairKey: string | null,
): number {
  if (turnPairs) return pairKey !== null && turnPairs.has(pairKey) ? 1 : DIMMED_EDGE;
  return emphasis && !(emphasis.has(a) && emphasis.has(b)) ? DIMMED_EDGE : 1;
}

/** Under the recall the green says "used together THIS turn", one even
 * green for every pair the turn used; outside the recall it is the
 * multi-turn temporal warmth (unchanged). */
export const TURN_PAIR_WARMTH = 0.75;

export function edgeWarmthShown(turnPairs: ReadonlySet<string> | null, pairKey: string, warmth: number): number {
  if (!turnPairs) return warmth;
  return turnPairs.has(pairKey) ? TURN_PAIR_WARMTH : 0;
}

/** The "warm now" glow under the recall: only memories on this turn's
 * shelf glow (stepped back so the recall rings carry the moment); a memory
 * an EARLIER shelf picked — dropped this turn or never a candidate — is
 * dimmed, never glowing. `shelf` is the recall's ids when the recall
 * drives the canvas (else null: the resting warmth view, unchanged). */
export const RECALL_GLOW_SCALE = 0.35;

export function nodeGlowShown(shelf: ReadonlySet<string> | null, id: string, warmth: number): number {
  if (!shelf) return warmth;
  return shelf.has(id) ? warmth * RECALL_GLOW_SCALE : 0;
}

/** Dim ramp duration (seconds) for the CURRENT frame: the recall eases
 * in and out over ~600 ms; hover keeps its 0.5 s. The recall ramp holds a
 * short while after the recall stops driving so the RELEASE eases at the
 * same pace it arrived. */
export const HOVER_RAMP_SEC = 0.5;
export const RECALL_RAMP_SEC = 0.6;

export function dimRampSec(nowMs: number, lastRecallDriveMs: number | null): number {
  if (lastRecallDriveMs !== null && nowMs - lastRecallDriveMs <= RECALL_RAMP_SEC * 1000 + 50) return RECALL_RAMP_SEC;
  return HOVER_RAMP_SEC;
}

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
 * (trace admissions), and the pairs that turn used together.
 *
 * The highlight STAYS lit after his answer lands (operator 2026-11-08:
 * "essentially it should show the current context highlighted in the
 * graph for the response"): the newest recall's shelf + that turn's pairs
 * hold until the NEXT recall replaces them, as one swap (the next beat is
 * a new emphasis object, never a merge). The reader's one control is the
 * "Context" toggle (contextToggleView): off shows the plain graph with the
 * resting warmth view; Escape or a click on empty canvas never clears it.
 * The canvas feeds the lit ids into its ONE emphasis/dim mechanism (the
 * hover mechanism); nothing here draws.
 */

import { edgeKey, type BeatState, type FoldState } from "./stream_fold";
import { computeTemporalActivation, type AttentionEventLite } from "./temporal_activation";

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
  stm: "continuity",
  matched: "matched",
};

/** What each ring means, in the operator's words (live test 2026-11-09:
 * "when i click on context, it shows [rings: …] but i am unsure how to
 * interpret it"). */
export const RECALL_CLASS_MEANING: Record<RecallClass, string> = {
  self: "memories he always keeps in mind",
  stm: "memories that followed from the last ones",
  matched: "memories found for this message",
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
  /** THE PATHS TRAVELLED to reach the recalled memories (operator
   * 2026-11-09: "i would also expect the edges traveled to be selected"),
   * edge key -> the class of the memory the path reaches, drawn in that
   * ring's colour (travelledPaths). One line per matched or continuity
   * memory at most: its strongest link to another memory he holds now —
   * never the whole used-together mesh (Castor's 32 matched memories weave
   * 496 pairs per turn: lit all at once they hid every path). Present-by-right memories are
   * in mind by right, reached through no trail: no line. The canvas lights
   * these and dims every other edge. */
  travelled: Map<string, RecallClass>;
  /** Each travelled line's DIRECTION (operator 2026-11-09: "the lit lines
   * need … a DIRECTION"): edge key -> `from`, the shelf memory the path
   * leaves (source), and `to`, the recalled memory it reaches (target).
   * Same keys as `travelled`, computed with it (once per recall, never per
   * frame). */
  travelledEnds: Map<string, TravelledEnds>;
  /** Counts over the SHELF (beat.selected), node or not — the truth the
   * ledger line states ("50 on the shelf (6 present by right, …)"). */
  counts: { total: number; self: number; stm: number; matched: number };
}

/** One lit line's ends: from the memory he held in mind to the one he
 * recalled through it. */
export interface TravelledEnds {
  from: string;
  to: string;
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

function resolveNodeId(fold: FoldState, id: string): string | null {
  if (fold.nodes.has(id)) return id;
  const row = fold.graph_to_row.get(id);
  return row !== undefined && fold.nodes.has(row) ? row : null;
}

/** The recall to light at the scrub position: the newest recall's shelf,
 * held after his answer lands until the next recall replaces it; null
 * only before any recall, or for an empty shelf. */
export function recallEmphasis(fold: FoldState, scrubSeq: number): RecallEmphasis | null {
  const beat = activeBeat(fold, scrubSeq);
  return beat ? beatEmphasis(fold, beat) : null;
}

/** The selection as the canvas keys it: a memory opened by its GRAPH id
 * (a ledger moment in Live) resolves to its row id — the Inspector's own
 * rule (fold.graph_to_row); anything else passes through. */
export function resolveSelection(fold: FoldState, selectedId: string | null): string | null {
  if (selectedId === null || fold.nodes.has(selectedId)) return selectedId;
  return fold.graph_to_row.get(selectedId) ?? selectedId;
}

/** What the canvas lights: a recall line picked in the ledger (selection
 * id `beat:<trace>`) is an explicit ask — that beat lights, whatever the
 * toggle; otherwise the recall active at the scrub position while the
 * "Context" toggle is on, and nothing (the plain graph) while it is off. */
export function canvasRecall(fold: FoldState, scrubSeq: number, selectedId: string | null, contextOn: boolean): RecallEmphasis | null {
  if (selectedId?.startsWith("beat:")) {
    const beat = fold.beats.get(selectedId.slice("beat:".length));
    return beat ? beatEmphasis(fold, beat) : null;
  }
  return contextOn ? recallEmphasis(fold, scrubSeq) : null;
}

/** HOVER PREVIEW (operator 2026-11-09): resting the mouse on a ledger line
 * that opens a recall — "He holds these in mind", the recall line, their
 * click target `beat:<trace>` (ledger_lines.lineTarget) — lights that
 * recall's memories in the graph and dims the rest, exactly as its click
 * does; leaving the line restores what was lit. `target` is the line's
 * click target; any other line previews nothing (null). */
export function recallPreviewOf(target: string | null): string | null {
  return target !== null && target.startsWith("beat:") ? target : null;
}

/** The selection the canvas lights: the hovered recall line's beat while
 * the mouse rests on it — the click's own selection id, so the canvas
 * lights it through the click path (canvasRecall) — else the click's
 * selection. Detail keeps the click's selection either way. */
export function canvasSelection(selectedId: string | null, preview: string | null): string | null {
  return preview ?? selectedId;
}

/** A ledger row's pointer handlers for the preview: entering with a MOUSE
 * previews the row's recall (or clears an earlier preview: a row that
 * opens no recall previews nothing); leaving clears it. Touch has no
 * hover: a tap stays a selection (the row's click). No handlers without a
 * preview sink. */
export interface PreviewPointer {
  pointerType: string;
}
export function recallHoverHandlers(
  target: string | null,
  onPreview: ((id: string | null) => void) | undefined,
): { onPointerEnter?(e: PreviewPointer): void; onPointerLeave?(e: PreviewPointer): void } {
  if (!onPreview) return {};
  const beat = recallPreviewOf(target);
  return {
    onPointerEnter: (e) => {
      if (e.pointerType === "mouse") onPreview(beat);
    },
    onPointerLeave: () => onPreview(null),
  };
}

/** THE "CONTEXT" TOGGLE (operator 2026-11-08: "there must be a toggle to
 * show/hide the currently selected memories so the reader can explore the
 * rest of the graph"). Labelled by what it shows, pressed = on (toggles
 * show state, never verbs). What there is to show at the scrub position:
 * "none" before any recall, "empty" when the newest recall brought no
 * memory to mind, "ready" otherwise. */
export type ContextAvailability = "none" | "empty" | "ready";

export function contextAvailability(fold: FoldState, scrubSeq: number): ContextAvailability {
  const beat = activeBeat(fold, scrubSeq);
  if (!beat) return "none";
  return beat.selected.length > 0 ? "ready" : "empty";
}

export const CONTEXT_LABEL = "Context";
export const CONTEXT_TITLE = "the memories he brought to mind for his last answer";
export const CONTEXT_HINT_NONE = "Nothing to show yet: he has not brought any memories to mind at this point of his life";
export const CONTEXT_HINT_EMPTY = "His last recall brought no memories to mind";

export interface ContextToggleView {
  /** aria-pressed: the highlight is on the graph. */
  pressed: boolean;
  disabled: boolean;
  title: string;
}

/** The toggle as the reader sees it: on when a recall exists and the
 * reader's choice is on; disabled, with a hint saying why, when there is
 * nothing to light. The choice itself is kept (a disabled toggle never
 * rewrites it), so the highlight returns with the next recall. */
export function contextToggleView(availability: ContextAvailability, chosenOn: boolean): ContextToggleView {
  if (availability === "none") return { pressed: false, disabled: true, title: CONTEXT_HINT_NONE };
  if (availability === "empty") return { pressed: false, disabled: true, title: CONTEXT_HINT_EMPTY };
  return { pressed: chosenOn, disabled: false, title: `${CONTEXT_LABEL}: ${CONTEXT_TITLE}` };
}

/** The reader's choice, remembered for the browser session (on by
 * default). Storage can be missing or throw (private mode, blocked site
 * data): the default then holds and nothing breaks. */
export const CONTEXT_CHOICE_KEY = "abstractentity_graph_context_v1";

export function readContextChoice(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(CONTEXT_CHOICE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeContextChoice(storage: Pick<Storage, "setItem"> | null, on: boolean): void {
  try {
    storage?.setItem(CONTEXT_CHOICE_KEY, on ? "on" : "off");
  } catch {
    // Not remembered this session; the choice still holds on screen.
  }
}

/** window.sessionStorage, or null where reading it throws. */
export function sessionStore(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
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
  const pairs = turnPairs(fold, beat);
  const travelledEnds = new Map<string, TravelledEnds>();
  const travelled = travelledPaths(fold, beat, ids, classes, pairs, travelledEnds);
  return { trace_id: beat.trace_id, ids, classes, labels, counts, pairs, travelled, travelledEnds };
}

/** Trail warmth just before a step: the engine-parity pair activation over
 * the attention events folded before the step's first event, the step's
 * own deposit excluded — how warm each trail was when he reached for these
 * memories (the same as-of reading the engine's continuity uses). */
export function trailsBefore(fold: FoldState, beat: Pick<BeatState, "first_seq" | "trace_id">): Map<string, number> {
  const before = new Map<string, AttentionEventLite[]>();
  for (const [scope, buf] of fold.attention) {
    before.set(scope, buf.filter((ev) => ev.seq < beat.first_seq && ev.trace_id !== beat.trace_id));
  }
  return computeTemporalActivation(before).pairs;
}

/** THE PATHS TRAVELLED, at most one per matched or continuity memory:
 * its strongest link to another memory on this shelf —
 * - a MATCHED memory (found for this message): among the pairs this step
 *   used together (its co_selected events — never an earlier pair, the
 *   operator's 2026-11-08 ruling), the one whose trail was warmest just
 *   before this step, then the companion he has used most;
 * - a CONTINUITY memory (followed from the last ones; it deposits no pair
 *   this step): the co-use trail that was warmest just BEFORE this step
 *   (trailsBefore: later turns never count) to another memory on this
 *   shelf, then the companion he has used most. No warm trail to the
 *   shelf: no line — nothing is drawn that the stream does not show.
 * Last tie-break: the smaller edge key, so the choice is stable. When two
 * memories pick the same line it takes the matched colour first, and the
 * matched memory is the one it reaches. `ends` (when given) receives each
 * line's direction: from the other shelf memory to the memory reached. */
export function travelledPaths(
  fold: FoldState,
  beat: BeatState,
  shelf: ReadonlySet<string>,
  classes: ReadonlyMap<string, RecallClass>,
  turnPairKeys: ReadonlySet<string>,
  ends?: Map<string, TravelledEnds>,
): Map<string, RecallClass> {
  const out = new Map<string, RecallClass>();
  const reached = new Map<string, RecallClass>();
  for (const [id, cls] of classes) if (cls !== "self") reached.set(id, cls);
  if (reached.size === 0) return out;
  const warm = trailsBefore(fold, beat);
  interface Pick {
    key: string;
    /** The other shelf memory: where the path comes from. */
    other: string;
    warm: number;
    partnerUse: number;
  }
  const better = (x: Pick, y: Pick): boolean =>
    x.warm !== y.warm ? x.warm > y.warm : x.partnerUse !== y.partnerUse ? x.partnerUse > y.partnerUse : x.key < y.key;
  const best = new Map<string, Pick>();
  const consider = (member: string, other: string, key: string) => {
    const cls = reached.get(member);
    if (!cls || !shelf.has(other)) return;
    const pick: Pick = { key, other, warm: warm.get(key) ?? 0, partnerUse: fold.nodes.get(other)?.selected_count ?? 0 };
    if (cls === "matched" ? !turnPairKeys.has(key) : !(pick.warm > 0)) return;
    const cur = best.get(member);
    if (!cur || better(pick, cur)) best.set(member, pick);
  };
  for (const e of fold.edges.values()) {
    if (e.a === e.b) continue;
    consider(e.a, e.b, e.key);
    consider(e.b, e.a, e.key);
  }
  for (const cls of ["matched", "stm"] as const) {
    for (const [member, pick] of best) {
      if (reached.get(member) !== cls || out.has(pick.key)) continue;
      out.set(pick.key, cls);
      ends?.set(pick.key, { from: pick.other, to: member });
    }
  }
  return out;
}

/** What a lit line says when the pointer rests on it (operator 2026-11-09):
 * "<recalled memory> — reached from <shelf memory> · <relation>". The
 * relation is the word recorded between the two memories when they were
 * formed ("born linked": summarizes, continues, written_amid, derived_from,
 * mentions, reflected_in …), as served; a pair that was never born linked
 * is joined by use alone: "used together" (every lit line is a co-use
 * trail, fold.edges). Titles are the memory cards' own (`titleOf`). */
export interface TravelledLine {
  key: string;
  from: string;
  to: string;
  cls: RecallClass;
  relation: string;
}

export const USED_TOGETHER = "used together";

/** The lit lines of a recall with their direction and relation word, once
 * per recall (the canvas memoizes it on [fold, recall]). A born-linked
 * relation between the two ends counts in either direction (graph ids
 * resolve through graph_to_row, the canvas's own rule). */
export function travelledLines(fold: FoldState, recall: RecallEmphasis | null): Map<string, TravelledLine> {
  const out = new Map<string, TravelledLine>();
  if (!recall || recall.travelledEnds.size === 0) return out;
  const relationOf = new Map<string, string>();
  for (const se of fold.structural_edges.values()) {
    const a = fold.graph_to_row.get(se.source_graph_id) ?? se.source_graph_id;
    const b = fold.graph_to_row.get(se.target_graph_id) ?? se.target_graph_id;
    if (a === b) continue;
    const key = edgeKey(a, b);
    if (recall.travelledEnds.has(key) && !relationOf.has(key)) relationOf.set(key, se.relation);
  }
  for (const [key, ends] of recall.travelledEnds) {
    const cls = recall.travelled.get(key);
    if (!cls) continue;
    out.set(key, { key, from: ends.from, to: ends.to, cls, relation: relationOf.get(key) ?? USED_TOGETHER });
  }
  return out;
}

/** The tooltip line of one lit line, from the two memories' card titles. */
export function travelledLineWords(line: Pick<TravelledLine, "relation">, toTitle: string, fromTitle: string): string {
  return `${toTitle} — reached from ${fromTitle} · ${line.relation}`;
}

/** The lit line under the pointer (screen px): the nearest segment within
 * `tolerance` px, else null. `segments` are this frame's lit lines in
 * screen space (from = the shelf memory's end). Run on pointer moves only,
 * over the lit lines only (a few dozen), never per frame. */
export interface LineSegment {
  key: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export function lineAt(x: number, y: number, segments: Iterable<LineSegment>, tolerance = 5): string | null {
  let best: string | null = null;
  let bestD = tolerance;
  for (const s of segments) {
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / len2)) : 0;
    const d = Math.hypot(x - (s.ax + t * dx), y - (s.ay + t * dy));
    if (d <= bestD) {
      bestD = d;
      best = s.key;
    }
  }
  return best;
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
 * right · 12 continuity · 32 matched" (zero classes are omitted). */
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

/** THE CONTEXT LEGEND (operator 2026-11-09): what each ring colour means,
 * in his words, with this step's count — all three rings, a zero included
 * (a legend explains every colour it can show); then the lit lines and the
 * grey-to-green fill. */
export interface RecallLegendRow {
  cls: RecallClass;
  count: number;
  name: string;
  meaning: string;
}

export function recallLegendRows(e: RecallEmphasis): RecallLegendRow[] {
  return (["self", "stm", "matched"] as const).map((cls) => ({ cls, count: e.counts[cls], name: RECALL_CLASS_WORDS[cls], meaning: RECALL_CLASS_MEANING[cls] }));
}

/** The graph's legend at the bottom says what a lit line is (operator
 * 2026-11-11: never twice; the Context box keeps its rings only). */
export const TRAVELLED_LEGEND = "lit lines: his path to each recalled memory, in its ring's colour";
/** Its words in the legend's row, short (round-6 review F2: the row is one
 * scrolling line and the whole sentence was cut mid-word); the sentence is
 * its hover and its accessible name. */
export const TRAVELLED_KEY = "lit lines";
/** The lit lines' direction, in words (operator 2026-11-09), under the row
 * and drawn on the canvas as an arrowhead at the recalled memory. */
export const TRAVELLED_DIRECTION = "from what he held in mind → to what he recalled";
export const TRAVELLED_TITLE =
  "Each matched memory is joined to the memory it was used with for this message along the strongest trail; each continuity memory to the memory it followed from, along the trail that was warmest just before this step. Memories present by right are always there and need no path. Every other line is dimmed.";

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

/** Emphasis targets the canvas eases toward (1 = full). DIMMED_NODE was
 * 0.12 until the operator's 2026-11-10 test ("the memories reachable from a
 * hovered node are not visible enough"): 0.10 is a 20 % stronger
 * lit-to-dimmed contrast. */
export const DIMMED_NODE = 0.1;
export const DIMMED_EDGE = 0.08;
/** A lit co-use line under hover or selection (the "focus" driver) draws at
 * this multiple of its usage alpha (operator 2026-11-10: ~20 % more
 * contrast on the hovered node's reachable lines). */
export const FOCUS_LIT_GAIN = 1.2;

/** The dim target of one edge this frame. `travelled` is the recall's
 * travelled paths when the RECALL drives the canvas (else null): then an
 * edge is lit only when it is a path travelled to reach this step's
 * memories (RecallEmphasis.travelled) — two shelf memories that merely
 * share the shelf, or that earlier turns used together, dim like
 * everything off the shelf (operator 2026-11-08: "it selects more nodes &
 * edges on the graph than have been visited"). `pairKey` is the co-use
 * edge's key; a born-linked (structural) edge passes null — no step
 * travels it, so it dims under the recall. Every other driver keeps its
 * rule: lit when both ends are emphasized. */
export function edgeDimTarget(
  emphasis: ReadonlySet<string> | null,
  travelled: { has(key: string): boolean } | null,
  a: string,
  b: string,
  pairKey: string | null,
): number {
  if (travelled) return pairKey !== null && travelled.has(pairKey) ? 1 : DIMMED_EDGE;
  return emphasis && !(emphasis.has(a) && emphasis.has(b)) ? DIMMED_EDGE : 1;
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

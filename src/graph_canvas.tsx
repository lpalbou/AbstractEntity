/**
 * Canvas renderer for the entity memory graph.
 *
 * Reads a FoldState + the current scrub seq and draws:
 * - nodes colored by class (identity gold, memories blue, diary green in
 *   its own lane, standing targets violet diamonds on the outer orbit);
 * - node size = GLOBAL selected count (the never-decaying count) — what
 *   mattered over a lifetime shapes the structure;
 * - THE USAGE SCALE (operator live test 2026-11-09): a memory's fill and a
 *   co-use line's colour run from dark grey (rarely used) to green (most
 *   used), ranked within this life (graph_usage.ts: quantiles over the
 *   loaded window, ties ordered by recency), so his most used tenth pops;
 *   the kind colour rides a small core inside the memory;
 * - pulses on recent use, colored by WHY the memory entered context
 *   (identity present-by-right / continuity / matched);
 * - edges flash amber when just traveled;
 * - scar (red) and bond (warm) halos on standing targets;
 * - closed beliefs as ghosts.
 *
 * The renderer owns layout positions (persistent per node id) but never
 * owns truth: everything drawn derives from the fold at the scrub seq.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import type { FoldState, NodeState, StandingState } from "./stream_fold";
import { ADMISSION_LABELS } from "./stream_types";
import {
  canvasRecall,
  DIMMED_NODE,
  dimRampSec,
  edgeDimTarget,
  emphasisDriver,
  lineAt,
  resolveSelection,
  travelledLines,
  travelledLineWords,
  type LineSegment,
  type RecallClass,
  type TravelledLine,
} from "./recall_emphasis";
import { ContextLegend } from "./context_legend";
import { hoverIntent } from "./hover_intent";
import { coldOf, TOP_DECILE, usageEdgeAlpha, usageMix, usageRgb, usageScale } from "./graph_usage";
import "./graph_canvas.css";
import {
  canvasLabel,
  cardKindLine,
  cardSummary,
  nodeActions,
  nodeCardText,
  partnerCount,
  plainCardTitle,
  topicActions,
  topicExemplarText,
  type CardActionId,
} from "./hover_card";
import { CardActions, CardSummaryBlock, HoverCardBox, useHoverWords } from "./graph_hover_card";
import { recordTitle } from "./record_detail";
import { writeSectionOpen } from "./section_disclosure";
import { Words } from "./verbatim_view";
import { WordsLine } from "./words_line";
import { nodeLabel, summaryLabel } from "./node_label";
import type { TemporalActivation } from "./temporal_activation";
import { DEFAULT_FORCE_PARAMS, hash01, maxVelocity, seedPosition, tickForces, type LayoutEdge, type LayoutNode } from "./force_layout";
import { useCommunities, type TopicSource } from "./topic_map";
import {
  entryTitleOf,
  haloOf,
  parseTopicSlots,
  placeTopicLabel,
  planTopicHomes,
  planTopicSeats,
  readableKeyword,
  readableTopicLabel,
  TOPIC_SEAT_STRENGTH,
  topicSlotsOf,
  trailPulls,
  wrapTopicLabel,
  type Rect,
  type TopicSlot,
} from "./topic_layout";

export interface GraphCanvasProps {
  fold: FoldState;
  /** The decaying activation at the scrub position (computed from the
   * fold's attention windows — recomputed whenever the fold changes). */
  temporal: TemporalActivation;
  /** Current scrub position (seq); pulses measure recency against it. */
  scrubSeq: number;
  selectedId: string | null;
  /** Search matches (node ids): emphasized, everything else dims. Hover
   * uses the same emphasis mechanism with the hovered node's neighborhood
   * ("one mechanism, two triggers" — 0007 round 2 item 4). */
  searchIds: Set<string> | null;
  /** Fit-to-emphasis trigger: when this token CHANGES (lens switch, search
   * commit), the camera frames the emphasized nodes once. Deliberately not
   * keyed on the set itself — set membership drifts with every envelope in
   * live tails ("recent"/"warm" lenses) and a fold-keyed fit hijacked the
   * camera continuously (adversary P0). */
  focusToken?: string;
  /** Stable key for layout persistence (entity slug or source label). */
  layoutKey: string | null;
  onSelect(id: string | null): void;
  /** The gateway life this graph reads from (null for file/demo sources):
   * the topic communities (topics shape the layout whenever they exist —
   * topic_layout.ts) and the record read a hover card leads with — its
   * current understanding (graph_hover_card.useHoverWords; never a diary
   * record's). */
  gatewaySource: TopicSource | null;
  /** The "topics" toggle: soft halos + labels over the grouped layout
   * (never a different graph). */
  showTopics: boolean;
  /** The "Context" toggle: the newest recall's shelf + that turn's pairs
   * stay lit until the next recall (off = the plain graph, the resting
   * warmth view). A recall picked in the ledger lights either way. */
  showContext: boolean;
  /** A click on a topic label lights that topic's memories (the topic
   * filter: every member present, diary and identity included). */
  onPickTopic(rowIds: Set<string>, label: string): void;
  /** A diary entry's card action: open the Book at that entry (its words
   * are read there, on their own click — never from the graph). */
  onShowInBook(graphId: string): void;
  height?: number;
}

export const IDENTITY_KINDS = new Set(["value", "purpose", "trait", "claim"]);

/** Mirror of the ENGINE's canonical record-kind set — root-exported as
 * `abstractmemory.MEMORY_RECORD_KINDS` (the one authoritative place;
 * engine validation vocabulary stays engine-owned, semantics c319 ruling).
 * SYNC-ON-WIDENING: when memory widens the set, diff against
 * `python -c "from abstractmemory import MEMORY_RECORD_KINDS; print(sorted(MEMORY_RECORD_KINDS))"`
 * and extend KIND_COLORS — the drift test fails if a canonical kind would
 * render as "unknown" gray (the diary_type-clamp gotcha class). */
export const ENGINE_RECORD_KINDS = [
  "answer",
  "claim",
  "decision",
  "diary",
  "dream",
  "episode",
  "instruction",
  "interest",
  "lesson",
  "memory",
  "observation", // noticed-not-distilled (laurent dm#84; memory ship 2026-07-20) — episode peer, never competes with lesson's wisdom rank
  "plan",
  "purpose",
  "question",
  "realization", // waking-elected identity proposal, held for sleep (runtime ship 2026-07-23 c4802; enactment = memory's bars)
  "summary",
  "trait",
  "value",
  "world_model", // sleep-formed orientation cards (memory ship 2026-07-12, c1148)
] as const;

export const KIND_COLORS: Record<string, string> = {
  identity: "#e7b45a",
  memory: "#6ea8d8",
  episode: "#6ea8d8", // lived exchanges are memories
  summary: "#4fb8a8", // consolidation products (0023)
  dream: "#8f7ce8", // what formed while nothing was running
  world_model: "#7ad8c9", // sleep-formed orientation cards — consolidation family (kin to summary), lighter so revisable cards read distinct from settled summaries
  interest: "#a8c46a", // self-grown direction
  lesson: "#d89a5a",
  observation: "#96b4d8", // his noticing of the world — lived-material family (kin to episode's blue), lighter so noticed-not-distilled reads distinct from exchanges
  diary: "#7bc98c",
  question: "#d87ab0", // open questions — wake-reason kind, stands out
  realization: "#e8c47c", // identity proposal held for sleep — identity family (kin to identity gold), lighter because PROPOSED not enacted
  answer: "#5aa9a0", // beside summary: a question resolved
  decision: "#c9705a",
  plan: "#5ab8d8",
  instruction: "#7a8fd8",
  standing: "#c084dd",
  relation: "#54657d",
  bookkeeping: "#5d6a7a", // engine acts (engram/reembed markers) — not memories
  unknown: "#8a94a6",
};

const ADMISSION_COLORS: Record<string, string> = {
  self: "#f0c060",
  stm: "#a58fe0",
  stimulus: "#59c2d8",
  both: "#6fd8b0",
};

/** Recall ring per class (the legend's three words): present by right =
 * the identity gold, from continuity = the continuity violet, matched =
 * the stimulus cyan. "both" reads as matched (the ledger's grouping) and
 * never takes the diary green — green is WARMTH on this canvas. */
const RECALL_RING_ADMISSION: Record<RecallClass, string> = { self: "self", stm: "stm", matched: "stimulus" };

/** Structural ("born linked") edges are TYPED and DIRECTIONAL. The type
 * used to be a dash pattern — indistinguishable at graph alpha (operator
 * 2026-07-15). Now the line is a uniform faint solid and the TYPE + the
 * DIRECTION ride a small GLYPH at the target end (arrowhead-family marks,
 * oriented along the edge, pointing at the target). Deterministic per
 * relation name; the legend renders the same mapping via relationGlyph. */
export const RELATION_GLYPHS = ["arrow", "chevron2", "circle", "diamond", "square", "bar"] as const;
export type RelationGlyph = (typeof RELATION_GLYPHS)[number];

export function relationGlyph(relation: string): RelationGlyph {
  return RELATION_GLYPHS[Math.floor(hash01(relation, 13) * RELATION_GLYPHS.length) % RELATION_GLYPHS.length];
}

/** Trace the glyph path centered at the origin with the edge direction on
 * +x (caller translates/rotates). Stroke-only shapes, ~9px envelope. */
export function traceRelationGlyph(ctx: CanvasRenderingContext2D, glyph: RelationGlyph): void {
  switch (glyph) {
    case "arrow":
      ctx.moveTo(-4.5, -3.5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-4.5, 3.5);
      break;
    case "chevron2":
      ctx.moveTo(-7.5, -3.2);
      ctx.lineTo(-3.5, 0);
      ctx.lineTo(-7.5, 3.2);
      ctx.moveTo(-4, -3.2);
      ctx.lineTo(0, 0);
      ctx.lineTo(-4, 3.2);
      break;
    case "circle":
      ctx.moveTo(1, 0);
      ctx.arc(-2, 0, 3, 0, Math.PI * 2);
      break;
    case "diamond":
      ctx.moveTo(-6.5, 0);
      ctx.lineTo(-3, -3.2);
      ctx.lineTo(0.5, 0);
      ctx.lineTo(-3, 3.2);
      ctx.closePath();
      break;
    case "square":
      ctx.rect(-5.6, -2.8, 5.6, 5.6);
      break;
    case "bar":
      ctx.moveTo(-1.5, -4);
      ctx.lineTo(-1.5, 4);
      break;
  }
}

/** Canvas 2D can't read var() — so the canvas resolves the app's theme
 * tokens into plain colors once per theme change (aesthetics review P0:
 * the DOM legend flipped with the theme while the canvas stayed
 * dark-tuned; near-white labels would vanish on the light themes the
 * shared appearance dialog offers). Kind hues WITHOUT kit tokens stay
 * constant mid-tones (legible on both theme groups); the kit-covered
 * kinds and every NEUTRAL (labels, node cores, topology grays) resolve
 * live. Defaults below = the observer-night values, so a bare canvas
 * (tests, demo) renders exactly as before. */
type Rgb = [number, number, number];
const CANVAS_THEME = {
  text: [226, 232, 240] as Rgb, // node labels, selection halos
  dim: [148, 168, 194] as Rgb, // topology grays (structural edges, cold trails)
  core: "#232a35", // ghost-node core fill
  bg: [11, 15, 20] as Rgb, // diary ring contrast stroke
  accent: [232, 165, 74] as Rgb, // "warm now" edge flash
  scar: [224, 85, 85] as Rgb,
  bond: [240, 192, 96] as Rgb,
  standing: [192, 132, 221] as Rgb,
  warm: [110, 220, 160] as Rgb, // the usage scale's green end (most used)
  cold: [71, 76, 82] as Rgb, // the usage scale's dark-grey end (rarely used): coldOf(bg, text)
};

function parseCssColor(raw: string): Rgb | null {
  const v = raw.trim();
  if (!v) return null;
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const short = v.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    const [r, g, b] = short[1].split("");
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function rgbaOf(t: Rgb, a: number): string {
  return `rgba(${t[0]}, ${t[1]}, ${t[2]}, ${a})`;
}

/** Re-read the resolved app tokens (they alias kit theme tokens). Called
 * on mount and whenever the documentElement's theme class changes; only
 * successfully parsed values are applied, so a missing token keeps the
 * dark default rather than corrupting the palette. */
export function resolveCanvasTheme(): void {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return;
  try {
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string): Rgb | null => parseCssColor(cs.getPropertyValue(name));
    const assign = (key: keyof typeof CANVAS_THEME, name: string) => {
      const v = read(name);
      if (v) (CANVAS_THEME[key] as Rgb) = v;
    };
    assign("text", "--text");
    assign("dim", "--text-dim");
    assign("bg", "--bg");
    assign("accent", "--ea-accent");
    assign("scar", "--scar");
    assign("bond", "--bond");
    assign("standing", "--standing");
    assign("warm", "--adm-both");
    CANVAS_THEME.cold = coldOf(CANVAS_THEME.bg, CANVAS_THEME.text) as Rgb;
    const core = read("--bg-raise");
    if (core) CANVAS_THEME.core = rgbaOf(core, 1);
    // Kit-covered kinds follow the theme so the DOM legend and the canvas
    // never diverge; extended kinds keep their constant mid-tones.
    const kindToken: Array<[string, string]> = [
      ["identity", "--identity"],
      ["memory", "--memory"],
      ["episode", "--memory"],
      ["diary", "--diary"],
      ["standing", "--standing"],
    ];
    for (const [kind, token] of kindToken) {
      const v = read(token);
      if (v) KIND_COLORS[kind] = rgbaOf(v, 1);
    }
    const admToken: Array<[string, string]> = [
      ["self", "--adm-self"],
      ["stm", "--adm-stm"],
      ["stimulus", "--adm-stimulus"],
      ["both", "--adm-both"],
    ];
    for (const [adm, token] of admToken) {
      const v = read(token);
      if (v) ADMISSION_COLORS[adm] = rgbaOf(v, 1);
    }
  } catch {
    // keep current palette — a resolution failure must never blank the canvas
  }
}

/** Quiet grey for typed topology. Kept deliberately faint (operator
 * 2026-07-15 (f): the graph was an unreadable hairball at 0.5) — the
 * topology should be a whisper the eye can see THROUGH; hover/selection
 * lifts the touched edges to full strength via edgeDim. */

function nodeClass(node: NodeState): string {
  if (node.diary) return "diary";
  // Bookkeeping markers are kind="claim" like identity claims, but the
  // engine keeps them OFF the self (self_component excludes
  // attributes.bookkeeping) — drawing them on the identity ring would
  // misstate who he is. They seat with the free memories, in engine gray.
  if (node.bookkeeping) return "bookkeeping";
  if (IDENTITY_KINDS.has(node.kind)) return "identity";
  if (KIND_COLORS[node.kind]) return node.kind;
  return "unknown";
}

/** The disc's lane rule: identity keeps its ring, diary its shelf;
 * everything else is a free memory of the disc (topics group these). */
function isFreeNode(node: NodeState): boolean {
  const cls = nodeClass(node);
  return cls !== "identity" && cls !== "diary";
}

/** Topic labels: hidden when zoomed out so far they would crowd; a halo
 * smaller than this on screen carries no label either. */
const TOPIC_LABEL_MIN_ZOOM = 0.16;
const TOPIC_LABEL_MIN_SCREEN_R = 24;
/** A label line's width before it wraps (two lines at most). */
const TOPIC_LABEL_MAX_W = 220;
const TOPIC_LABEL_LINE_H = 14;
/** Halo margin around the furthest member (world px). */
const TOPIC_HALO_PAD = 16;

function hexAlpha(hex: string, a: number): string {
  const rgb = parseCssColor(hex);
  return rgb ? rgbaOf(rgb, a) : hex;
}

function nodeRadius(node: NodeState): number {
  const base = node.kind === "relation" ? 2.5 : 4;
  return base + Math.min(9, Math.log1p(node.selected_count) * 3);
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

// World-space anchor geometry: CONSTANTS, never viewport/zoom-derived.
// The adversarial stability review's biggest find: anchors computed from
// viewR re-pulled the whole layout on every zoom and resize — spatial
// memory was being rewritten by the camera. World coordinates are the
// durable reference; the camera only looks at them.
const WORLD_IDENTITY_R = 110;
const WORLD_STANDING_R = 360;
const WORLD_DIARY_Y = 320;
const WORLD_DIARY_SLOT = 44;
/** Diary shelf wraps into rows: fixed-left slots at 57+ entries grew a
 * 2600px tail that smeared the whole layout (maintainer screenshot,
 * 2026-07-07 22:03). Wrapping keeps the lane BOUNDED; slots stay stable
 * per birth index, so old entries never move. */
const DIARY_SHELF_COLS = 14;
const DIARY_SHELF_ROW_H = 40;

/** Phyllotaxis seating for free memories (episodes/summaries/dreams/…):
 * seat i sits at golden-angle position — compact sunflower packing that
 * GROWS AT THE RIM. A memory's seat is assigned once at first sight and
 * never changes: permanent spatial memory with bounded growth, instead of
 * free-floating nodes that springs (written_amid, continues) can drag
 * into streaks. The force sim relaxes locally AROUND seats. */
const GOLDEN_ANGLE = 2.399963229728653;
const PHYLLO_INNER_R = 175; // outside the identity ring
// Nearest-neighbor distance ≈ spacing. At 48px the repulsion between two
// typical nodes is ~0.14 px/tick — a 0.1-strength anchor counters that
// within ~1.4px, so seats HOLD and the disc stays readable (at 30px the
// field inflated the disc into webs; verified live 2026-07-07).
const PHYLLO_SPACING = 48;

function phyllotaxisSeat(i: number): { x: number; y: number } {
  const r = PHYLLO_INNER_R + PHYLLO_SPACING * Math.sqrt(i);
  const a = i * GOLDEN_ANGLE;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

/** Layout persistence (P0-4): the same memory in the same place across
 * reloads. Positions are presentation, not truth — safe to persist.
 * v2: phyllotaxis seats + seat indexes (v1 free-float positions would
 * fight the new anchors). */
function layoutStorageKey(key: string): string {
  return `abstractentity_layout_v2:${key}`;
}

/** Topic homes + colours remembered per life (presentation, like the
 * layout): a refetch or a reload keeps every persisting topic in place. */
function topicSlotsStorageKey(key: string): string {
  return `abstractentity_topic_homes_v1:${key}`;
}

/** SPATIAL MEMORY MIGRATION (repo split 2026-07-12): this app used to ship
 * inside abstractobserver and — served on the same origin (the entity
 * launcher's port) — its saved layouts live under the old spelling. Layout
 * anchors are a durable operator artifact (never rewrite them on a rename),
 * so a missing new-key read adopts the old-key value once. */
function readStoredLayout(key: string): string | null {
  const fresh = localStorage.getItem(layoutStorageKey(key));
  if (fresh !== null) return fresh;
  return localStorage.getItem(`abstractobserver_entity_layout_v2:${key}`);
}

/** A phone-width viewport (the canvas is short: the Context legend starts
 * folded there). */
function narrowViewport(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 599.98px)").matches;
  } catch {
    return false;
  }
}

/** The one card on screen: a memory's (node id) or a topic label's. */
type CardAt =
  | { kind: "node"; id: string; x: number; y: number; pinned: boolean }
  | { kind: "topic"; topic: number; x: number; y: number; pinned: boolean };

/** How long a card holds after the pointer leaves its memory — the time to
 * cross into the card and reach its actions. */
const CARD_GRACE_MS = 320;

export function GraphCanvas({
  fold,
  temporal,
  scrubSeq,
  selectedId,
  searchIds,
  focusToken,
  layoutKey,
  onSelect,
  gatewaySource,
  showTopics,
  showContext,
  onPickTopic,
  onShowInBook,
  height,
}: GraphCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<Map<string, LayoutNode>>(new Map());
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1.05 });
  // RECALL HIGHLIGHT (operator 2026-11-07, 2026-11-08): the beat active at
  // the scrub position lights its shelf through the SAME emphasis/dim
  // mechanism as hover, and STAYS lit after his answer until the next
  // recall replaces it; the "Context" toggle is the one control (off = the
  // plain graph) (recall_emphasis.ts). A recall line picked in the ledger
  // (selection "beat:…") lights that beat. Recomputed per fold change,
  // never per frame.
  // The selection as the CANVAS knows it: a memory opened by its graph id
  // (a ledger moment in Live) resolves to its row id exactly like the
  // Inspector does (fold.graph_to_row) — otherwise the canvas would not
  // see a selection and the recall would keep lighting the graph.
  const selectedRow = resolveSelection(fold, selectedId);
  const recall = useMemo(() => canvasRecall(fold, scrubSeq, selectedId, showContext), [fold, scrubSeq, selectedId, showContext]);
  // THE LIT LINES' WORDS (operator 2026-11-09): each travelled line's
  // direction (shelf memory -> recalled memory) and relation word, once
  // per recall — the frame and the pointer only read it.
  const litLines = useMemo(() => travelledLines(fold, recall), [fold, recall]);
  // THE USAGE SCALE: one rank per memory and per co-use line, per fold
  // change (never per frame).
  const usage = useMemo(() => usageScale(fold, temporal), [fold, temporal]);
  // TOPICS AS THE NATURAL LAYOUT (operator 2026-11-07): the served
  // communities give every topic a home and its memories seats inside it
  // (topic_layout.ts); the force sim pulls each memory to its seat with
  // the same anchor strength the global seats use. Homes depend on the
  // payload only (stable under scrub); seats per fold change.
  const { state: topicsState, retry: retryTopics } = useCommunities(gatewaySource, fold.nodes.size);
  const topicsData = topicsState.phase === "ready" ? topicsState.data : null;
  // Homes are STABLE: planned against the slots remembered from the last
  // fetch (and from storage after a reload) — a persisting topic keeps
  // its place and colour (topic_layout.planTopicHomes). `topicResetN`
  // re-plans from scratch after ⟲ reset.
  const topicSlotsRef = useRef<TopicSlot[]>([]);
  const [topicResetN, setTopicResetN] = useState(0);
  const topicHomes = useMemo(
    () => (topicsData ? planTopicHomes(topicsData.communities, topicSlotsRef.current) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topicsData, topicResetN],
  );
  useEffect(() => {
    if (!topicHomes) return;
    topicSlotsRef.current = topicSlotsOf(topicHomes);
    const key = layoutKeyRef.current;
    if (!key) return;
    try {
      localStorage.setItem(topicSlotsStorageKey(key), JSON.stringify(topicSlotsRef.current));
    } catch {
      // Quota/private mode: stability then holds for this session only.
    }
  }, [topicHomes]);
  // A topic's words as a person reads them: a raw diary entry id in the
  // runtime's keywords becomes that entry's title, else "a diary entry".
  const topicWords = useMemo(() => {
    const out = new Map<number, { label: string; keywords: string }>();
    if (!topicHomes) return out;
    const entryTitle = entryTitleOf(fold);
    for (const h of topicHomes) {
      out.set(h.id, {
        label: readableTopicLabel(h.label, entryTitle),
        keywords: (h.keywords.length ? h.keywords : h.label.split(", ")).map((k) => readableKeyword(k, entryTitle)).join(", "),
      });
    }
    return out;
  }, [topicHomes, fold]);
  const topicPlan = useMemo(
    () => (topicsData && topicHomes && topicHomes.length > 0 ? planTopicSeats(fold, topicsData.communities, topicHomes, isFreeNode) : null),
    [fold, topicsData, topicHomes],
  );
  const topicsPending = topicsState.phase === "loading";
  const stateRef = useRef({ fold, temporal, usage, scrubSeq, selectedId: selectedRow, searchIds, recall, litLines, topicPlan, showTopics, topicsPending, topicWords });
  /** Topic label rects drawn last frame (screen px) — the click targets. */
  const topicLabelsRef = useRef<Array<{ rect: Rect; topic: number; label: string }>>([]);
  const onPickTopicRef = useRef(onPickTopic);
  onPickTopicRef.current = onPickTopic;
  /** While the first topics answer is on its way, the sim holds (≤ 3 s) so
   * a restored layout does not drift toward seats it is about to leave. */
  const topicsPendingSinceRef = useRef<number | null>(null);
  useEffect(() => {
    topicsPendingSinceRef.current = topicsPending ? performance.now() : null;
  }, [topicsPending]);
  /** Last frame time the recall drove the emphasis (ease-out pacing). */
  const recallDriveAtRef = useRef<number | null>(null);
  const hoverRef = useRef<string | null>(null);
  /** The lit lines the LAST FRAME drew (null when the recall does not
   * drive the canvas): what a pointer resting on a line can be over. */
  const shownLinesRef = useRef<Map<string, TravelledLine> | null>(null);
  /** The lit-line tooltip (the line's words beside the pointer), after the
   * pointer has rested on the line (hover_intent.ts). */
  const [lineTip, setLineTipState] = useState<{ key: string; x: number; y: number } | null>(null);
  const lineTipRef = useRef<{ key: string; x: number; y: number } | null>(null);
  const setLineTip = (next: { key: string; x: number; y: number } | null) => {
    if (lineTipRef.current === next || (lineTipRef.current && next && lineTipRef.current.key === next.key)) return;
    lineTipRef.current = next;
    setLineTipState(next);
  };
  const setLineTipRef = useRef(setLineTip);
  setLineTipRef.current = setLineTip;
  /** Per-element eased dim factors (hover-card show/hide transition). */
  const dimAnimRef = useRef<Map<string, number>>(new Map());
  const lastFrameTsRef = useRef<number>(performance.now());
  /** The cursor's live CLIENT position over the canvas (null = outside).
   * Read by the RAF loop for the label area-of-influence (laurent dm#30:
   * "there is an area of influence around the cursor — when it moves
   * close enough to nodes, they show their names"); a ref, never state
   * (per-mousemove setState would re-render the app per pixel). */
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  /** The small memory card beside the cursor (maintainer ask, 2026-07-08):
   * set when the hovered node CHANGES (never per mousemove — no jitter). */
  // THE CARD (one at a time): a memory's or a topic label's. It follows
  // the pointer, holds while the pointer crosses into it (CARD_GRACE_MS)
  // so its actions can be clicked, and is PINNED after a tap on a touch
  // screen (it stays until a tap elsewhere, an action, or Escape).
  const [card, setCardState] = useState<CardAt | null>(null);
  const cardRef = useRef<CardAt | null>(null);
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const graceRef = useRef<number | null>(null);
  const pointerTypeRef = useRef<string>("mouse");
  const cardCtl = useRef({
    set(next: CardAt | null) {
      cardRef.current = next;
      setCardState(next);
    },
    cancelGrace() {
      if (graceRef.current !== null) window.clearTimeout(graceRef.current);
      graceRef.current = null;
    },
    close() {
      this.cancelGrace();
      hoverRef.current = null;
      this.set(null);
    },
    closeSoon() {
      if (graceRef.current !== null) return;
      graceRef.current = window.setTimeout(() => {
        graceRef.current = null;
        if (!cardRef.current?.pinned) {
          hoverRef.current = null;
          cardCtl.set(null);
        }
      }, CARD_GRACE_MS);
    },
  }).current;
  const dragRef = useRef<{ x: number; y: number; moved: boolean; card: CardAt | null } | null>(null);
  const onSelectRef = useRef(onSelect);
  // Cooling state (P0-2/3): alpha decays toward freeze; arrivals reheat.
  const simRef = useRef({ alpha: 1, frozen: false, lastSaveAt: 0, autoFitDone: false, lastCount: 0, stableFrames: 0 });
  const reducedMotionRef = useRef(false);
  /** The topic homes the layout last adopted (reheat on change). */
  const topicHomesSeenRef = useRef<unknown>(null);
  // The Context legend: unfolded on a wide screen, folded on a phone; the
  // reader's fold/unfold holds for this view.
  const [legendOpen, setLegendOpen] = useState(() => !narrowViewport());
  const [motionUi, setMotionUi] = useState<"live" | "frozen">("live");
  /** Phyllotaxis seat per node id — assigned once at first sight, kept
   * for the node's lifetime (and persisted): permanent spatial memory. */
  const seatRef = useRef<{ seats: Map<string, number>; next: number }>({ seats: new Map(), next: 0 });

  stateRef.current = { fold, temporal, usage, scrubSeq, selectedId: selectedRow, searchIds, recall, litLines, topicPlan, showTopics, topicsPending, topicWords };
  onSelectRef.current = onSelect;

  // FIT-TO-EMPHASIS (graph-access wave, 2026-07-12): when the OPERATOR's
  // intent changes (lens switch, search commit — carried by focusToken), the
  // camera frames the currently emphasized nodes once. Retries briefly while
  // the layout is still materializing (progressive boot), then gives up —
  // a recorded-signature approach silently swallowed the fit forever when
  // the first attempt found no layout (adversary P1). World positions stay
  // untouched (spatial memory rule); only the camera moves.
  const focusIdsRef = useRef<Set<string> | null>(null);
  focusIdsRef.current = searchIds;
  useEffect(() => {
    if (!focusToken) return;
    let cancelled = false;
    let attempts = 0;
    const try_fit = () => {
      if (cancelled) return;
      attempts += 1;
      const ids = focusIdsRef.current;
      if (ids && ids.size > 0) {
        const layout = layoutRef.current;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, found = 0;
        for (const id of ids) {
          const ln = layout.get(id);
          if (!ln) continue;
          found += 1;
          minX = Math.min(minX, ln.x); maxX = Math.max(maxX, ln.x);
          minY = Math.min(minY, ln.y); maxY = Math.max(maxY, ln.y);
        }
        const rect = canvasRef.current?.getBoundingClientRect();
        if (found && rect && rect.width >= 10) {
          const cam = cameraRef.current;
          cam.x = (minX + maxX) / 2;
          cam.y = (minY + maxY) / 2;
          const spanX = Math.max(140, maxX - minX + 180);
          const spanY = Math.max(140, maxY - minY + 180);
          cam.zoom = Math.min(4, Math.max(0.12, Math.min(rect.width / spanX, rect.height / spanY)));
          return; // fitted — stop retrying
        }
      }
      if (attempts < 10) window.setTimeout(try_fit, 300);
    };
    try_fit();
    return () => {
      cancelled = true;
    };
  }, [focusToken]);

  // The RAF frame reads the CURRENT key through this ref (F7 — the loop
  // closure is mount-time; the prop inside it is frozen at first render).
  const layoutKeyRef = useRef(layoutKey);
  layoutKeyRef.current = layoutKey;

  // Load persisted positions + seats once per layout key.
  useEffect(() => {
    layoutRef.current = new Map();
    seatRef.current = { seats: new Map(), next: 0 };
    simRef.current.alpha = 1;
    simRef.current.autoFitDone = false;
    topicSlotsRef.current = [];
    if (!layoutKey) return;
    try {
      topicSlotsRef.current = parseTopicSlots(localStorage.getItem(topicSlotsStorageKey(layoutKey)));
    } catch {
      topicSlotsRef.current = [];
    }
    try {
      const raw = readStoredLayout(layoutKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as {
        nodes?: Array<{ id: string; x: number; y: number }>;
        seats?: Array<[string, number]>;
        next?: number;
      };
      for (const s of stored.nodes ?? []) {
        layoutRef.current.set(s.id, { id: s.id, x: s.x, y: s.y, vx: 0, vy: 0, r: 4 });
      }
      for (const [key, seat] of stored.seats ?? []) {
        seatRef.current.seats.set(key, seat);
        seatRef.current.next = Math.max(seatRef.current.next, seat + 1);
      }
      if (typeof stored.next === "number") {
        seatRef.current.next = Math.max(seatRef.current.next, stored.next);
      }
      // Restored layouts start nearly settled: brief alpha to absorb drift.
      simRef.current.alpha = 0.15;
    } catch {
      // Corrupt storage: start fresh (positions are presentation only).
    }
  }, [layoutKey]);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  // Center the camera on selection changes (P0-6: "find the node again").
  useEffect(() => {
    if (!selectedRow) return;
    const ln = layoutRef.current.get(selectedRow);
    if (ln) {
      cameraRef.current.x = ln.x;
      cameraRef.current.y = ln.y;
    }
  }, [selectedRow]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let disposed = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Theme tokens → plain canvas colors, re-resolved when the kit's
    // applyTheme swaps the documentElement theme-* class. The RAF loop
    // reads CANVAS_THEME every frame, so the swap lands next frame.
    resolveCanvasTheme();
    const themeObserver = new MutationObserver(() => resolveCanvasTheme());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const frame = () => {
      if (disposed) return;
      const { fold, usage, scrubSeq, selectedId, searchIds, recall, litLines, topicPlan: plan, showTopics: topicsOn, topicsPending: pending, topicWords } = stateRef.current;
      const layout = layoutRef.current;
      const sim = simRef.current;

      // ---- sync layout population with the fold (stable world anchors) --
      // The fold is already prefix-limited to the scrub seq, so everything
      // in it exists "now"; layout only mirrors membership. Anchors are
      // WORLD constants: zoom/resize never move a single node.
      const diaryLane: LayoutNode[] = [];
      const liveIds = new Set<string>();
      const seats = seatRef.current;
      let arrivals = 0;
      for (const node of fold.nodes.values()) {
        liveIds.add(node.id);
        let ln = layout.get(node.id);
        const cls = nodeClass(node);
        const isFree = cls !== "identity" && cls !== "diary";
        // Every free memory gets a PERMANENT phyllotaxis seat at first
        // sight — compact sunflower packing, grows at the rim, never
        // rearranges (the fixed-slot diary tail + free-floating episodes
        // smeared the layout once written_amid edges landed). Seats key
        // on graph_id when known: row-id re-keys must not reseat a node.
        const seatKey = node.graph_id ?? node.id;
        if (isFree && !seats.seats.has(seatKey)) {
          // graph_id learned after first sight: migrate the row-id seat
          // instead of assigning a new one (the node must not jump).
          const rowSeat = seats.seats.get(node.id);
          if (seatKey !== node.id && rowSeat !== undefined) {
            seats.seats.set(seatKey, rowSeat);
          } else {
            seats.seats.set(seatKey, seats.next);
            seats.next += 1;
          }
        }
        if (!ln) {
          // A memory with a topic seat is BORN there (no glide across the
          // disc); otherwise at its global seat as before.
          const seat = isFree ? plan?.anchorOf.get(node.id) ?? phyllotaxisSeat(seats.seats.get(seatKey) ?? 0) : null;
          const seed = seat ?? seedPosition(node.id, WORLD_IDENTITY_R);
          ln = { id: node.id, x: seed.x, y: seed.y, vx: 0, vy: 0, r: nodeRadius(node) };
          layout.set(node.id, ln);
          arrivals += 1;
        }
        ln.r = nodeRadius(node);
        if (cls === "identity") {
          const angle = hash01(node.id, 7) * Math.PI * 2;
          ln.anchor = { x: Math.cos(angle) * WORLD_IDENTITY_R, y: Math.sin(angle) * WORLD_IDENTITY_R, strength: 0.02 };
        } else if (cls === "diary") {
          diaryLane.push(ln);
        } else {
          // Strength 0.1 beats the spring cap (1.6) at ~16px displacement:
          // springs can pull a node toward its relations by a visible nudge,
          // but the seat owns the position (readable, stable disc). With
          // topics, the seat is the memory's seat in its topic's home (or,
          // unclustered, among its relations) — same strength, so the
          // relation springs keep exactly the say they had.
          const topicSeat = plan?.anchorOf.get(node.id);
          if (topicSeat) {
            ln.anchor = { x: topicSeat.x, y: topicSeat.y, strength: TOPIC_SEAT_STRENGTH };
          } else {
            const seat = phyllotaxisSeat(seats.seats.get(seatKey) ?? 0);
            if (plan) {
              // Unclustered with no relation into a topic: no topic pull —
              // it keeps its seat's bearing on the rim outside the homes.
              const d = Math.hypot(seat.x, seat.y) || 1;
              const rim = Math.max(d, plan.extent + 60);
              ln.anchor = { x: (seat.x / d) * rim, y: (seat.y / d) * rim, strength: 0.1 };
            } else {
              ln.anchor = { x: seat.x, y: seat.y, strength: 0.1 };
            }
          }
        }
      }
      // Lane radius: the phyllotaxis disc grows as sqrt(seats), so outer
      // lanes derive from the MONOTONIC seat counter, quantized to 80px
      // steps — they step outward rarely and never move back in.
      // With topics the disc IS the homes (+ the unclustered rim), so the
      // lanes step outside THAT — payload-derived, stable under scrub.
      const discR = plan ? plan.extent + 60 : PHYLLO_INNER_R + PHYLLO_SPACING * Math.sqrt(Math.max(1, seats.next));
      const laneR = Math.max(WORLD_STANDING_R, Math.ceil((discR + 70) / 80) * 80);
      // The diary SHELF: fixed slots by birth order, WRAPPED into rows —
      // bounded width; existing entries never move; new rows grow down.
      diaryLane.sort((a, b) => (fold.nodes.get(a.id)?.first_seq ?? 0) - (fold.nodes.get(b.id)?.first_seq ?? 0));
      const shelfWidth = DIARY_SHELF_COLS * WORLD_DIARY_SLOT;
      diaryLane.forEach((ln, i) => {
        const col = i % DIARY_SHELF_COLS;
        const row = Math.floor(i / DIARY_SHELF_COLS);
        ln.anchor = {
          x: col * WORLD_DIARY_SLOT - shelfWidth / 2,
          y: Math.max(WORLD_DIARY_Y, laneR + 40) + row * DIARY_SHELF_ROW_H,
          strength: 0.06,
        };
      });
      // Standing targets: feelings about a RECORD attach to its node; free
      // identity strings orbit the top arc at a HASH-STABLE angle — a new
      // feeling never rearranges the existing ones.
      const recordStanding = new Map<string, StandingState>();
      for (const standing of fold.standings.values()) {
        const t = standing.target_id;
        const rowId = fold.graph_to_row.get(t) ?? t;
        const targetNode = fold.nodes.get(rowId);
        if (targetNode) {
          recordStanding.set(targetNode.id, standing);
          continue;
        }
        const id = `standing:${t}`;
        liveIds.add(id);
        let ln = layout.get(id);
        if (!ln) {
          ln = { id, x: 0, y: -laneR, vx: 0, vy: 0, r: 6 };
          layout.set(id, ln);
          arrivals += 1;
        }
        const arc = Math.PI * 0.9;
        const angle = -Math.PI / 2 - arc / 2 + arc * hash01(t, 9);
        ln.anchor = { x: Math.cos(angle) * laneR, y: Math.sin(angle) * laneR, strength: 0.06 };
      }
      for (const id of Array.from(layout.keys())) {
        if (!liveIds.has(id)) layout.delete(id);
      }

      // Edges: the fold is prefix-limited, so every edge in it exists now.
      const edges: LayoutEdge[] = [];
      for (const e of fold.edges.values()) {
        if (!layout.has(e.a) || !layout.has(e.b)) continue;
        // With topics, a usage trail across two topics is drawn but does
        // not pull (topic_layout.trailPulls: position by topic, warmth by
        // colour); engraved relations below always pull.
        if (!trailPulls(plan, e.a, e.b)) continue;
        edges.push({ a: e.a, b: e.b, weight: e.count });
      }
      // Structural ("born linked") edges: weak springs + faint draw. Graph
      // ids resolve through graph_to_row at draw time (re-key safe).
      const structuralResolved: Array<{ a: string; b: string; relation: string }> = [];
      for (const se of fold.structural_edges.values()) {
        const a = fold.graph_to_row.get(se.source_graph_id) ?? se.source_graph_id;
        const b = fold.graph_to_row.get(se.target_graph_id) ?? se.target_graph_id;
        if (!layout.has(a) || !layout.has(b) || a === b) continue;
        structuralResolved.push({ a, b, relation: se.relation });
        edges.push({ a, b, weight: 0.4 });
      }

      // ---- cooling: place with energy, then HOLD STILL (P0-2/3) ----
      // Arrivals reheat gently (skipped under prefers-reduced-motion:
      // neighbor seeding already placed them sensibly).
      if (arrivals > 0 && !reducedMotionRef.current && !sim.frozen) {
        sim.alpha = Math.max(sim.alpha, 0.25);
      }
      const nodes = Array.from(layout.values());
      // New topic homes (first answer, or a refresh that regrouped): the
      // memories glide to their seats — a reheat, or under reduced motion
      // a direct placement. A frozen layout stays frozen.
      if (plan?.homes !== topicHomesSeenRef.current) {
        topicHomesSeenRef.current = plan?.homes ?? null;
        if (plan && !sim.frozen) {
          if (reducedMotionRef.current) {
            for (const [id, seat] of plan.anchorOf) {
              const ln = layout.get(id);
              if (ln) {
                ln.x = seat.x;
                ln.y = seat.y;
                ln.vx = 0;
                ln.vy = 0;
              }
            }
          } else {
            sim.alpha = Math.max(sim.alpha, 0.6);
          }
        }
      }
      const holdForTopics = pending && topicsPendingSinceRef.current !== null && performance.now() - topicsPendingSinceRef.current < 3000;
      if (!sim.frozen && !holdForTopics && sim.alpha > 0.02) {
        tickForces(nodes, edges, DEFAULT_FORCE_PARAMS, Math.min(1, sim.alpha));
        sim.alpha *= maxVelocity(nodes) < 0.05 ? 0.85 : 0.995;
      }
      // One-time auto-fit once the graph has substance AND membership has
      // settled (~0.5s without new nodes): fitting on the first few
      // envelopes framed a half-loaded world.
      if (!sim.autoFitDone && nodes.length > 3) {
        sim.stableFrames = nodes.length === sim.lastCount ? sim.stableFrames + 1 : 0;
        sim.lastCount = nodes.length;
      }
      if (!sim.autoFitDone && nodes.length > 3 && sim.stableFrames >= 30) {
        sim.autoFitDone = true;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of nodes) {
          minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
          minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
        }
        const rect = canvas.getBoundingClientRect();
        const cam0 = cameraRef.current;
        cam0.x = (minX + maxX) / 2;
        cam0.y = (minY + maxY) / 2;
        const spanX = Math.max(120, maxX - minX + 160);
        const spanY = Math.max(120, maxY - minY + 160);
        cam0.zoom = Math.min(6, Math.max(0.12, Math.min(rect.width / spanX, rect.height / spanY)));
      }
      // Persist settled positions (debounced): same memory, same place,
      // across reloads. The key is read from a LIVE ref (code adversary
      // F7): this RAF closure mounts once with the FIRST render's
      // layoutKey ("demo life — Castor"), so reading the prop saved every
      // gateway life's spatial memory under the demo's key — positions
      // were never found again on reload.
      const liveLayoutKey = layoutKeyRef.current;
      const nowMs = performance.now();
      if (liveLayoutKey && sim.alpha <= 0.02 && nowMs - sim.lastSaveAt > 5000) {
        sim.lastSaveAt = nowMs;
        try {
          localStorage.setItem(
            layoutStorageKey(liveLayoutKey),
            JSON.stringify({
              nodes: nodes.map((n) => ({
                id: n.id,
                x: Math.round(n.x * 10) / 10,
                y: Math.round(n.y * 10) / 10,
              })),
              seats: Array.from(seats.seats.entries()),
              next: seats.next,
            }),
          );
        } catch {
          // Quota/private mode: persistence is best-effort presentation.
        }
      }

      // ------------------------------------------------ draw
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cam = cameraRef.current;
      const toScreen = (x: number, y: number) => ({
        x: w / 2 + (x - cam.x) * cam.zoom,
        y: h / 2 + (y - cam.y) * cam.zoom,
      });

      // Edge recency window: measured in seq distance (truthful under scrub).
      const pulseWindow = 14;

      // Emphasis: search/lens matches win; otherwise the hovered/selected
      // node's neighborhood. Everything outside the emphasis set dims.
      // An EMPTY non-null set engages too: "no dreams in this life" must
      // LOOK empty (dim everything) — falling through to no-filter made
      // empty lenses read as broken buttons (adversary P1).
      //
      // SELECTION ISOLATES (laurent 12:23, c1405 ask 2a: "selecting a node
      // highlights everything — unreadable"): a hub node in a co-use-dense
      // life has hundreds of neighbors, so the neighborhood is capped to
      // the TOP strongest connections (by trail weight; structural edges
      // always kept — they are few and typed). The selection shows the
      // node's REAL closest company, not the whole graph lit up.
      const NEIGHBOR_CAP = 14;
      let emphasis: Set<string> | null = null;
      const focus = hoverRef.current ?? selectedId;
      // ONE mechanism, ordered triggers (recall_emphasis.emphasisDriver):
      // lens/search/topic filter > hovered/selected node > current recall.
      const driver = emphasisDriver({
        filter: searchIds !== null,
        hover: hoverRef.current !== null && layout.has(hoverRef.current),
        selected: selectedId !== null && layout.has(selectedId),
        recall: recall !== null,
      });
      if (driver === "filter") {
        emphasis = searchIds;
      } else if (driver === "recall" && recall) {
        emphasis = recall.ids;
      } else if (driver === "focus") {
        if (focus && layout.has(focus)) {
          emphasis = new Set([focus]);
          const weighted: Array<{ id: string; w: number }> = [];
          for (const e of fold.edges.values()) {
            if (e.a === focus) weighted.push({ id: e.b, w: e.count });
            else if (e.b === focus) weighted.push({ id: e.a, w: e.count });
          }
          weighted.sort((x, y) => y.w - x.w);
          for (const { id } of weighted.slice(0, NEIGHBOR_CAP)) emphasis.add(id);
          for (const se of structuralResolved) {
            if (se.a === focus) emphasis.add(se.b);
            if (se.b === focus) emphasis.add(se.a);
          }
        }
      }
      // Dim TRANSITION (laurent 2026-07-17: "allow a 0.5 transition for
      // the other unconnected edges and nodes to gradually decrease their
      // transparency" when the hover card shows/hides). Targets stay the
      // instant emphasis-set values; the RENDERED dim eases toward the
      // target over ~0.5s (time-based linear ramp, frame-rate independent).
      // One shared factor per element id, kept across frames in dimAnimRef;
      // entries at rest (==1) are dropped so the map never grows unbounded.
      const now = performance.now();
      const dtSec = Math.min(0.1, Math.max(0.001, (now - lastFrameTsRef.current) / 1000));
      lastFrameTsRef.current = now;
      // Hover keeps its 0.5 s sweep; a recall eases in AND out over 0.6 s
      // (the release keeps the arrival pace for one ramp after it stops).
      if (driver === "recall") recallDriveAtRef.current = now;
      const DIM_RAMP_PER_SEC = 1 / dimRampSec(now, recallDriveAtRef.current);
      const anim = dimAnimRef.current;
      const easedDim = (key: string, target: number): number => {
        const cur = anim.get(key) ?? 1;
        if (cur === target) {
          if (target === 1) anim.delete(key);
          return target;
        }
        const step = DIM_RAMP_PER_SEC * dtSec;
        const next = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
        if (next === 1) anim.delete(key);
        else anim.set(key, next);
        return next;
      };
      const nodeDim = (id: string) => easedDim(id, emphasis && !emphasis.has(id) ? DIMMED_NODE : 1);
      // Under the RECALL only the paths travelled to reach this step's
      // memories stay lit, in the colour of their ring (recall_emphasis
      // .edgeDimTarget / RecallEmphasis.travelled); null for every other
      // driver. Co-use edges ease under their own key; born-linked edges
      // under an "s" key, so the two never fight over one eased value.
      const travelled = driver === "recall" && recall ? recall.travelled : null;
      shownLinesRef.current = travelled ? litLines : null;
      const edgeDim = (a: string, b: string, pairKey: string | null) =>
        easedDim(pairKey ?? `s\u0000${a}\u0000${b}`, edgeDimTarget(emphasis, travelled, a, b, pairKey));

      // The search/lens overlay floats over the canvas top-left — text
      // drawn under it becomes unreadable double-exposure (both review
      // lanes flagged labels crossing the pills). Nodes still render there
      // (position is truth); only their LABELS wait until they leave the band.
      const cssW = canvas.width / (window.devicePixelRatio || 1);
      const overlayBand = (x: number, y: number): boolean => y < 104 && x < Math.min(820, cssW);

      // TOPIC HALOS + LABELS (the "topics" toggle): a soft circle around
      // each topic's members where they are NOW, its label just outside —
      // placed only where it covers no node and no other label, never
      // under the overlays; hidden when zoomed far out. Drawn first, under
      // every edge and node. A topic with no emphasized member dims with
      // the rest (same eased dim as nodes).
      const cssH = canvas.height / (window.devicePixelRatio || 1);
      const topicHalos: Array<{ label: string; topic: number; color: string; cx: number; cy: number; r: number; hd: number }> = [];
      if (topicsOn && plan) {
        for (const home of plan.homes) {
          const ids = plan.membersOf.get(home.id);
          if (!ids || ids.length === 0) continue;
          const pts: Array<{ x: number; y: number; r: number }> = [];
          let lit = false;
          for (const id of ids) {
            const ln = layout.get(id);
            if (!ln) continue;
            pts.push({ x: ln.x, y: ln.y, r: ln.r });
            if (emphasis?.has(id)) lit = true;
          }
          const halo = haloOf(home, pts);
          if (!halo) continue;
          const c = toScreen(halo.cx, halo.cy);
          const R = (halo.r + TOPIC_HALO_PAD) * cam.zoom;
          const hd = easedDim(`topic:${home.id}`, emphasis && !lit ? 0.25 : 1);
          ctx.beginPath();
          ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
          ctx.fillStyle = hexAlpha(home.color, 0.055 * hd);
          ctx.fill();
          ctx.strokeStyle = hexAlpha(home.color, 0.3 * hd);
          ctx.lineWidth = 1.1;
          ctx.stroke();
          topicHalos.push({ label: home.label, topic: home.id, color: home.color, cx: c.x, cy: c.y, r: R, hd });
        }
      }

      // "Born linked" topology first — solid faint lines under the usage
      // trails; the relation TYPE rides the glyph at the target end ONLY.
      // EDGE LABELS ARE OFF (laurent dm#50, 2026-07-17: "do not show any
      // edge label" — the zoom-reveal midpoint words were the last labels
      // violating the one-rule). The relation word lives in the Detail
      // tab's connections and the legend's glyph key.
      for (const se of structuralResolved) {
        const la = layout.get(se.a);
        const lb = layout.get(se.b);
        if (!la || !lb) continue;
        const a = toScreen(la.x, la.y);
        const b = toScreen(lb.x, lb.y);
        const dim = edgeDim(se.a, se.b, null);
        ctx.globalAlpha = dim;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        // Uniform faint SOLID line — the type no longer rides a dash
        // pattern (indistinguishable at this alpha); it rides the glyph.
        ctx.setLineDash([]);
        ctx.strokeStyle = rgbaOf(CANVAS_THEME.dim, 0.16);
        ctx.lineWidth = 1;
        ctx.stroke();

        // Relation glyph at the TARGET end: type + direction in one mark,
        // placed just outside the target node, oriented along the edge.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len > 34) {
          const targetR = Math.max(2.5, lb.r * cam.zoom * 0.75);
          const back = targetR + 4;
          const gx = b.x - (dx / len) * back;
          const gy = b.y - (dy / len) * back;
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(Math.atan2(dy, dx));
          ctx.beginPath();
          traceRelationGlyph(ctx, relationGlyph(se.relation));
          ctx.strokeStyle = rgbaOf(CANVAS_THEME.dim, 0.55 * dim);
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.restore();
        }

        ctx.globalAlpha = 1;
      }
      ctx.setLineDash([]);

      // THE USAGE SCALE on the co-use lines (operator 2026-11-09): colour
      // and opacity follow the line's rank in this life (graph_usage.ts) —
      // a rarely used trail is a dark-grey whisper, his most used tenth is
      // a clear green; width stays the lifetime co-use depth. Under the
      // recall a TRAVELLED path takes its ring's colour at full strength
      // and every other line dims (edgeDim). The amber flash stays the
      // "just traveled" overlay.
      const usageStroke = (mix: number, alpha: number) => {
        const c = usageRgb(mix, CANVAS_THEME.cold, CANVAS_THEME.warm);
        return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
      };
      for (const e of fold.edges.values()) {
        const la = layout.get(e.a);
        const lb = layout.get(e.b);
        if (!la || !lb) continue;
        const a = toScreen(la.x, la.y);
        const b = toScreen(lb.x, lb.y);
        const age = scrubSeq - e.last_seq;
        const recent = age >= 0 && age <= pulseWindow ? 1 - age / pulseWindow : 0;
        const path = travelled?.get(e.key);
        const place = usage.edges.get(e.key) ?? 0;
        const mix = usageMix(place);
        ctx.globalAlpha = edgeDim(e.a, e.b, e.key);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (path) {
          // THE DIRECTION (operator 2026-11-09): from the memory he held
          // in mind (faint) to the one he recalled through it (full), an
          // arrowhead at the recalled one.
          const line = litLines.get(e.key);
          const ring = ADMISSION_COLORS[RECALL_RING_ADMISSION[path]];
          const fromAtA = !line || line.from === e.a;
          const src = fromAtA ? a : b;
          const dst = fromAtA ? b : a;
          const grad = ctx.createLinearGradient(src.x, src.y, dst.x, dst.y);
          grad.addColorStop(0, hexAlpha(ring, 0.22));
          grad.addColorStop(1, hexAlpha(ring, 0.9));
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.3 + Math.log1p(e.count) * 0.4;
          ctx.stroke();
          const dx = dst.x - src.x;
          const dy = dst.y - src.y;
          const len = Math.hypot(dx, dy);
          if (line && len > 18) {
            const target = layout.get(line.to);
            const back = Math.max(3, (target?.r ?? 4) * cam.zoom) + 3;
            const ux = dx / len;
            const uy = dy / len;
            const tipX = dst.x - ux * back;
            const tipY = dst.y - uy * back;
            const size = 7;
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - ux * size - uy * size * 0.55, tipY - uy * size + ux * size * 0.55);
            ctx.lineTo(tipX - ux * size + uy * size * 0.55, tipY - uy * size - ux * size * 0.55);
            ctx.closePath();
            ctx.fillStyle = hexAlpha(ring, 0.95);
            ctx.fill();
          }
          ctx.beginPath();
        } else {
          ctx.strokeStyle = usageStroke(mix, usageEdgeAlpha(place));
          ctx.lineWidth = 0.8 + Math.log1p(e.count) * 0.4;
        }
        ctx.stroke();
        if (recent > 0) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = rgbaOf(CANVAS_THEME.accent, 0.18 + recent * 0.45);
          ctx.lineWidth = 1 + recent * 1.6 + Math.log1p(e.count) * 0.4;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      const drawHalo = (x: number, y: number, r: number, color: string) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      // THE ONE LABEL RULE (laurent dm#46): labels NEVER show unless the
      // element is under the cursor's area of influence — no zoom reveal,
      // no peak/selection exception, no free-string exception (the one
      // addition, dm#54 pt3: the HOVERED node itself always labels).
      // Quadratic falloff; radius tuned three times by the operator
      // (dm#54 + dm#56): unzoomed 45px (150 → 75 → "decrease again by
      // 40%"), ramping to 420px zoomed in.
      const influenceAlpha = (x: number, y: number): number => {
        if (!mouseRef.current) return 0;
        const dxm = x - mouseRef.current.x;
        const dym = y - mouseRef.current.y;
        const dist = Math.sqrt(dxm * dxm + dym * dym);
        const zoomT = Math.max(0, Math.min(1, (cam.zoom - 1.25) / 1.25));
        const INFLUENCE = 45 + 375 * zoomT;
        if (dist >= INFLUENCE) return 0;
        const t = 1 - dist / INFLUENCE;
        return Math.min(0.92, t * t * 1.25);
      };

      // Standing targets (violet diamonds + scar/bond halos). Targets may
      // be free identity strings ("person:albou") or RECORD ids — resolve
      // record targets to their node's summary; labels obey the one
      // cursor-influence rule like every node.
      for (const standing of fold.standings.values()) {
        const ln = layout.get(`standing:${standing.target_id}`);
        if (!ln) continue; // record-targeted feelings render on their node below
        const p = toScreen(ln.x, ln.y);
        const r = (5 + Math.min(6, Math.log1p(standing.positive + standing.negative) * 2)) * cam.zoom * 0.8;
        const isSelected = selectedId === `standing:${standing.target_id}`;
        const isHovered = hoverRef.current === `standing:${standing.target_id}`;
        const standingDim = nodeDim(`standing:${standing.target_id}`);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = KIND_COLORS.standing;
        ctx.globalAlpha = 0.9 * standingDim;
        ctx.fillRect(-r / 1.5, -r / 1.5, (r / 1.5) * 2, (r / 1.5) * 2);
        ctx.restore();
        ctx.globalAlpha = standingDim;
        if (standing.scars.length > 0) drawHalo(p.x, p.y, r + 5, rgbaOf(CANVAS_THEME.scar, 0.9));
        if (standing.bonds.length > 0) drawHalo(p.x, p.y, r + (standing.scars.length ? 9 : 5), rgbaOf(CANVAS_THEME.bond, 0.9));
        if (isSelected || isHovered) {
          drawHalo(p.x, p.y, r + 12, rgbaOf(CANVAS_THEME.text, 0.7));
        }
        // Label ONLY under cursor influence (dm#46: "nodes NEVER show
        // label, unless they are under the area of influence"). A record-
        // targeted diamond uses the record's SUMMARY; a summary-less
        // record shows nothing (type words are not labels). Free identity
        // strings (person:…, tool:…) are the feeling's subject — real
        // content, allowed under influence.
        if (!isSelected && !isHovered && standingDim === 1 && !overlayBand(p.x, p.y - r - 8)) {
          const alpha = influenceAlpha(p.x, p.y);
          if (alpha > 0.05) {
            let label: string | null = standing.target_id;
            if (label.startsWith("ex:")) {
              const rowId = fold.graph_to_row.get(label);
              const target = rowId ? fold.nodes.get(rowId) : fold.nodes.get(label);
              label = summaryLabel(target?.title, target?.redacted);
            }
            if (label) {
              ctx.fillStyle = rgbaOf(CANVAS_THEME.text, alpha);
              ctx.font = `${Math.max(10, 10 * cam.zoom * 0.7)}px Menlo, Monaco, monospace`;
              ctx.textAlign = "center";
              // Cut at 34 on the canvas only: the hover card shows the whole title.
              ctx.fillText(nodeLabel(canvasLabel(label), 34), p.x, p.y - r - 8);
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      // Memory nodes.
      for (const node of fold.nodes.values()) {
        const ln = layout.get(node.id);
        if (!ln) continue;
        const p = toScreen(ln.x, ln.y);
        const r = Math.max(2.5, ln.r * cam.zoom * 0.75);
        const cls = nodeClass(node);
        const color = KIND_COLORS[cls] ?? KIND_COLORS.unknown;
        const isGhost = node.closed !== null || node.search_state === "hidden";
        const isSelected = selectedId === node.id;
        const isHover = hoverRef.current === node.id;
        const dim = nodeDim(node.id);
        ctx.globalAlpha = dim;

        // Use pulse: seq-distance from the scrub head, colored by WHY.
        const lastUse = node.last_selected_seq;
        if (lastUse !== null && lastUse <= scrubSeq) {
          const age = scrubSeq - lastUse;
          if (age <= pulseWindow) {
            const intensity = 1 - age / pulseWindow;
            const admissionColor = ADMISSION_COLORS[node.last_admission ?? ""] ?? rgbaOf(CANVAS_THEME.accent, 1);
            ctx.beginPath();
            ctx.arc(p.x, p.y, r + 3 + intensity * 9, 0, Math.PI * 2);
            ctx.strokeStyle = admissionColor;
            ctx.globalAlpha = intensity * 0.65 * dim;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = dim;
          }
        }

        // THE USAGE SCALE on the memory (operator 2026-11-09: "from dark
        // grey (rarely visited node) to green (highly visited node)"): the
        // fill is its rank in this life (graph_usage.ts), his most used
        // tenth glows; its KIND colour rides a small core so the kind stays
        // readable up close. A closed or hidden memory stays a ghost in its
        // kind colour.
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (isGhost) {
          ctx.globalAlpha = 0.35 * dim;
          ctx.fillStyle = CANVAS_THEME.core;
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.setLineDash([2, 3]);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = dim;
        } else {
          const place = usage.nodes.get(node.id) ?? 0;
          const fill = usageRgb(usageMix(place), CANVAS_THEME.cold, CANVAS_THEME.warm) as Rgb;
          // His most used tenth glows (graph_usage.TOP_DECILE): the pop.
          if (place > TOP_DECILE) {
            const bloomR = r * 2.6;
            const glow = ctx.createRadialGradient(p.x, p.y, r * 0.8, p.x, p.y, bloomR);
            glow.addColorStop(0, rgbaOf(fill, 0.45));
            glow.addColorStop(1, rgbaOf(fill, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(p.x, p.y, bloomR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          }
          ctx.fillStyle = rgbaOf(fill, 1);
          ctx.fill();
          // The kind core, once the memory is big enough on screen to carry
          // two colours (zoomed out, the memory is its usage colour).
          if (r >= 4.5) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          }
          if (node.diary) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.strokeStyle = rgbaOf(CANVAS_THEME.bg, 0.9);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        if (node.pinned) drawHalo(p.x, p.y, r + 4, rgbaOf(CANVAS_THEME.bond, 0.8));
        if (node.silenced) drawHalo(p.x, p.y, r + 4, rgbaOf(CANVAS_THEME.dim, 0.8));
        // Feelings ABOUT this record: a violet ring, scar/bond accents.
        const feeling = recordStanding.get(node.id);
        if (feeling) {
          drawHalo(p.x, p.y, r + 3.5, rgbaOf(CANVAS_THEME.standing, 0.75));
          if (feeling.scars.length > 0) drawHalo(p.x, p.y, r + 7, rgbaOf(CANVAS_THEME.scar, 0.9));
          if (feeling.bonds.length > 0) drawHalo(p.x, p.y, r + (feeling.scars.length ? 10.5 : 7), rgbaOf(CANVAS_THEME.bond, 0.9));
        }
        if (isSelected || isHover) drawHalo(p.x, p.y, r + 6, rgbaOf(CANVAS_THEME.text, 0.75));
        // Recall ring: WHY this memory is on the shelf — a solid ring in
        // the class colour (the dashed halos above stay pin/feeling/
        // selection marks). Shown while the recall is lit (also under a
        // hover, dimmed with its node); a lens or a selection hides it.
        const recallClass = recall && driver !== "filter" && !(selectedId !== null && layout.has(selectedId)) ? recall.classes.get(node.id) : undefined;
        if (recallClass) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 2.6, 0, Math.PI * 2);
          ctx.strokeStyle = ADMISSION_COLORS[RECALL_RING_ADMISSION[recallClass]];
          ctx.globalAlpha = 0.95 * dim;
          ctx.lineWidth = 1.7;
          ctx.stroke();
          ctx.globalAlpha = dim;
        }

        // Node labels (laurent dm#30/37/39/46/54): the cursor's AREA OF
        // INFLUENCE at any zoom, plus the HOVERED node itself (dm#54 pt3:
        // "you can still show the label above the node when we mouse over
        // it — simplify"). Content is the record's SUMMARY only (dm#46);
        // type stand-ins render NOTHING (summaryLabel → null).
        // A dream is named the way Detail and its card name it.
        const labelBase = node.kind === "dream" ? recordTitle(node) : summaryLabel(node.title, node.redacted);
        const labelInBand = overlayBand(p.x, p.y - r - 6);
        if (dim === 1 && labelBase && !labelInBand) {
          const alpha = isHover ? 0.95 : influenceAlpha(p.x, p.y);
          if (alpha > 0.05) {
            ctx.fillStyle = rgbaOf(CANVAS_THEME.text, alpha);
            ctx.font = `${Math.max(10, 10 * Math.min(1.2, cam.zoom * 0.6))}px Menlo, Monaco, monospace`;
            ctx.textAlign = "center";
            // The renderer's plain text of the title, cut at 34 on the canvas
            // only — the hover card (and Detail) show the whole title.
            ctx.fillText(nodeLabel(canvasLabel(labelBase), 34), p.x, p.y - r - 6);
          }
        }
        ctx.globalAlpha = 1;
      }

      // Topic LABELS go last, on top: they were placed off every node, so
      // on top they cover only the faint edges under their plate.
      const labelHits: Array<{ rect: Rect; topic: number; label: string }> = [];
      if (topicHalos.length > 0 && cam.zoom >= TOPIC_LABEL_MIN_ZOOM) {
        const screenNodes: Array<{ x: number; y: number; r: number }> = [];
        for (const ln of layout.values()) {
          const p = toScreen(ln.x, ln.y);
          screenNodes.push({ x: p.x, y: p.y, r: Math.max(2.5, ln.r * cam.zoom * 0.75) + 3 });
        }
        const placed: Rect[] = [];
        ctx.font = "600 11px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const halo of topicHalos) {
          if (halo.r < TOPIC_LABEL_MIN_SCREEN_R) continue;
          // Never cut mid-word at a fixed count: the label wraps onto two
          // lines; the hover card carries every keyword.
          const words = topicWords.get(halo.topic)?.label ?? halo.label;
          const { lines } = wrapTopicLabel(words, TOPIC_LABEL_MAX_W, (t) => ctx.measureText(t).width);
          const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
          const h = 6 + lines.length * TOPIC_LABEL_LINE_H;
          const rect = placeTopicLabel({
            halo: { cx: halo.cx, cy: halo.cy, r: halo.r },
            w,
            h,
            nodes: screenNodes,
            placed,
            bounds: { w: cssW, h: cssH },
            // The lens row / recall line / motion buttons own the top
            // strip; the legend owns the bottom-left corner.
            blocked: (rc) => rc.y < 78 || overlayBand(rc.x, rc.y) || (rc.y + rc.h > cssH - 78 && rc.x < cssW - 190),
          });
          if (!rect) continue;
          placed.push(rect);
          labelHits.push({ rect, topic: halo.topic, label: words });
          ctx.globalAlpha = halo.hd;
          ctx.beginPath();
          ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 9);
          ctx.fillStyle = rgbaOf(CANVAS_THEME.bg, 0.82);
          ctx.fill();
          ctx.strokeStyle = hexAlpha(halo.color, 0.55);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = rgbaOf(CANVAS_THEME.text, 0.92);
          lines.forEach((line, li) => ctx.fillText(line, rect.x + rect.w / 2, rect.y + 3 + TOPIC_LABEL_LINE_H * (li + 0.5) + 0.5));
          ctx.globalAlpha = 1;
        }
        ctx.textBaseline = "alphabetic";
      }
      topicLabelsRef.current = labelHits;

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ----------------------------------------------------- interactions
    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current;
      return {
        x: (clientX - rect.left - rect.width / 2) / cam.zoom + cam.x,
        y: (clientY - rect.top - rect.height / 2) / cam.zoom + cam.y,
      };
    };
    const hitTest = (clientX: number, clientY: number): string | null => {
      const { x, y } = toWorld(clientX, clientY);
      let best: string | null = null;
      let bestD = Infinity;
      for (const ln of layoutRef.current.values()) {
        const dx = ln.x - x;
        const dy = ln.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const hitR = Math.max(9, ln.r + 5);
        if (d < hitR && d < bestD) {
          best = ln.id;
          bestD = d;
        }
      }
      return best;
    };

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const cam = cameraRef.current;
      // Cursor-anchored zoom (P0-5): the world point under the cursor
      // stays under the cursor — zooming never loses the reference.
      // Min zoom 0.35 → 0.12 (laurent dm#56: "we should be able to
      // unzoom 3x more, i can't even fit large graph anymore") — matches
      // the fit-view floor so wheel and ⛶ fit agree on the widest view.
      const before = toWorld(ev.clientX, ev.clientY);
      const factor = Math.exp(-ev.deltaY * 0.0016);
      cam.zoom = Math.min(6, Math.max(0.12, cam.zoom * factor));
      const after = toWorld(ev.clientX, ev.clientY);
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
    };
    const onPointerDown = (ev: PointerEvent) => {
      pointerTypeRef.current = ev.pointerType || "mouse";
    };
    // HOVER INTENT (operator 2026-11-09, hover_intent.ts): a memory's card
    // and its highlight, and a lit line's words, show only after the
    // pointer has RESTED 150 ms on it; a sweep across the graph shows
    // nothing, leaving before then cancels. A click never waits.
    const pointAt = { x: 0, y: 0 };
    const intent = hoverIntent((target) => {
      if (dragRef.current || cardRef.current?.pinned) return;
      if (target.startsWith("n:")) {
        const id = target.slice(2);
        if (!layoutRef.current.has(id)) return;
        cardCtl.cancelGrace();
        hoverRef.current = id;
        cardCtl.set({ kind: "node", id, x: pointAt.x, y: pointAt.y, pinned: false });
        setLineTipRef.current(null);
      } else if (target.startsWith("l:")) {
        setLineTipRef.current({ key: target.slice(2), x: pointAt.x, y: pointAt.y });
      }
    });
    /** The lit line under the pointer (only while the recall lights some). */
    const litLineAt = (clientX: number, clientY: number): string | null => {
      const lines = shownLinesRef.current;
      if (!lines || lines.size === 0) return null;
      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current;
      const sx = (x: number) => rect.width / 2 + (x - cam.x) * cam.zoom;
      const sy = (y: number) => rect.height / 2 + (y - cam.y) * cam.zoom;
      const segs: LineSegment[] = [];
      for (const line of lines.values()) {
        const from = layoutRef.current.get(line.from);
        const to = layoutRef.current.get(line.to);
        if (from && to) segs.push({ key: line.key, ax: sx(from.x), ay: sy(from.y), bx: sx(to.x), by: sy(to.y) });
      }
      return lineAt(clientX - rect.left, clientY - rect.top, segs);
    };
    const onDown = (ev: MouseEvent) => {
      // The card at the press: a second tap on a pinned memory opens it.
      dragRef.current = { x: ev.clientX, y: ev.clientY, moved: false, card: cardRef.current };
      intent.cancel();
      setLineTipRef.current(null);
      if (pointerTypeRef.current === "mouse") cardCtl.close();
    };
    // Drag pans ride the WINDOW (a pan must keep following the cursor after
    // it leaves the canvas mid-drag); hover hit-testing rides the CANVAS
    // ELEMENT only — overlaying panels (chat drawer, inspector, modals)
    // capture the pointer above it, so a node hidden behind the chat can
    // never raise a hovercard through it (maintainer, 2026-07-09 03:14).
    const onWindowDragMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      const cam = cameraRef.current;
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
    };
    const onCanvasHover = (ev: MouseEvent) => {
      // The label area-of-influence tracks the cursor in canvas CSS px
      // (toScreen space) — a ref read by the RAF loop, zero re-renders.
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      if (dragRef.current) {
        intent.cancel(); // mid-drag: no hover churn
        return;
      }
      pointAt.x = ev.clientX;
      pointAt.y = ev.clientY;
      const hit = hitTest(ev.clientX, ev.clientY);
      // A topic label under the cursor (and no node): its card shows the
      // topic's full words — the canvas label never hides any for good.
      const label = hit ? null : topicLabelAt(ev.clientX, ev.clientY);
      // A lit line under the cursor (no memory, no label): its words.
      const line = hit || label ? null : litLineAt(ev.clientX, ev.clientY);
      canvas.style.cursor = hit || label ? "pointer" : "grab";
      // The line's words stay only while the pointer stays on that line.
      if (lineTipRef.current && lineTipRef.current.key !== line) setLineTipRef.current(null);
      const c = cardRef.current;
      if (c?.pinned) {
        intent.cancel();
        return; // a pinned card holds until a tap elsewhere
      }
      if (hit) {
        if (c?.kind === "node" && c.id === hit) {
          // Back on (or still on) the memory whose card shows: it stays.
          cardCtl.cancelGrace();
          intent.cancel();
          return;
        }
        // Another memory: its card waits for the rest; the shown one
        // yields when it comes (or when its grace ends).
        intent.over(`n:${hit}`);
        if (c) cardCtl.closeSoon();
      } else if (label) {
        intent.cancel();
        cardCtl.cancelGrace();
        hoverRef.current = null;
        if (!(c?.kind === "topic" && c.topic === label.topic)) cardCtl.set({ kind: "topic", topic: label.topic, x: ev.clientX, y: ev.clientY, pinned: false });
      } else {
        intent.over(line !== null ? `l:${line}` : null);
        // Off every memory: the card holds briefly so the pointer can
        // cross into it (its actions), then goes.
        if (c) cardCtl.closeSoon();
      }
    };
    const onCanvasLeave = (ev: MouseEvent) => {
      mouseRef.current = null;
      canvas.style.cursor = "grab";
      intent.cancel();
      setLineTipRef.current(null);
      const to = ev.relatedTarget as Node | null;
      if (to && cardElRef.current?.contains(to)) {
        cardCtl.cancelGrace(); // into the card: it stays
        return;
      }
      if (!cardRef.current?.pinned) cardCtl.close();
    };
    const onKey = (ev: KeyboardEvent) => {
      // One Escape = one layer (consumed-event convention).
      if (ev.key !== "Escape" || ev.defaultPrevented || !cardRef.current) return;
      ev.preventDefault();
      cardCtl.close();
    };
    const topicLabelAt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return topicLabelsRef.current.find((l) => x >= l.rect.x && x <= l.rect.x + l.rect.w && y >= l.rect.y && y <= l.rect.y + l.rect.h) ?? null;
    };
    const onUp = (ev: MouseEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || drag.moved) return;
      const label = ev.target === canvas ? topicLabelAt(ev.clientX, ev.clientY) : null;
      const plan = stateRef.current.topicPlan;
      if (pointerTypeRef.current !== "mouse" && ev.target === canvas) {
        // TOUCH: a tap shows the card and PINS it (its actions are taps);
        // a second tap on the same memory does its default action; a tap
        // on nothing closes it.
        const hit = hitTest(ev.clientX, ev.clientY);
        const prev = drag.card;
        if (hit) {
          if (prev?.kind === "node" && prev.id === hit && prev.pinned) {
            cardActionRef.current("default");
            return;
          }
          hoverRef.current = hit;
          cardCtl.cancelGrace();
          cardCtl.set({ kind: "node", id: hit, x: ev.clientX, y: ev.clientY, pinned: true });
          return;
        }
        if (label && plan) {
          cardCtl.cancelGrace();
          cardCtl.set({ kind: "topic", topic: label.topic, x: ev.clientX, y: ev.clientY, pinned: true });
          return;
        }
        cardCtl.close();
        onSelectRef.current(null);
        return;
      }
      // A topic label is a door: it lights that topic's memories.
      if (label && plan) {
        onPickTopicRef.current(plan.allRowsOf.get(label.topic) ?? new Set(), label.label);
        return;
      }
      onSelectRef.current(hitTest(ev.clientX, ev.clientY));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("mousemove", onCanvasHover);
    canvas.addEventListener("mouseleave", onCanvasLeave);
    window.addEventListener("mousemove", onWindowDragMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      cardCtl.cancelGrace();
      intent.cancel();
      canvas.removeEventListener("mousemove", onCanvasHover);
      canvas.removeEventListener("mouseleave", onCanvasLeave);
      window.removeEventListener("mousemove", onWindowDragMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const cardNodeId = card?.kind === "node" ? card.id : null;
  const hoverNode = cardNodeId ? fold.nodes.get(cardNodeId) ?? null : null;
  const hoverText = hoverNode ? nodeCardText(hoverNode) : null;
  // The record's words and current understanding (read after a short rest
  // on the memory; never a diary record's): its summary replaces the
  // fold's reading when it arrives (hover_card.currentReading).
  const hoverWords = useHoverWords(gatewaySource, hoverNode);
  const hoverSummary = hoverNode ? cardSummary(hoverNode, hoverWords, gatewaySource?.entity ?? "") : null;
  // Which topic a memory belongs to — any member, diary and identity too
  // (they keep their lanes but share the topic).
  const topicOfAny = useMemo(() => {
    const out = new Map<string, number>();
    if (!topicPlan) return out;
    for (const [topic, rows] of topicPlan.allRowsOf) for (const r of rows) out.set(r, topic);
    return out;
  }, [topicPlan]);
  const hoverTopic = hoverNode ? topicOfAny.get(hoverNode.id) ?? null : null;
  const hoverActions = hoverNode
    ? nodeActions(hoverNode, { topic: hoverTopic !== null ? topicWords.get(hoverTopic)?.label ?? null : null, partners: partnerCount(fold, hoverNode.id) })
    : cardNodeId?.startsWith("standing:")
      ? [{ id: "open" as const, label: "Open in Detail" }]
      : [];
  // The recall line shows while the recall is what the canvas lights (a
  // lens/search or a selection takes over — the Inspector's rule).
  const selectionIsNode = selectedRow !== null && (fold.nodes.has(selectedRow) || selectedRow.startsWith("standing:"));
  const topicCardHome = card?.kind === "topic" && showTopics ? topicHomes?.find((h) => h.id === card.topic) ?? null : null;
  const topicExemplar = topicCardHome ? topicExemplarText(fold, topicCardHome.exemplarId, topicCardHome.exemplarTitle) : null;
  // A topic's leading memories: its most used disc members, by title.
  const topicLeading = useMemo(() => {
    if (!topicCardHome || !topicPlan) return [];
    const ids = topicPlan.membersOf.get(topicCardHome.id) ?? [];
    return ids
      .map((id) => fold.nodes.get(id))
      .filter((n): n is NodeState => Boolean(n) && !n!.redacted && !n!.diary)
      .sort((x, y) => y.selected_count - x.selected_count || x.first_seq - y.first_seq)
      .slice(0, 3)
      .map((n) => ({ id: n.id, title: nodeCardText(n).title }));
  }, [topicCardHome, topicPlan, fold]);
  const recallShown = recall !== null && searchIds === null && !selectionIsNode;
  // The lit line the pointer rests on: "<recalled> — reached from <shelf> · <relation>".
  const tipLine = lineTip && recallShown ? litLines.get(lineTip.key) ?? null : null;
  const tipTo = tipLine ? fold.nodes.get(tipLine.to) ?? null : null;
  const tipFrom = tipLine ? fold.nodes.get(tipLine.from) ?? null : null;
  const recallLabelOf = (id: string): string | null => (recall ? recall.labels.get(id) ?? null : null);
  const hoverStanding = cardNodeId && !hoverNode && cardNodeId.startsWith("standing:")
    ? fold.standings.get(cardNodeId.slice("standing:".length)) ?? null
    : null;

  /** Frame the camera on these memories (world positions untouched). */
  const frameIds = (ids: Iterable<string>) => {
    const layout = layoutRef.current;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, found = 0;
    for (const id of ids) {
      const ln = layout.get(id);
      if (!ln) continue;
      found += 1;
      minX = Math.min(minX, ln.x); maxX = Math.max(maxX, ln.x);
      minY = Math.min(minY, ln.y); maxY = Math.max(maxY, ln.y);
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!found || !rect || rect.width < 10) return;
    const cam = cameraRef.current;
    cam.x = (minX + maxX) / 2;
    cam.y = (minY + maxY) / 2;
    cam.zoom = Math.min(4, Math.max(0.12, Math.min(rect.width / Math.max(140, maxX - minX + 180), rect.height / Math.max(140, maxY - minY + 180))));
  };

  /** A card action (or a pinned card's second tap: "default"). */
  const runCardAction = (id: CardActionId | "default") => {
    const c = cardRef.current;
    if (!c) return;
    const plan = topicPlan;
    if (c.kind === "node") {
      const node = fold.nodes.get(c.id) ?? null;
      const actions = node ? nodeActions(node, { topic: topicOfAny.has(c.id) ? "topic" : null, partners: partnerCount(fold, c.id) }) : [{ id: "open" as const, label: "" }];
      const act = id === "default" ? actions[0]?.id ?? "open" : id;
      cardCtl.close();
      if (act === "book" && node) onShowInBook(node.graph_id ?? node.id);
      else if (act === "open") onSelect(c.id);
      else if (act === "topic" && plan) {
        const t = topicOfAny.get(c.id);
        if (t !== undefined) onPickTopic(plan.allRowsOf.get(t) ?? new Set(), topicWords.get(t)?.label ?? "");
      } else if (act === "partners") {
        // Detail at its "Used together with" list: unfolded, scrolled to.
        writeSectionOpen("partners", true);
        onSelect(c.id);
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("ei-section-partners")?.scrollIntoView({ block: "start", behavior: "smooth" })));
      }
      return;
    }
    cardCtl.close();
    if (!plan) return;
    const rows = plan.allRowsOf.get(c.topic) ?? new Set<string>();
    const label = topicWords.get(c.topic)?.label ?? "";
    if (id === "light" || id === "default") onPickTopic(rows, label);
    else if (id === "members") {
      onPickTopic(rows, label);
      frameIds(rows);
    }
  };
  const cardActionRef = useRef(runCardAction);
  cardActionRef.current = runCardAction;
  const onCardEnter = () => cardCtl.cancelGrace();
  const onCardLeave = (ev: React.MouseEvent) => {
    if (cardRef.current?.pinned) return;
    if (ev.relatedTarget === canvasRef.current) cardCtl.closeSoon();
    else cardCtl.close();
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="entity_graph_canvas"
        style={{ width: "100%", height: height ? `${height}px` : "100%", display: "block" }}
      />
      {card?.kind === "node" && (hoverNode || hoverStanding) ? (
        <HoverCardBox ref={cardElRef} x={card.x} y={card.y} className="gc_hovercard" onEnter={onCardEnter} onLeave={onCardLeave}>
          {hoverNode ? (
            <>
              {/* The card carries the memory-type COLOR (laurent 12:23,
                * c1405 ask 2b): a dot in the node's exact kind color +
                * a left border in the same — the popup and the pixel it
                * describes visibly belong together. */}
              <div className="gc_hc_head" style={{ borderLeft: `3px solid ${KIND_COLORS[nodeClass(hoverNode)] ?? KIND_COLORS.unknown}`, paddingLeft: 8 }}>
                <span
                  className="gc_hc_kind_dot"
                  style={{ background: KIND_COLORS[nodeClass(hoverNode)] ?? KIND_COLORS.unknown }}
                  aria-hidden="true"
                />
                <span className={`ei_kind ei_kind_${hoverNode.diary ? "diary" : hoverNode.kind}`}>
                  {hoverNode.diary ? "diary" : hoverNode.kind}
                </span>
                {/* The title as Markdown (bold, code, headings render —
                  * never raw "##"/"**"). */}
                <Words text={hoverText?.title ?? ""} className="gc_hc_title gc_hc_md" />
              </div>
              {/* What it is in plain words, then what it says (the summary
                * for every kind — hover_card.cardSummary), then its facts,
                * then what to do with it. */}
              <div className="gc_hc_kindline">{cardKindLine(hoverNode)}</div>
              <CardSummaryBlock summary={hoverSummary} />
              {hoverNode.closed ? (
                <WordsLine text={`closed: ${hoverNode.closed.kind}${hoverNode.closed.reason ? ` — ${hoverNode.closed.reason}` : ""}`} className="gc_hc_note" />
              ) : null}
              <div className="gc_hc_rows">
                <span>used</span>
                <span>
                  {hoverNode.selected_count} time{hoverNode.selected_count === 1 ? "" : "s"} (lifetime)
                  {hoverNode.last_admission ? ` · admitted as ${hoverNode.last_admission}` : ""}
                </span>
                <span>warm</span>
                <span>
                  {(temporal.records.get(hoverNode.id) ?? 0) > 0.05
                    ? `${(temporal.records.get(hoverNode.id) ?? 0).toFixed(1)} now (recent selections; decays)`
                    : "cold (not recently selected)"}
                </span>
                {recallLabelOf(hoverNode.id) ? (
                  <>
                    <span>recalled</span>
                    <span>this turn — {ADMISSION_LABELS[recallLabelOf(hoverNode.id) ?? ""] ?? recallLabelOf(hoverNode.id)}</span>
                  </>
                ) : null}
                <span>scope</span>
                <span>{hoverNode.scope}</span>
                <span>born</span>
                <span>
                  {hoverNode.born_at ? hoverNode.born_at.slice(0, 16).replace("T", " ") : "—"} · seq {hoverNode.first_seq}
                </span>
                <span>state</span>
                <span>
                  {hoverNode.search_state}/{hoverNode.prompt_state}
                  {hoverNode.token_estimate ? ` · ~${hoverNode.token_estimate} tok` : ""}
                </span>
              </div>
            </>
          ) : hoverStanding ? (
            <>
              <div className="gc_hc_head">
                <span className="ei_kind ei_kind_standing">standing</span>
                <span className="gc_hc_title">{hoverStanding.target_id}</span>
              </div>
              <div className="gc_hc_rows">
                <span>feelings</span>
                <span>+{hoverStanding.positive.toFixed(1)} / −{hoverStanding.negative.toFixed(1)}</span>
                <span>marks</span>
                <span>
                  {hoverStanding.bonds.length} bond{hoverStanding.bonds.length === 1 ? "" : "s"} · {hoverStanding.scars.length} scar{hoverStanding.scars.length === 1 ? "" : "s"}
                </span>
              </div>
            </>
          ) : null}
          <CardActions actions={hoverActions} onAction={runCardAction} />
        </HoverCardBox>
      ) : null}
      {card?.kind === "topic" && topicCardHome ? (
        <HoverCardBox ref={cardElRef} x={card.x} y={card.y} className="gc_hovercard gc_topic_card" onEnter={onCardEnter} onLeave={onCardLeave}>
          <div className="gc_hc_head" style={{ borderLeft: `3px solid ${topicCardHome.color}`, paddingLeft: 8 }}>
            <span className="gc_hc_kind_dot" style={{ background: topicCardHome.color }} aria-hidden="true" />
            <span className="ei_kind">topic</span>
            <span className="gc_hc_title gc_topic_words">{topicWords.get(topicCardHome.id)?.keywords ?? topicCardHome.label}</span>
          </div>
          {/* Its most representative memory, by its summary (or title) —
            * never a private diary entry's words (hover_card). */}
          {topicExemplar ? (
            <div className="gc_topic_exemplar">
              <span className="gc_topic_exemplar_word">for example</span>
              {topicExemplar.plain ? (
                <div className="gc_hc_summary gc_hc_plain">{topicExemplar.text}</div>
              ) : (
                <Words text={topicExemplar.text} className="gc_hc_summary" />
              )}
            </div>
          ) : null}
          {topicLeading.length ? (
            <div className="gc_topic_exemplar">
              <span className="gc_topic_exemplar_word">most used</span>
              {topicLeading.map((m) => (
                <div key={m.id} className="gc_topic_leading">
                  <Words text={m.title} className="gc_hc_md" />
                </div>
              ))}
            </div>
          ) : null}
          <div className="gc_hc_rows">
            <span>memories</span>
            <span>
              {topicCardHome.size} ({topicCardHome.free} on the disc; diary entries and identity stay in their places)
            </span>
          </div>
          <CardActions actions={topicActions(topicCardHome.size)} onAction={runCardAction} />
        </HoverCardBox>
      ) : null}
      {lineTip && tipLine && tipTo && tipFrom ? (
        // THE LIT LINE'S WORDS (operator 2026-11-09): what the path means,
        // in its reading direction — never under the pointer, never taking it.
        <HoverCardBox x={lineTip.x} y={lineTip.y} className="gc_hovercard gc_linecard" onEnter={() => {}} onLeave={() => {}}>
          <div className="gc_lc_words" role="tooltip">
            <i className={`gc_lc_arrow gc_rl_${tipLine.cls}`} aria-hidden="true" />
            {travelledLineWords(tipLine, plainCardTitle(tipTo), plainCardTitle(tipFrom))}
          </div>
        </HoverCardBox>
      ) : null}
      {showTopics && topicsState.phase !== "ready" ? (
        <div className={`gc_topic_note ${topicsState.phase === "error" ? "gc_topic_note_error" : ""}`} role="status">
          {topicsState.phase === "loading" ? "grouping his memories by topic…" : null}
          {topicsState.phase === "off" ? "topics come from the gateway — not available for this source" : null}
          {topicsState.phase === "error" ? (
            <>
              topics unavailable — {topicsState.message}
              <button className="gc_topic_retry" onClick={retryTopics}>
                retry
              </button>
            </>
          ) : null}
        </div>
      ) : showTopics && topicsState.phase === "ready" && !topicPlan ? (
        <div className="gc_topic_note" role="status">
          no topics in this life yet
        </div>
      ) : null}
      {recallShown && recall ? (
        // THE CONTEXT LEGEND (operator 2026-11-09): the rings counted; what
        // each colour means, the lit lines and the grey-to-green fill.
        <ContextLegend recall={recall} open={legendOpen} onToggle={setLegendOpen} />
      ) : null}
      {/* Motion controls: icon + WORD labels (operator 2026-07-15 — the
        * bare 🌊⚓♻️🎯 emoji row read as mystery meat). aria-pressed marks
        * the freeze toggle's state. */}
      <div className="gc_motion_controls">
        <button
          className={`gc_btn ${motionUi === "frozen" ? "gc_btn_on" : ""}`}
          aria-pressed={motionUi === "frozen"}
          title={motionUi === "frozen" ? "Layout frozen — click to let it move again" : "Freeze the layout (nodes hold still)"}
          onClick={() => {
            simRef.current.frozen = !simRef.current.frozen;
            setMotionUi(simRef.current.frozen ? "frozen" : "live");
          }}
        >
          ❄ <span className="gc_btn_word">{motionUi === "frozen" ? "frozen" : "freeze"}</span>
        </button>
        <button
          className="gc_btn"
          title="Settle now — let the layout come to rest immediately"
          onClick={() => {
            simRef.current.alpha = 0;
          }}
        >
          ⏸ <span className="gc_btn_word">settle</span>
        </button>
        <button
          className="gc_btn"
          title="Reset layout — forget saved positions (and topic places) and re-place every node"
          onClick={() => {
            if (layoutKey) {
              try {
                localStorage.removeItem(layoutStorageKey(layoutKey));
              } catch {
                // best-effort
              }
            }
            layoutRef.current = new Map();
            seatRef.current = { seats: new Map(), next: 0 };
            // Forget the topic homes too: re-planned from the current topics.
            if (layoutKey) {
              try {
                localStorage.removeItem(topicSlotsStorageKey(layoutKey));
              } catch {
                // best-effort
              }
            }
            topicSlotsRef.current = [];
            setTopicResetN((n) => n + 1);
            simRef.current.alpha = 1;
            simRef.current.frozen = false;
            setMotionUi("live");
          }}
        >
          ⟲ <span className="gc_btn_word">reset</span>
        </button>
        <button
          className="gc_btn"
          title="Fit view — recenter the camera on the whole graph"
          onClick={() => {
            const nodes = Array.from(layoutRef.current.values());
            if (nodes.length === 0) return;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const n of nodes) {
              minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
              minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
            }
            const canvas = canvasRef.current;
            const rect = canvas?.getBoundingClientRect();
            const cam = cameraRef.current;
            cam.x = (minX + maxX) / 2;
            cam.y = (minY + maxY) / 2;
            if (rect) {
              const spanX = Math.max(120, maxX - minX + 120);
              const spanY = Math.max(120, maxY - minY + 120);
              cam.zoom = Math.min(6, Math.max(0.12, Math.min(rect.width / spanX, rect.height / spanY)));
            }
          }}
        >
          ⛶ <span className="gc_btn_word">fit</span>
        </button>
      </div>
    </>
  );
}

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

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { FoldState, NodeState, StandingState } from "./stream_fold";
import { ADMISSION_LABELS } from "./stream_types";
import {
  canvasRecall,
  DIMMED_NODE,
  dimRampSec,
  FOCUS_LIT_GAIN,
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
import { coldOf, EDGE_QUIET_ALPHA, FOCUS_EDGE_FLOOR, TOP_DECILE, usageEdgeStyle, usageMix, usageRgb, usageScale } from "./graph_usage";
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
import { useServedCommunities, type TopicSource } from "./communities_source";
import { heldCount, topicSummary, topicTitle, type ServedCommunities, type ServedCommunity } from "./communities";
import {
  dragCircle,
  membershipOf,
  parseOffsets,
  placeCommunities,
  pruneOffsets,
  seatFold,
  serializeOffsets,
  topicColor,
  withTailPlacements,
  type CommunityPlacement,
  type SeatedFold,
} from "./topic_layout";
import { memberOpensIn, topicCountWords, topicRequestStep, TopicsPanel, topicsNote, type TopicsView } from "./topics_panel";
import { contextBand, legendReserve, moveFloat, overlayStack, PANEL_DOCKED, PANEL_DRAG_SLOP, PANEL_GAP, PANEL_STORAGE_KEY, panelVars, parsePanelFloat, resizeFloat, serializePanelFloat, topReserve, type PanelDock, type PanelFloat } from "./overlay_stack";
import type { TailPlacement } from "./topic_map";
import { placeTopicLabel, wrapTopicLabel, type Rect } from "./topic_labels";
import { TITLE_BEING_WRITTEN } from "./untitled";
import { closedTitle, closedWord, drawnOutside, hiddenOutside, outsideTopics, neverJoins, type OutsideTopics } from "./graph_canvas_outside";
import { framePointsPose, glideAt, startGlide, type CameraPose, type Glide } from "./graph_canvas_camera";
import { circleLit, circleMeetsCanvas, litPlateFallback, litRowsCache, litRowsOnScreen, litRowsSpotCache, litTopicKey, MEMBER_RING, plateInDisc, TOPIC_GLOW, topicCircleStyle, topicDimTarget, veilAlpha } from "./graph_canvas_spotlight";

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
   * his topics (memory's communities, served with their layout — the
   * graph's base placement whenever they are served; communities.ts) and
   * the record read a hover card leads with — its current understanding
   * (graph_hover_card.useHoverWords; never a diary record's). */
  gatewaySource: TopicSource | null;
  /** The newest `communities_changed` marker on the live stream (its
   * version_seq): a newer version is re-read and the graph re-seats. */
  communitiesMarker: number | null;
  /** The memories memory placed since a version (the stream's `placed`
   * events, topic_map.usePlacedOnStream): provisional members until the
   * next version lists them. */
  communitiesPlaced: ReadonlyMap<string, TailPlacement>;
  /** The "topics" toggle: the circles, their titles and the Topics panel
   * over the same graph (the placement is the served one either way). */
  showTopics: boolean;
  /** The "Context" toggle: the newest recall's shelf + that turn's pairs
   * stay lit until the next recall (off = the plain graph, the resting
   * warmth view). A recall picked in the ledger lights either way. */
  showContext: boolean;
  /** A topic focused (its title on the graph, the panel): its key, its
   * memories present (the topic filter: every member, diary and identity
   * included) and its title; null lets it go. */
  onPickTopic(pick: { key: string; rowIds: Set<string>; label: string } | null): void;
  /** The focused topic's key (the topic filter's). */
  pickedTopic: string | null;
  /** A ledger row about a topic was clicked: open the Topics panel focused
   * on it (once per nonce, as soon as his topics are read). */
  topicRequest?: { key: string; nonce: number } | null;
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

export function nodeClass(node: NodeState): string {
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

/** Topic titles: hidden when zoomed out so far they would crowd; a circle
 * smaller than this on screen carries no title either. */
const TOPIC_LABEL_MIN_ZOOM = 0.16;
const TOPIC_LABEL_MIN_SCREEN_R = 24;
/** A label line's width before it wraps (two lines at most). */
const TOPIC_LABEL_MAX_W = 220;
const TOPIC_LABEL_LINE_H = 14;
/** How long the graph takes to re-seat on a new version of his topics. */
const RESEAT_MS = 450;
const EMPTY_ROWS: ReadonlyMap<string, string[]> = new Map();

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

/** Where the viewer dragged his topics' circles, per life (presentation,
 * keyed by the stable community key: a nightly revision keeps it). */
function topicOffsetsStorageKey(key: string): string {
  return `abstractentity_topic_offsets_v2:${key}`;
}

/** Where the viewer put the Topics panel and its size (overlay_stack
 * PanelFloat; one key for every life: it is the viewer's, not his). */
function readPanelFloat(): PanelFloat {
  try {
    return parsePanelFloat(localStorage.getItem(PANEL_STORAGE_KEY)) ?? PANEL_DOCKED;
  } catch {
    return PANEL_DOCKED;
  }
}
function writePanelFloat(f: PanelFloat): void {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, serializePanelFloat(f));
  } catch {
    // presentation only: the panel stays where it is for this view
  }
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

/** The DOM overlays over the canvas, in canvas px (what a topic's title
 * must never sit under). */
const CANVAS_OVERLAYS = ".gc_topics, .gc_recall_legend, .gc_motion_controls, .entity_legend";
/** `outside`: an overlay that lives outside the canvas's host (the Topics
 * panel floating over the page, portaled to the app's root). */
function overlayRectsOver(canvas: HTMLCanvasElement, outside?: () => Element | null): { rects: Rect[]; els: Element[] } {
  const host = canvas.parentElement;
  if (!host) return { rects: [], els: [] };
  const c = canvas.getBoundingClientRect();
  const rects: Rect[] = [];
  const els = Array.from(host.querySelectorAll(CANVAS_OVERLAYS));
  const away = outside?.() ?? null;
  if (away && !host.contains(away)) els.push(away);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rects.push({ x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height });
  }
  return { rects, els };
}

/** The overlays' rects over the canvas, CACHED (review S3): re-read from
 * the DOM only after the canvas or an overlay resized (ResizeObserver) or
 * the DOM around the canvas changed (an overlay came, went, folded or
 * re-rendered: MutationObserver) — a frame with none of that reads nothing.
 * `rev` moves when the rects do (what the titles' cache keys on). */
export class OverlayRects {
  rev = 0;
  private rects: Rect[] = [];
  private dirty = true;
  private readonly watched = new Set<Element>();
  private readonly resize: ResizeObserver | null;
  private readonly dom: MutationObserver | null;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly outside?: () => Element | null) {
    const mark = () => {
      this.dirty = true;
    };
    this.resize = typeof ResizeObserver === "function" ? new ResizeObserver(mark) : null;
    this.resize?.observe(canvas);
    // The canvas's own attributes (its cursor, its pixel size) never move an
    // overlay: only changes elsewhere in its host mark the rects stale.
    this.dom = typeof MutationObserver === "function" ? new MutationObserver((records) => {
      if (records.some((r) => r.target !== canvas)) mark();
    }) : null;
    if (canvas.parentElement) this.dom?.observe(canvas.parentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    window.addEventListener("resize", mark);
    this.onResize = mark;
  }
  private readonly onResize: () => void;
  /** Mark the rects stale (the page panel moved: no observer here sees it). */
  invalidate(): void {
    this.dirty = true;
  }
  /** The rects as they are (read from the DOM only when marked stale). */
  current(): Rect[] {
    if (!this.dirty) return this.rects;
    this.dirty = false;
    const { rects, els } = overlayRectsOver(this.canvas, this.outside);
    // An overlay seen for the first time is watched for its own resizes
    // (its first observation marks the rects once more, then holds).
    for (const el of els) {
      if (this.watched.has(el)) continue;
      this.watched.add(el);
      this.resize?.observe(el);
    }
    for (const el of [...this.watched]) {
      if (els.includes(el)) continue;
      this.watched.delete(el);
      this.resize?.unobserve(el);
    }
    const same = rects.length === this.rects.length && rects.every((r, i) => r.x === this.rects[i].x && r.y === this.rects[i].y && r.w === this.rects[i].w && r.h === this.rects[i].h);
    if (!same) {
      this.rects = rects;
      this.rev += 1;
    }
    return this.rects;
  }
  dispose(): void {
    this.resize?.disconnect();
    this.dom?.disconnect();
    window.removeEventListener("resize", this.onResize);
  }
}
function rectsMeet(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The lens row's band at the top of the canvas (a framed topic sits below it). */
const LENS_BAND = 48;

/** The narrowest and shortest part of the canvas a framed topic is put in
 * (review 2026-11-10: at 400 x 700 the folded panel head left an 8 px strip
 * at the left edge, and the topic was framed there at zoom 0.12). */
export const FREE_MIN_W = 120;
export const FREE_MIN_H = 40;

/** Where a framed topic goes on screen: the centre of the largest part of
 * the canvas below the lens row that the Topics panel leaves free — left of
 * it (a wide canvas, docked), right of it (moved), above it or below it (a
 * phone: under the folded head) — among the parts at least FREE_MIN_W wide
 * and FREE_MIN_H tall; none: the whole canvas below the lens row. In canvas
 * px. */
export function freeCentre(canvas: { w: number; h: number }, panel: Rect | null, top: number = LENS_BAND): { x: number; y: number; w: number; h: number } {
  const h = Math.max(0, canvas.h - top);
  const whole = { x: canvas.w / 2, y: top + h / 2, w: canvas.w, h };
  if (!panel) return whole;
  const belowTop = Math.max(top, panel.y + panel.h);
  const parts = [
    { x: Math.max(0, panel.x) / 2, y: top + h / 2, w: Math.max(0, panel.x), h },
    { x: (panel.x + panel.w + canvas.w) / 2, y: top + h / 2, w: Math.max(0, canvas.w - panel.x - panel.w), h },
    { x: canvas.w / 2, y: top + Math.max(0, panel.y - top) / 2, w: canvas.w, h: Math.max(0, panel.y - top) },
    { x: canvas.w / 2, y: belowTop + Math.max(0, canvas.h - belowTop) / 2, w: canvas.w, h: Math.max(0, canvas.h - belowTop) },
  ].filter((p) => p.w >= FREE_MIN_W && p.h >= FREE_MIN_H);
  if (parts.length === 0) return whole;
  return parts.reduce((best, p) => (p.w * p.h > best.w * best.h ? p : best));
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

/** The Topics panel's ids (onHoverRows / onFrameRows) are the graph's node
 * ids (NodeState.id, the fold's rows: the panel resolves a served record id
 * through fold.graph_to_row). One that is not says so loudly: the panel
 * broke the seam, and nothing lights or frames for it. */
export function seamRows(fold: Pick<FoldState, "nodes">, ids: string[], what: string): string[] {
  const unknown = ids.filter((id) => !fold.nodes.has(id));
  if (unknown.length > 0) console.error(`#SEAM ${what}: ${unknown.length} of ${ids.length} ids are not graph node ids`, unknown.slice(0, 3));
  return ids;
}

/** The one card on screen: a memory's (node id) or a topic title's (its key). */
type CardAt =
  | { kind: "node"; id: string; x: number; y: number; pinned: boolean }
  | { kind: "topic"; topic: string; x: number; y: number; pinned: boolean };

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
  communitiesMarker,
  communitiesPlaced,
  showTopics,
  showContext,
  onPickTopic,
  pickedTopic,
  topicRequest,
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
  // HIS TOPICS (memory-owned communities, COMMUNITIES-DESIGN 2026-11-10):
  // memory serves every community with its layout; whenever they are
  // served, every memory sits on its served seat inside its one circle
  // (communities.ts reads them, topic_layout.ts seats them) — no force
  // layout for the base. Re-read on the live
  // stream's communities_changed marker; the graph re-seats with a short
  // transition. Not served (his first sleep is still to come, a gateway
  // before v2, a file source): the plain layout, and one sentence.
  const { state: topicsState, retry: retryTopics } = useServedCommunities(gatewaySource, communitiesMarker);
  const topicsView: TopicsView | null = "kind" in topicsState ? topicsState : null;
  // The version as read (a new one re-seats with the transition)…
  const servedRead: ServedCommunities | null = topicsView?.kind === "read" && topicsView.read.kind === "served" && topicsView.read.data.communities.length > 0 ? topicsView.read.data : null;
  // …plus the memories placed since it on the live stream (provisional
  // members at their circle's rim, without a re-read).
  const served = useMemo(() => (servedRead ? withTailPlacements(servedRead, communitiesPlaced) : null), [servedRead, communitiesPlaced]);
  const topicsPanelView = useMemo<TopicsView | null>(
    () => (topicsView?.kind === "read" && topicsView.read.kind === "served" && served ? { kind: "read", read: { kind: "served", data: served } } : topicsView),
    [topicsView, served],
  );
  const communityByKey = useMemo(() => new Map<string, ServedCommunity>((served?.communities ?? []).map((c) => [c.key, c])), [served]);
  // Membership (no geometry): what the panel, the cards and the topic
  // filter read. Every member in exactly one topic.
  const membership = useMemo(() => (served ? membershipOf(fold, served) : null), [fold, served]);
  // The memories the version does not list yet (formed since; closed ones
  // and relation rows never join one).
  const waitingCount = useMemo(() => {
    if (!membership) return 0;
    let n = 0;
    // Closed records, engine records and link rows never join one (graph_canvas_outside.neverJoins).
    for (const node of fold.nodes.values()) if (!membership.circleOfRow.has(node.id) && neverJoins(node) === null) n += 1;
    return n;
  }, [fold, membership]);
  const topicsPending = topicsView?.kind === "loading";
  // THE CLOSED MEMORIES (graph_canvas_outside.ts): the records outside every
  // circle that never join a topic (closed memories, engine records, link
  // rows), once per fold; all hidden, the closed memories shown on their
  // ring by the "N closed memories" toggle.
  const outside = useMemo<OutsideTopics | null>(() => (membership ? outsideTopics(fold, membership.circleOfRow) : null), [fold, membership]);
  const [showOutside, setShowOutside] = useState(false);
  // Where the viewer dragged circles (world px from the served position, by
  // community key); bumped per drag step so the frame re-places.
  const offsetsRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const offsetsRevRef = useRef(0);
  /** The frame's placement and seating, recomputed only when the served
   * topics, the viewer's offsets or the fold change. */
  const placementCacheRef = useRef<{ data: ServedCommunities | null; rev: number; placement: CommunityPlacement | null; fold: FoldState | null; seated: SeatedFold | null; gen: number }>({ data: null, rev: -1, placement: null, fold: null, seated: null, gen: 0 });
  const stateRef = useRef({ fold, temporal, usage, scrubSeq, selectedId: selectedRow, searchIds, recall, litLines, served, servedRead, communityByKey, showTopics, topicsPending, pickedTopic, outside, showOutside });
  /** The records the last frame left undrawn (the hidden ring), for the
   * pointer and Fit view; null = every record drawn. */
  const hiddenRowsRef = useRef<ReadonlySet<string> | null>(null);
  /** Topic title rects drawn last frame (screen px) — click and drag targets. */
  const topicLabelsRef = useRef<Array<{ rect: Rect; topic: string; label: string }>>([]);
  const onPickTopicRef = useRef(onPickTopic);
  onPickTopicRef.current = onPickTopic;
  /** While the first topics answer is on its way, the sim holds (≤ 3 s) so
   * a restored layout does not drift toward seats it is about to leave. */
  const topicsPendingSinceRef = useRef<number | null>(null);
  useEffect(() => {
    topicsPendingSinceRef.current = topicsPending ? performance.now() : null;
  }, [topicsPending]);
  // The Topics panel: open on a wide screen, folded on a phone.
  const [topicsOpen, setTopicsOpen] = useState(() => !narrowViewport());
  // THE FLOATING PANEL (overlay_stack.ts PanelFloat; backlog 0017, 0027):
  // a wide canvas floats it over the PAGE (portaled to the body: the
  // canvas's wrap is a CSS container, which would hold a fixed box inside
  // it), docked at the canvas's top right under the motion buttons; its head
  // bar and its grip move it anywhere in the window, its corner grows it
  // toward the bottom right, "put back" docks it again.
  const [panelFloat, setPanelFloatState] = useState<PanelFloat>(readPanelFloat);
  const panelFloatRef = useRef(panelFloat);
  panelFloatRef.current = panelFloat;
  const setPanelFloat = (f: PanelFloat) => {
    setPanelFloatState(f);
    writePanelFloat(f);
  };
  /** Where the docked panel goes, in the window (null until measured). */
  const [panelDock, setPanelDock] = useState<PanelDock | null>(null);
  const panelDockRef = useRef(panelDock);
  panelDockRef.current = panelDock;
  /** The panel floats over the page (a wide, shown canvas: the stack draws
   * no box) — else it is the phone stack's foot. */
  const [pagePanel, setPagePanel] = useState(false);
  /** Where the page panel is portaled: the app's root (its rules, its font
   * scale; a size container, so "fixed" is the root's box: the window). */
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const panelHostRef = useRef<HTMLElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const floatRef = useRef<HTMLDivElement | null>(null);
  const motionRef = useRef<HTMLDivElement | null>(null);
  /** A press on the head that became a move: its click is not the fold's. */
  const panelDraggedRef = useRef(false);
  /** The frame's overlay rects (a moved page panel marks them stale). */
  const overlaysRef = useRef<OverlayRects | null>(null);
  // Measured before paint (no frame with the panel in the wrong place), again
  // when the canvas or the motion buttons resize (the drawer, the window, a
  // container query that moves the buttons: the first open on a canvas that
  // grew past the phone width read a stale "under the buttons" before).
  useLayoutEffect(() => {
    const wrap = canvasRef.current?.parentElement;
    const motion = motionRef.current;
    const stackEl = stackRef.current;
    if (!wrap || !motion || !stackEl) return;
    const host = wrap.closest("#root");
    if (!(host instanceof HTMLElement)) {
      // The app mounts in #root; without it the panel stays in the canvas (the phone stack's place), said loudly.
      console.error("#SEAM the graph is not inside #root: the Topics panel cannot float over the page");
      return;
    }
    panelHostRef.current = host;
    setPanelHost(host);
    const measure = () => {
      const hr = host.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const mr = motion.getBoundingClientRect();
      const shown = wr.width > 0 && wr.height > 0;
      setPagePanel(shown && getComputedStyle(stackEl).display === "contents");
      const next: PanelDock = { top: Math.round(mr.bottom - hr.top + PANEL_GAP), right: Math.round(wr.right - hr.left - 10), canvasW: Math.round(wr.width), canvasBottom: Math.round(wr.bottom - hr.top), canvasH: Math.round(wr.height), viewW: Math.round(hr.width) };
      setPanelDock((d) => (d && d.top === next.top && d.right === next.right && d.canvasW === next.canvasW && d.canvasBottom === next.canvasBottom && d.canvasH === next.canvasH && d.viewW === next.viewW ? d : next));
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(wrap);
    ro?.observe(motion);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  // THE CONTEXT BOX AT THE TOP (overlay_stack contextBand; operator
  // 2026-11-11): on a wide canvas, at the top controls' level in the band
  // between the top row's last button and the motion buttons (or the docked
  // panel). Measured when the canvas, the motion buttons or the top row's
  // buttons resize or come and go, and when the panel moves; never per frame.
  const [contextAt, setContextAt] = useState<{ centre: number; max: number } | null>(null);
  const measureContextRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const motion = motionRef.current;
    const stackEl = stackRef.current;
    if (!canvas || !host || !motion || !stackEl) return;
    const overlay = host.querySelector(".entity_graph_overlay");
    if (!overlay) {
      console.error("#SEAM no .entity_graph_overlay over the graph: the Context box keeps its place under the top row");
      return;
    }
    const measure = () => {
      if (getComputedStyle(stackEl).display !== "contents") {
        setContextAt(null);
        return;
      }
      const c = canvas.getBoundingClientRect();
      // The top row's last button: of the overlay's children on its first line, the right edge of
      // what they hold (the top row's own box stretches to the overlay's width).
      let topRowRight = 0;
      for (const child of Array.from(overlay.children)) {
        const r = child.getBoundingClientRect();
        if (r.height === 0 || r.top - c.top > 40) continue;
        const kids = child.children.length > 0 ? Array.from(child.children) : [child];
        for (const k of kids) topRowRight = Math.max(topRowRight, k.getBoundingClientRect().right - c.left);
      }
      let rightLimit = motion.getBoundingClientRect().left - c.left;
      const panel = panelFloatRef.current.at === null ? floatRef.current?.querySelector(".gc_topics") : null;
      if (panel) {
        const p = panel.getBoundingClientRect();
        if (p.width > 0) rightLimit = Math.min(rightLimit, p.left - c.left);
      }
      const next = contextBand(topRowRight, rightLimit);
      setContextAt((prev) => (prev && next && prev.centre === next.centre && prev.max === next.max ? prev : next));
    };
    measureContextRef.current = measure;
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => measure()) : null;
    const watch = () => {
      ro?.disconnect();
      ro?.observe(canvas);
      ro?.observe(motion);
      for (const child of Array.from(overlay.children)) {
        ro?.observe(child);
        for (const k of Array.from(child.children)) ro?.observe(k);
      }
    };
    watch();
    // A button comes or goes (a focused topic's chip, the search bar): watch it too.
    const mo = typeof MutationObserver === "function" ? new MutationObserver(() => {
      watch();
      measure();
    }) : null;
    mo?.observe(overlay, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", measure);
      measureContextRef.current = null;
    };
  }, []);
  // The panel moved, docked, came (his topics read, the toggle on) or folded: the band changes.
  useEffect(() => {
    measureContextRef.current?.();
  }, [panelFloat, panelDock, pagePanel, showTopics, topicsView, topicsOpen]);
  // The page panel lives outside the canvas's host: its moves reach the
  // titles' overlay rects through this.
  useEffect(() => {
    overlaysRef.current?.invalidate();
  }, [panelFloat, panelDock, pagePanel]);
  /** Last frame time the recall drove the emphasis (ease-out pacing). */
  const recallDriveAtRef = useRef<number | null>(null);
  const hoverRef = useRef<string | null>(null);
  /** The topic whose Topics-panel row the pointer (or the keyboard) rests
   * on, after the panel's hover intent: the frame lights it (a ref, read by
   * the RAF loop; no re-render). */
  const hoverTopicRef = useRef<string | null>(null);
  /** The memories the Topics panel lights (onHoverRows: a path's two
   * memories, a memory type's memories in a topic), after its hover intent:
   * exactly these node ids lit, the rest dimmed; null lets go. A ref, read
   * by the RAF loop (no re-render); the set is built once per hover. */
  const hoverRowsRef = useRef<ReadonlySet<string> | null>(null);
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
  /** A press in progress: a pan, or — pressed on a topic's title — that
   * circle's drag (`circle` = its key; the circles it meets are pushed). */
  const dragRef = useRef<{ x: number; y: number; moved: boolean; card: CardAt | null; circle: string | null } | null>(null);
  const onSelectRef = useRef(onSelect);
  // Cooling state (P0-2/3): alpha decays toward freeze; arrivals reheat.
  const simRef = useRef({ alpha: 1, frozen: false, lastSaveAt: 0, autoFitDone: false, lastCount: 0, stableFrames: 0 });
  const reducedMotionRef = useRef(false);
  /** THE CAMERA GLIDE (graph_canvas_camera.ts; operator 2026-11-10: "never
   * a teleport"): a programmatic move in progress, stepped by the frame;
   * the viewer's pan or wheel drops it. */
  const glideRef = useRef<Glide | null>(null);
  /** Move the camera to `to`: a glide (CAMERA_GLIDE_MS, eased), one step
   * under reduced motion. */
  const moveCamera = (to: CameraPose) => {
    const cam = cameraRef.current;
    const glide = startGlide(cam, to, performance.now(), reducedMotionRef.current);
    glideRef.current = glide;
    if (!glide) {
      cam.x = to.x;
      cam.y = to.y;
      cam.zoom = to.zoom;
    }
  };
  /** The served topics the layout last seated (a new version re-seats with
   * a short transition from where every memory is). */
  const servedSeenRef = useRef<ServedCommunities | null>(null);
  const reseatRef = useRef<{ start: number; from: Map<string, { x: number; y: number }> } | null>(null);
  // The Context legend: unfolded on a wide screen, folded on a phone; the
  // reader's fold/unfold holds for this view.
  const [legendOpen, setLegendOpen] = useState(() => !narrowViewport());
  const [motionUi, setMotionUi] = useState<"live" | "frozen">("live");
  /** Phyllotaxis seat per node id — assigned once at first sight, kept
   * for the node's lifetime (and persisted): permanent spatial memory. */
  const seatRef = useRef<{ seats: Map<string, number>; next: number }>({ seats: new Map(), next: 0 });

  stateRef.current = { fold, temporal, usage, scrubSeq, selectedId: selectedRow, searchIds, recall, litLines, served, servedRead, communityByKey, showTopics, topicsPending, pickedTopic, outside, showOutside };
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
          const spanX = Math.max(140, maxX - minX + 180);
          const spanY = Math.max(140, maxY - minY + 180);
          moveCamera({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: Math.min(4, Math.max(0.12, Math.min(rect.width / spanX, rect.height / spanY))) });
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
    offsetsRef.current = new Map();
    offsetsRevRef.current += 1;
    if (!layoutKey) return;
    try {
      offsetsRef.current = parseOffsets(localStorage.getItem(topicOffsetsStorageKey(layoutKey)));
    } catch {
      offsetsRef.current = new Map();
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

  // Each version read keeps the drags of the topics it serves only: a key
  // renamed or dissolved leaves no offset behind, here or in storage
  // (review N2).
  useEffect(() => {
    if (!servedRead) return;
    const pruned = pruneOffsets(offsetsRef.current, new Set(servedRead.communities.map((c) => c.key)));
    if (pruned === offsetsRef.current) return;
    offsetsRef.current = pruned;
    offsetsRevRef.current += 1;
    if (!layoutKey) return;
    try {
      localStorage.setItem(topicOffsetsStorageKey(layoutKey), serializeOffsets(pruned));
    } catch {
      // Quota/private mode: pruned for this session only.
    }
  }, [servedRead, layoutKey]);

  // prefers-reduced-motion, kept current (the setting can change while the page is open).
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const read = () => {
      reducedMotionRef.current = mq.matches;
    };
    read();
    mq.addEventListener?.("change", read);
    return () => mq.removeEventListener?.("change", read);
  }, []);

  // Center the camera on selection changes (P0-6: "find the node again").
  useEffect(() => {
    if (!selectedRow) return;
    const ln = layoutRef.current.get(selectedRow);
    // A glide to it, at the zoom the viewer has (review 2026-11-10: a member
    // opened from the Topics panel teleported the camera).
    if (ln) moveCamera({ x: ln.x, y: ln.y, zoom: cameraRef.current.zoom });
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

    // THE OVERLAYS' RECTS (what a topic's title never sits under), read from
    // the DOM only when something can have moved them — the canvas or an
    // overlay resized, an overlay came or went, the overlays' DOM changed —
    // never per frame (review S3: the ruling, no per-frame recompute).
    const overlays = new OverlayRects(canvas, () => floatRef.current?.querySelector(".gc_topics") ?? null);
    overlaysRef.current = overlays;

    // THE TOPIC TITLES' PLACEMENT (each title off every node, off the other
    // titles, never under an overlay): computed once per change of what it
    // depends on — the camera, the canvas size, the overlays, the seated
    // placement (served topics, the viewer's drags, the fold) and, while a
    // new version glides in, the moving seats — then only drawn per frame.
    const titlesCache: { key: string; placed: Array<{ rect: Rect; topic: string; label: string; lines: string[] }> } = { key: "", placed: [] };
    // The lit topic's memories (a set per lit topic and seating, not per frame).
    const litRowsOf = litRowsCache();
    // The rows the panel lights and their circles (a set per hover and seating, not per frame).
    const litRowsSpotOf = litRowsSpotCache();

    const frame = () => {
      if (disposed) return;
      const { fold, usage, scrubSeq, selectedId, searchIds, recall, litLines, served, servedRead, communityByKey, showTopics: topicsOn, topicsPending: pending, pickedTopic: picked, outside: outsideNow, showOutside: outsideShown } = stateRef.current;
      const layout = layoutRef.current;
      const sim = simRef.current;

      // ---- HIS TOPICS: the served placement (communities.ts), recomputed
      // only when the served topics, the viewer's drags or the fold change.
      const pc = placementCacheRef.current;
      if (pc.data !== served || pc.rev !== offsetsRevRef.current) {
        pc.data = served;
        pc.rev = offsetsRevRef.current;
        pc.placement = served ? placeCommunities(served, offsetsRef.current) : null;
        pc.fold = null;
        pc.gen += 1;
      }
      if (pc.placement && pc.fold !== fold) {
        pc.fold = fold;
        pc.seated = seatFold(fold, pc.placement);
        pc.gen += 1;
      }
      const placement = pc.placement;
      const seated = placement ? pc.seated : null;
      // The ring outside every circle: its closed memories hidden unless the
      // toggle shows them, its engine records and link rows always (served
      // only: unserved, there is no ring).
      const hiddenRows = seated ? hiddenOutside(outsideNow, outsideShown) : null;
      hiddenRowsRef.current = hiddenRows;
      // A NEW VERSION (or the first answer): every memory glides from where
      // it is to its new seat (RESEAT_MS; at once under reduced motion). The
      // viewer's drags and a memory placed since the version (born on its
      // rim seat) move without the glide.
      if (servedRead !== servedSeenRef.current) {
        servedSeenRef.current = servedRead;
        if (servedRead && layout.size > 0 && !reducedMotionRef.current) {
          const from = new Map<string, { x: number; y: number }>();
          for (const ln of layout.values()) from.set(ln.id, { x: ln.x, y: ln.y });
          reseatRef.current = { start: performance.now(), from };
        } else {
          reseatRef.current = null;
        }
      }
      let reseat = reseatRef.current;
      let ease = 1;
      if (reseat) {
        const t = (performance.now() - reseat.start) / RESEAT_MS;
        if (t >= 1 || !seated) {
          reseatRef.current = reseat = null;
        } else {
          ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        }
      }
      const seatAt = (ln: LayoutNode, target: { x: number; y: number }) => {
        const from = reseat?.from.get(ln.id);
        ln.x = from ? from.x + (target.x - from.x) * ease : target.x;
        ln.y = from ? from.y + (target.y - from.y) * ease : target.y;
        ln.vx = 0;
        ln.vy = 0;
        ln.anchor = undefined;
      };

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
        if (seated) {
          // SERVED: the memory's seat in its one circle (diary entries and
          // identity records included), or the waiting ring outside.
          const target = seated.targetOf.get(node.id) ?? { x: 0, y: 0 };
          if (!ln) {
            // Born on its seat (no glide across the disc).
            ln = { id: node.id, x: target.x, y: target.y, vx: 0, vy: 0, r: nodeRadius(node) };
            layout.set(node.id, ln);
            arrivals += 1;
          }
          ln.r = nodeRadius(node);
          seatAt(ln, target);
          continue;
        }
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
          const seat = isFree ? phyllotaxisSeat(seats.seats.get(seatKey) ?? 0) : null;
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
          // but the seat owns the position (readable, stable disc).
          const seat = phyllotaxisSeat(seats.seats.get(seatKey) ?? 0);
          ln.anchor = { x: seat.x, y: seat.y, strength: 0.1 };
        }
      }
      // Lane radius: the phyllotaxis disc grows as sqrt(seats), so outer
      // lanes derive from the MONOTONIC seat counter, quantized to 80px
      // steps — they step outward rarely and never move back in. Served,
      // the standing arc steps outside the circles and the waiting ring.
      const discR = placement ? placement.extent + 160 : PHYLLO_INNER_R + PHYLLO_SPACING * Math.sqrt(Math.max(1, seats.next));
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
        const at = { x: Math.cos(angle) * laneR, y: Math.sin(angle) * laneR };
        if (seated) seatAt(ln, at);
        else ln.anchor = { ...at, strength: 0.06 };
      }
      for (const id of Array.from(layout.keys())) {
        if (!liveIds.has(id)) layout.delete(id);
      }

      // Edges: the fold is prefix-limited, so every edge in it exists now.
      // Served, they are drawn and never pull (no force layout).
      const edges: LayoutEdge[] = [];
      for (const e of fold.edges.values()) {
        if (!layout.has(e.a) || !layout.has(e.b)) continue;
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
      // neighbor seeding already placed them sensibly). Served, nothing
      // simulates: every memory is on its seat.
      if (arrivals > 0 && !reducedMotionRef.current && !sim.frozen) {
        sim.alpha = Math.max(sim.alpha, 0.25);
      }
      const nodes = Array.from(layout.values());
      const holdForTopics = pending && topicsPendingSinceRef.current !== null && performance.now() - topicsPendingSinceRef.current < 3000;
      if (!seated && !sim.frozen && !holdForTopics && sim.alpha > 0.02) {
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
          if (!drawnOutside(hiddenRows, n.id, selectedId)) continue;
          minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
          minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
        }
        const rect = canvas.getBoundingClientRect();
        glideRef.current = null;
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
      // Served, the positions ARE the served seats: nothing to remember.
      if (liveLayoutKey && !seated && sim.alpha <= 0.02 && nowMs - sim.lastSaveAt > 5000) {
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
      // A glide in progress places the camera for this frame (by the clock).
      const glide = glideRef.current;
      if (glide) {
        const step = glideAt(glide, performance.now());
        Object.assign(cameraRef.current, step.pose);
        if (step.done) glideRef.current = null;
      }
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
      let emphasis: ReadonlySet<string> | null = null;
      const focus = hoverRef.current ?? selectedId;
      // THE LIT TOPIC (graph_canvas_spotlight.ts): the topic whose panel row
      // the pointer rests on (a preview; one with a circle on this graph)
      // before the focused one.
      // A hovered topic whose circle is off-screen lights nothing (no veil
      // over a graph where nothing would be lit: review 2026-11-10 blocker).
      const hoverCircle = topicsOn && placement && hoverTopicRef.current !== null ? placement.circleById.get(hoverTopicRef.current) : undefined;
      const hoverOnScreen = hoverCircle ? circleMeetsCanvas(toScreen(hoverCircle.x, hoverCircle.y), hoverCircle.r * cam.zoom, w, h) : false;
      const hoveredTopic = topicsOn && seated && hoverOnScreen && hoverTopicRef.current !== null && (seated.rowsOf.get(hoverTopicRef.current)?.length ?? 0) > 0 ? hoverTopicRef.current : null;
      const litKey = topicsOn && seated ? litTopicKey(hoveredTopic, picked) : null;
      const litRows = litRowsOf(litKey, seated ? seated.rowsOf : null, pc.gen);
      // THE ROWS THE PANEL LIGHTS (onHoverRows), before the hovered topic:
      // exactly these memories, the circles holding them lit as a hovered
      // topic's; none of those circles on screen lights nothing (the
      // hovered-topic rule).
      const rowsSpot = topicsOn && seated && placement ? litRowsSpotOf(hoverRowsRef.current, seated.circleOfRow, pc.gen) : null;
      const rowsLit = rowsSpot && litRowsOnScreen(rowsSpot, (key) => {
        const c = placement?.circleById.get(key);
        return c ? circleMeetsCanvas(toScreen(c.x, c.y), c.r * cam.zoom, w, h) : false;
      }) ? rowsSpot : null;
      // ONE mechanism, ordered triggers (recall_emphasis.emphasisDriver):
      // rows lit from the panel > a topic hovered in the panel >
      // lens/search/topic filter > hovered/selected node > current recall.
      // The hovered topic (or rows) lights its memories as a filter does
      // (its preview wins while the pointer rests).
      const topicHover = hoveredTopic !== null && litRows !== null;
      const driver = topicHover
        ? "filter"
        : emphasisDriver({
            filter: searchIds !== null || rowsLit !== null,
            hover: hoverRef.current !== null && layout.has(hoverRef.current),
            selected: selectedId !== null && layout.has(selectedId),
            recall: recall !== null,
          });
      if (topicHover) {
        emphasis = litRows;
      } else if (driver === "filter") {
        emphasis = searchIds;
      } else if (driver === "recall" && recall) {
        emphasis = recall.ids;
      } else if (driver === "focus") {
        if (focus && layout.has(focus)) {
          const near = new Set([focus]);
          const weighted: Array<{ id: string; w: number }> = [];
          for (const e of fold.edges.values()) {
            if (e.a === focus) weighted.push({ id: e.b, w: e.count });
            else if (e.b === focus) weighted.push({ id: e.a, w: e.count });
          }
          weighted.sort((x, y) => y.w - x.w);
          for (const { id } of weighted.slice(0, NEIGHBOR_CAP)) near.add(id);
          for (const se of structuralResolved) {
            if (se.a === focus) near.add(se.b);
            if (se.b === focus) near.add(se.a);
          }
          emphasis = near;
        }
      }
      // The rows the panel lights win over every other trigger (a hovered
      // topic included): exactly their set.
      if (rowsLit) emphasis = rowsLit.rows;
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

      // HIS TOPICS (the "topics" toggle): each community's circle where it is
      // served (moved where the viewer dragged it), its authored title just
      // outside — placed only where it covers no node and no other title,
      // never under the overlays; hidden when zoomed far out. Drawn first,
      // under every edge and node. A topic with no emphasized member dims
      // with the rest (same eased dim as nodes); the focused one is drawn
      // stronger.
      const cssH = canvas.height / (window.devicePixelRatio || 1);
      const topicHalos: Array<{ label: string; topic: string; color: string; cx: number; cy: number; r: number; hd: number; gain: number }> = [];
      // THE SPOTLIGHT (graph_canvas_spotlight.ts; operator 2026-11-10: an
      // activated topic was "barely" visible): the lit topic's circle is
      // tinted, ringed and glowing, its memories ringed in its colour, the
      // rest under a veil; each circle's gain eases on the dim ramp.
      let litHalo: (typeof topicHalos)[number] | null = null;
      if (topicsOn && placement && seated) {
        for (const circle of placement.circles) {
          const ids = seated.rowsOf.get(circle.id);
          const c = communityByKey.get(circle.id);
          // A topic none of whose memories the graph has loaded draws NO
          // circle and no title (review S1): an empty ring would claim a
          // place on the map for memories this view does not hold, and a
          // title there would frame nothing; the panel names it, with its
          // count, and says why its list is empty.
          if (!ids || ids.length === 0 || !c) continue;
          let hits = false;
          if (emphasis) for (const id of ids) if (emphasis.has(id)) { hits = true; break; }
          const color = topicColor(circle.id);
          const at = toScreen(circle.x, circle.y);
          const R = circle.r * cam.zoom;
          const lit = circleLit(circle.id, rowsLit, litKey);
          const hd = easedDim(`topic:${circle.id}`, topicDimTarget({ lit, anyLit: rowsLit ? rowsLit.circles.size > 0 : litKey !== null, emphasis: emphasis !== null, emphasisHits: hits }));
          // The gain eases 0 -> 1 (stored as 1 - gain: the ramp's rest is 1).
          const gain = 1 - easedDim(`topiclit:${circle.id}`, lit ? 0 : 1);
          const style = topicCircleStyle(gain);
          ctx.beginPath();
          ctx.arc(at.x, at.y, R, 0, Math.PI * 2);
          ctx.fillStyle = hexAlpha(color, style.fill * hd);
          ctx.fill();
          const halo = { label: topicTitle(c, TITLE_BEING_WRITTEN), topic: circle.id, color, cx: at.x, cy: at.y, r: R, hd, gain };
          // A lit (or still easing) ring is drawn over the veil, after the memories.
          if (gain <= 0) {
            ctx.strokeStyle = hexAlpha(color, style.stroke * hd);
            ctx.lineWidth = style.width;
            ctx.stroke();
          }
          if (lit && litKey === circle.id) litHalo = halo;
          topicHalos.push(halo);
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
        if (!drawnOutside(hiddenRows, se.a, selectedId) || !drawnOutside(hiddenRows, se.b, selectedId)) continue;
        const a = toScreen(la.x, la.y);
        const b = toScreen(lb.x, lb.y);
        const dim = edgeDim(se.a, se.b, null);
        // The hovered or selected memory's own born-linked lines show (the
        // topology grey, FOCUS_EDGE_FLOOR); every other one is the one dark
        // grey, the scale's dark end at EDGE_QUIET_ALPHA (was the light
        // topology grey at 0.16: Castor's 3 999 lines, packed in his topics'
        // circles, summed to a pale haze; a dark colour stays dark however
        // many lines cross: backlog 0025).
        const seLit = driver === "focus" && emphasis !== null && emphasis.has(se.a) && emphasis.has(se.b);
        ctx.globalAlpha = dim;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        // Uniform faint SOLID line — the type no longer rides a dash
        // pattern (indistinguishable at this alpha); it rides the glyph.
        ctx.setLineDash([]);
        ctx.strokeStyle = seLit ? rgbaOf(CANVAS_THEME.dim, FOCUS_EDGE_FLOOR) : rgbaOf(CANVAS_THEME.cold, EDGE_QUIET_ALPHA);
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
          ctx.strokeStyle = rgbaOf(CANVAS_THEME.dim, (seLit ? 0.55 : 0.22) * dim);
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.restore();
        }

        ctx.globalAlpha = 1;
      }
      ctx.setLineDash([]);

      // THE USAGE SCALE on the co-use lines (operator 2026-11-09, backlog
      // 0025): colour, opacity and width follow the line's rank in this
      // life (graph_usage usageEdgeStyle) — the trails he has not walked
      // much are the born-linked lines' one dark grey, the upper third
      // turns green on a steep curve, his most used tenth is bright and
      // wider. Under the recall a TRAVELLED path takes its ring's colour at
      // full strength and every other line dims (edgeDim). The amber flash
      // stays the "just traveled" overlay.
      // A lit line (a hovered memory's) ramps from the topology grey, every
      // other from the scale's dark grey (it stays dark when thousands cross).
      const usageStroke = (mix: number, alpha: number, lit: boolean) => {
        const c = usageRgb(mix, lit ? CANVAS_THEME.dim : CANVAS_THEME.cold, CANVAS_THEME.warm);
        return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
      };
      for (const e of fold.edges.values()) {
        const la = layout.get(e.a);
        const lb = layout.get(e.b);
        if (!la || !lb) continue;
        if (!drawnOutside(hiddenRows, e.a, selectedId) || !drawnOutside(hiddenRows, e.b, selectedId)) continue;
        const a = toScreen(la.x, la.y);
        const b = toScreen(lb.x, lb.y);
        const age = scrubSeq - e.last_seq;
        const recent = age >= 0 && age <= pulseWindow ? 1 - age / pulseWindow : 0;
        const path = travelled?.get(e.key);
        const place = usage.edges.get(e.key) ?? 0;
        const look = usageEdgeStyle(place, usage.edgeTiers);
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
          const focusLit = driver === "focus" && emphasis !== null && emphasis.has(e.a) && emphasis.has(e.b);
          ctx.strokeStyle = usageStroke(look.mix, focusLit ? Math.min(1, Math.max(FOCUS_EDGE_FLOOR, look.alpha * FOCUS_LIT_GAIN)) : look.alpha, focusLit);
          ctx.lineWidth = look.width;
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

      // The lit circles holding the panel's rows, by key (their rings' colour and gain).
      const rowHalos = rowsLit ? new Map(topicHalos.filter((hl) => rowsLit.circles.has(hl.topic)).map((hl) => [hl.topic, hl] as const)) : null;

      // Memory nodes (the hidden records left out).
      for (const node of fold.nodes.values()) {
        const ln = layout.get(node.id);
        if (!ln) continue;
        if (!drawnOutside(hiddenRows, node.id, selectedId)) continue;
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
        // THE SPOTLIGHT: the lit topic's memory, ringed in its colour (the
        // rows the panel lights instead, each in its own topic's).
        const ringHalo = rowsLit
          ? (rowsLit.rows.has(node.id) ? rowHalos?.get(seated?.circleOfRow.get(node.id) ?? "") ?? null : null)
          : litHalo && litRows !== null && litRows.has(node.id) ? litHalo : null;
        if (ringHalo && ringHalo.gain > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + MEMBER_RING.gap, 0, Math.PI * 2);
          ctx.strokeStyle = hexAlpha(ringHalo.color, MEMBER_RING.alpha * ringHalo.gain);
          ctx.lineWidth = MEMBER_RING.width;
          ctx.stroke();
        }
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

      // THE SPOTLIGHT'S VEIL: the canvas background over everything but the
      // circles still lit (one veil, a hole per circle: circles never
      // overlap), then their rings and glow on top of it.
      const easing = topicHalos.filter((hl) => hl.gain > 0);
      if (easing.length > 0) {
        ctx.beginPath();
        ctx.rect(0, 0, cssW, cssH);
        for (const hl of easing) {
          ctx.moveTo(hl.cx + hl.r, hl.cy);
          ctx.arc(hl.cx, hl.cy, hl.r, 0, Math.PI * 2);
        }
        ctx.fillStyle = rgbaOf(CANVAS_THEME.bg, veilAlpha(easing.map((hl) => hl.gain)));
        ctx.fill("evenodd");
        for (const hl of easing) {
          const style = topicCircleStyle(hl.gain);
          ctx.beginPath();
          ctx.arc(hl.cx, hl.cy, hl.r + TOPIC_GLOW.gap, 0, Math.PI * 2);
          ctx.strokeStyle = hexAlpha(hl.color, style.glow * hl.hd);
          ctx.lineWidth = TOPIC_GLOW.width;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(hl.cx, hl.cy, hl.r, 0, Math.PI * 2);
          ctx.strokeStyle = hexAlpha(hl.color, style.stroke * hl.hd);
          ctx.lineWidth = style.width;
          ctx.stroke();
        }
      }

      // Topic LABELS go last, on top: they were placed off every node, so
      // on top they cover only the faint edges under their plate.
      let labelHits: Array<{ rect: Rect; topic: string; label: string }> = [];
      if (topicHalos.length > 0 && cam.zoom >= TOPIC_LABEL_MIN_ZOOM) {
        ctx.font = "600 11px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // The DOM overlays over the canvas (the Topics panel, the Context
        // legend, the kinds legend, the motion buttons): a title never
        // hides under one. Their rects are cached (OverlayRects).
        const overlayRects = overlays.current();
        const titlesKey = `${cam.x}|${cam.y}|${cam.zoom}|${cssW}|${cssH}|${overlays.rev}|${pc.gen}|${reseat ? reseat.start : 0}|${reseat ? ease : 1}|${layout.size}|${topicHalos.length}|${hiddenRows ? hiddenRows.size : "all"}|${litKey}`;
        if (titlesCache.key !== titlesKey) {
          titlesCache.key = titlesKey;
          titlesCache.placed = [];
          const screenNodes: Array<{ x: number; y: number; r: number }> = [];
          for (const ln of layout.values()) {
            if (!drawnOutside(hiddenRows, ln.id, selectedId)) continue;
            const p = toScreen(ln.x, ln.y);
            screenNodes.push({ x: p.x, y: p.y, r: Math.max(2.5, ln.r * cam.zoom * 0.75) + 3 });
          }
          const placed: Rect[] = [];
          // The lit topic's title is placed first: it takes its best place.
          const order = litHalo ? [litHalo, ...topicHalos.filter((hl) => hl !== litHalo)] : topicHalos;
          for (const halo of order) {
            if (halo.r < TOPIC_LABEL_MIN_SCREEN_R) continue;
            // Never cut mid-word at a fixed count: the title wraps onto two
            // lines; the hover card carries the whole title.
            const words = halo.label;
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
              // strip; the legend owns the bottom-left corner; no overlay.
              blocked: (rc) => rc.y < 78 || overlayBand(rc.x, rc.y) || (rc.y + rc.h > cssH - 78 && rc.x < cssW - 190) || overlayRects.some((o) => rectsMeet(o, rc)),
            });
            // The lit topic's title is always drawn: framed, its circle fills
            // the canvas and no place around it is free — then just inside
            // its top edge (review 2026-11-10). Another topic's title is not
            // drawn inside the lit circle.
            const at = rect ?? (halo === litHalo && circleMeetsCanvas({ x: halo.cx, y: halo.cy }, halo.r, cssW, cssH) ? litPlateFallback(halo, w, h, { w: cssW, h: cssH }, 82) : null);
            if (!at) continue;
            if (litHalo && halo !== litHalo && plateInDisc(at, litHalo)) continue;
            placed.push(at);
            titlesCache.placed.push({ rect: at, topic: halo.topic, label: words, lines });
          }
        }
        labelHits = titlesCache.placed;
        const haloOf = new Map(topicHalos.map((hl) => [hl.topic, hl]));
        for (const { rect, topic, lines } of titlesCache.placed) {
          const halo = haloOf.get(topic);
          if (!halo) continue;
          ctx.globalAlpha = halo.hd;
          ctx.beginPath();
          ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 9);
          ctx.fillStyle = rgbaOf(CANVAS_THEME.bg, 0.82 + 0.12 * halo.gain);
          ctx.fill();
          // The lit topic's plate: tinted and ringed at full strength.
          if (halo.gain > 0) {
            ctx.fillStyle = hexAlpha(halo.color, 0.2 * halo.gain);
            ctx.fill();
          }
          ctx.strokeStyle = hexAlpha(halo.color, 0.55 + 0.45 * halo.gain);
          ctx.lineWidth = 1 + halo.gain;
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
      const hidden = hiddenRowsRef.current;
      const sel = stateRef.current.selectedId;
      for (const ln of layoutRef.current.values()) {
        if (!drawnOutside(hidden, ln.id, sel)) continue; // not drawn: not under the pointer
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
      glideRef.current = null; // the viewer's zoom wins over a glide
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
      // The card at the press: a second tap on a pinned memory opens it. A
      // press on a topic's title holds that circle (a drag moves it).
      const title = stateRef.current.served && !hitTest(ev.clientX, ev.clientY) ? topicLabelAt(ev.clientX, ev.clientY) : null;
      dragRef.current = { x: ev.clientX, y: ev.clientY, moved: false, card: cardRef.current, circle: title?.topic ?? null };
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
      const servedNow = stateRef.current.served;
      if (drag.circle && servedNow) {
        // THE VIEWER'S DRAG: the circle follows the pointer; the circles it
        // meets are pushed away and stay there (communities.dragCircle:
        // repel only, never an attraction).
        if (!drag.moved) return;
        offsetsRef.current = dragCircle(servedNow, offsetsRef.current, drag.circle, dx / cam.zoom, dy / cam.zoom);
        offsetsRevRef.current += 1;
      } else {
        if (drag.moved) glideRef.current = null; // the viewer's pan wins over a glide
        cam.x -= dx / cam.zoom;
        cam.y -= dy / cam.zoom;
      }
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
      canvas.style.cursor = hit ? "pointer" : label ? "move" : "grab";
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
      if (drag?.circle && drag.moved) {
        // A dragged circle stays where the viewer left it (per life).
        const key = layoutKeyRef.current;
        if (key) {
          try {
            localStorage.setItem(topicOffsetsStorageKey(key), serializeOffsets(offsetsRef.current));
          } catch {
            // Quota/private mode: the drag holds for this session only.
          }
        }
        return;
      }
      if (!drag || drag.moved) return;
      const label = ev.target === canvas ? topicLabelAt(ev.clientX, ev.clientY) : null;
      const plan = stateRef.current.served;
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
      // A topic's title is a door: it focuses that topic (the graph frames
      // its circle and lights its memories; the panel lists them).
      if (label && plan) {
        focusTopicRef.current(label.topic);
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
      overlays.dispose();
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
  // Which topic a memory belongs to — every member, diary and identity too.
  const hoverTopic = hoverNode && membership ? membership.circleOfRow.get(hoverNode.id) ?? null : null;
  const hoverActions = hoverNode
    ? nodeActions(hoverNode, { topic: hoverTopic, partners: partnerCount(fold, hoverNode.id) })
    : cardNodeId?.startsWith("standing:")
      ? [{ id: "open" as const, label: "Open in Detail" }]
      : [];
  // The recall line shows while the recall is what the canvas lights (a
  // lens/search or a selection takes over — the Inspector's rule).
  const selectionIsNode = selectedRow !== null && (fold.nodes.has(selectedRow) || selectedRow.startsWith("standing:"));
  const topicCard = card?.kind === "topic" && showTopics ? communityByKey.get(card.topic) ?? null : null;
  // A topic's leading memories: its most used members, by title (never a
  // private diary entry's words).
  const topicLeading = useMemo(() => {
    if (!topicCard || !membership) return [];
    const ids = membership.rowsOf.get(topicCard.key) ?? [];
    return ids
      .map((id) => fold.nodes.get(id))
      .filter((n): n is NodeState => Boolean(n) && !n!.redacted && !n!.diary)
      .sort((x, y) => y.selected_count - x.selected_count || x.first_seq - y.first_seq)
      .slice(0, 3)
      .map((n) => ({ id: n.id, title: nodeCardText(n).title }));
  }, [topicCard, membership, fold]);
  const recallShown = recall !== null && searchIds === null && !selectionIsNode;
  // The lit line the pointer rests on: "<recalled> — reached from <shelf> · <relation>".
  const tipLine = lineTip && recallShown ? litLines.get(lineTip.key) ?? null : null;
  const tipTo = tipLine ? fold.nodes.get(tipLine.to) ?? null : null;
  const tipFrom = tipLine ? fold.nodes.get(tipLine.from) ?? null : null;
  const recallLabelOf = (id: string): string | null => (recall ? recall.labels.get(id) ?? null : null);
  const hoverStanding = cardNodeId && !hoverNode && cardNodeId.startsWith("standing:")
    ? fold.standings.get(cardNodeId.slice("standing:".length)) ?? null
    : null;

  /** The pick a topic's key makes: its memories present and its title. */
  const pickOf = (key: string): { key: string; rowIds: Set<string>; label: string } | null => {
    const c = communityByKey.get(key);
    if (!c || !membership) return null;
    return { key, rowIds: new Set(membership.rowsOf.get(key) ?? []), label: topicTitle(c, TITLE_BEING_WRITTEN) };
  };
  /** How many of a topic's memories the graph has loaded (its list). */
  const loadedOf = (key: string): number => membership?.rowsOf.get(key)?.length ?? 0;
  /** FOCUS a topic (its title on the graph, the panel, a card): the camera
   * frames its circle, its memories light (the topic filter), the panel
   * lists them. null lets it go. World positions are untouched. A topic
   * none of whose memories the graph has loaded has no circle: it stays
   * focused (the panel marks it and says so in one sentence) and the camera
   * holds (review S1). */
  const focusTopic = (key: string | null) => {
    if (key === null) {
      onPickTopic(null);
      return;
    }
    const pick = pickOf(key);
    if (!pick) return;
    onPickTopic(pick);
    if (pick.rowIds.size === 0) return;
    // Framed once the panel has settled (it may just have folded).
    requestAnimationFrame(() => frameTopic(key));
  };
  /** The camera on a topic's circle, in the part the panel leaves free. */
  const frameTopic = (key: string) => {
    const circle = placementCacheRef.current.placement?.circleById.get(key);
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (circle && canvas && rect && rect.width >= 10) {
      // Framed in the part of the canvas the Topics panel leaves free.
      const panelEl = floatRef.current?.querySelector(".gc_topics");
      const pr = panelEl?.getBoundingClientRect();
      const panel = pr && pr.width > 0 ? { x: pr.left - rect.left, y: pr.top - rect.top, w: pr.width, h: pr.height } : null;
      const free = freeCentre({ w: rect.width, h: rect.height }, panel);
      // A glide to it (CAMERA_GLIDE_MS), never a jump (reduced motion: one step).
      const zoom = Math.min(4, Math.max(0.12, Math.min(free.w, free.h) / (2 * circle.r + 120)));
      moveCamera({ x: circle.x + (rect.width / 2 - free.x) / zoom, y: circle.y + (rect.height / 2 - free.y) / zoom, zoom });
    }
  };
  /** The camera on these memories (the panel's onFrameRows), in the part
   * of the canvas the panel leaves free, Fit view's padding and zoom clamp. */
  const frameRows = (ids: string[]) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect || rect.width < 10) return;
    const points: LayoutNode[] = [];
    for (const id of ids) {
      const ln = layoutRef.current.get(id);
      if (ln) points.push(ln);
    }
    const panelEl = floatRef.current?.querySelector(".gc_topics");
    const pr = panelEl?.getBoundingClientRect();
    const panel = pr && pr.width > 0 ? { x: pr.left - rect.left, y: pr.top - rect.top, w: pr.width, h: pr.height } : null;
    const pose = framePointsPose(points, { w: rect.width, h: rect.height }, freeCentre({ w: rect.width, h: rect.height }, panel));
    if (pose) moveCamera(pose);
  };
  /** A press on the page panel: its grip (move), its head bar (a move once
   * the pointer travels PANEL_DRAG_SLOP; short of it, the head's own click
   * folds the panel) or its corner (size: the edge under the pointer moves,
   * no other; docked, its height only, and it stays docked). The panel
   * follows the pointer with pointer capture, one paint per frame: a move is
   * a transform (the compositor's, no layout, no re-render), a resize writes
   * the panel box's own size; both are kept and remembered on release
   * (overlay_stack movePanel / resizePanel, clamped to the window). */
  const startPanelDrag = (ev: React.PointerEvent<HTMLElement>) => {
    panelDraggedRef.current = false;
    if (!pagePanel) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    const target = ev.target instanceof Element ? ev.target : null;
    const mode = !target || target.closest(".gc_tp_dock") ? null : target.closest(".gc_tp_resize") ? "size" : target.closest(".gc_tp_grip") ? "move" : target.closest(".gc_tp_head") ? "head" : null;
    const box = floatRef.current;
    const dock = panelDockRef.current;
    const host = panelHostRef.current;
    if (mode === null || !box || !dock || !host) return;
    // The head keeps its press (its click folds the panel when it never moved).
    if (mode !== "head") ev.preventDefault();
    const hr = host.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const start = { x: br.left - hr.left, y: br.top - hr.top, w: br.width, h: br.height };
    const view = { w: hr.width, h: hr.height };
    const from = panelFloatRef.current;
    const openList = box.dataset.list === "true";
    const pointer = ev.pointerId;
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    let last = { x: x0, y: y0 };
    let dragging = mode !== "head";
    let next = from;
    let frame = 0;
    if (dragging) box.setPointerCapture(pointer);
    const paint = () => {
      frame = 0;
      const dx = last.x - x0;
      const dy = last.y - y0;
      if (mode === "size") {
        next = resizeFloat(from, start, dx, dy, view, dock.canvasBottom);
        for (const [k, v] of Object.entries(panelVars(next, dock))) box.style.setProperty(k, v);
        box.dataset.sized = "true";
      } else {
        next = moveFloat(from, start, dx, dy, view, openList);
        const at = next.at ?? start;
        box.style.transform = `translate(${at.x - start.x}px, ${at.y - start.y}px)`;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      last = { x: e.clientX, y: e.clientY };
      if (!dragging) {
        if (Math.hypot(last.x - x0, last.y - y0) < PANEL_DRAG_SLOP) return;
        dragging = true;
        panelDraggedRef.current = true;
        box.setPointerCapture(pointer);
      }
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onEnd = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      if (!dragging) return;
      if (frame) cancelAnimationFrame(frame);
      paint();
      if (mode !== "size") {
        // Where the transform had it, as its place, at the height it had;
        // then no transform (no jump, of the place or of the size).
        for (const [k, v] of Object.entries(panelVars(next, dock))) box.style.setProperty(k, v);
        box.dataset.docked = "false";
        if (next.h !== null) box.dataset.sized = "true";
        box.style.transform = "";
      }
      if (next !== from) setPanelFloat(next);
      overlaysRef.current?.invalidate();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };
  const focusTopicRef = useRef(focusTopic);
  focusTopicRef.current = focusTopic;
  // A LEDGER ROW ABOUT A TOPIC (ledger_lines.topicTarget): the panel opens,
  // focused on it, once the topics are read (topicRequestStep); each
  // request once.
  const topicRequestDoneRef = useRef<number | null>(null);
  useEffect(() => {
    if (!topicRequest || topicRequestDoneRef.current === topicRequest.nonce || !showTopics) return;
    const step = topicRequestStep(topicsView, membership !== null && communityByKey.has(topicRequest.key));
    if (step === "wait") return;
    topicRequestDoneRef.current = topicRequest.nonce;
    setTopicsOpen(true);
    if (step === "focus") focusTopicRef.current(topicRequest.key);
  }, [topicRequest, showTopics, topicsView, membership, communityByKey]);
  // LIVE: a new version keeps the focused topic (by its stable key) with
  // its new members; a topic that dissolved lets go. Emitted only when the
  // members present changed.
  const pickedRowsRef = useRef<string>("");
  useEffect(() => {
    if (!pickedTopic || !membership) {
      pickedRowsRef.current = "";
      return;
    }
    const pick = pickOf(pickedTopic);
    if (!pick) {
      if (served) onPickTopicRef.current(null);
      return;
    }
    const sig = `${pick.key}\u0000${pick.label}\u0000${[...pick.rowIds].join("\u0000")}`;
    if (pickedRowsRef.current === "") {
      pickedRowsRef.current = sig;
      return;
    }
    if (sig === pickedRowsRef.current) return;
    pickedRowsRef.current = sig;
    onPickTopicRef.current(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership, pickedTopic, served]);

  /** A member of the panel opens where the graph opens it. */
  const openMember = (node: NodeState) => {
    if (memberOpensIn(node) === "book") onShowInBook(node.graph_id ?? node.id);
    else onSelect(node.id);
  };

  /** A card action (or a pinned card's second tap: "default"). */
  const runCardAction = (id: CardActionId | "default") => {
    const c = cardRef.current;
    if (!c) return;
    if (c.kind === "node") {
      const node = fold.nodes.get(c.id) ?? null;
      const topic = membership?.circleOfRow.get(c.id) ?? null;
      const actions = node ? nodeActions(node, { topic, partners: partnerCount(fold, c.id) }) : [{ id: "open" as const, label: "" }];
      const act = id === "default" ? actions[0]?.id ?? "open" : id;
      cardCtl.close();
      if (act === "book" && node) onShowInBook(node.graph_id ?? node.id);
      else if (act === "open") onSelect(c.id);
      else if (act === "topic" && topic !== null) focusTopic(topic);
      else if (act === "partners") {
        // Detail at its "Used together with" list: unfolded, scrolled to.
        writeSectionOpen("partners", true);
        onSelect(c.id);
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("ei-section-partners")?.scrollIntoView({ block: "start", behavior: "smooth" })));
      }
      return;
    }
    cardCtl.close();
    if (id === "light" || id === "default") focusTopic(c.topic);
    else if (id === "members") {
      // Its memories, listed: the topic focused and the panel open.
      focusTopic(c.topic);
      setTopicsOpen(true);
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
  // What a phone-width canvas shows of the Context legend and the Topics
  // panel (overlay_stack.ts): the panel open on its list is a sheet in the
  // legend's slot; its one sentence (not served) is a line, like its head.
  const panelView = showTopics && topicsView ? topicsPanelView ?? topicsView : null;
  const stack = overlayStack(
    !panelView ? "none" : topicsOpen && topicsNote(panelView) === null ? "open" : "line",
    !(recallShown && recall) ? "none" : legendOpen ? "open" : "folded",
  );
  // THE KINDS LEGEND'S ROOM (review F2): the legend is the canvas wrap's
  // child, not the stack's, so the docked panel's width reaches it as a
  // custom property on the wrap (entity.css reads --gc-tp-reserve there).
  const footReserve = legendReserve(panelView ? panelFloat : null, stack.topics === "sheet");
  useEffect(() => {
    const wrap = canvasRef.current?.parentElement;
    if (!wrap) return;
    wrap.style.setProperty("--gc-tp-reserve", footReserve);
    return () => {
      wrap.style.removeProperty("--gc-tp-reserve");
    };
  }, [footReserve]);

  // THE TOPICS PANEL (topics_panel.tsx): the drill-down, or the one sentence
  // while his topics are not served. On a wide canvas its box floats over
  // the page (its head bar and grip, its corner, "put back"); on a phone the
  // box draws nothing (the stack's foot).
  const panelBox = panelView ? (
    <div
      ref={floatRef}
      className="gc_topics_float"
      data-page={pagePanel ? "true" : "false"}
      data-docked={panelFloat.at === null ? "true" : "false"}
      data-sized={panelFloat.h !== null ? "true" : "false"}
      data-list={stack.topics === "sheet" ? "true" : "false"}
      style={pagePanel && panelDock ? (panelVars(panelFloat, panelDock) as React.CSSProperties) : undefined}
      onPointerDown={startPanelDrag}
      onClickCapture={(ev) => {
        // The click that ends a move from the head bar is not a fold.
        if (!panelDraggedRef.current) return;
        panelDraggedRef.current = false;
        ev.stopPropagation();
        ev.preventDefault();
      }}
    >
      <TopicsPanel
        view={panelView}
        fold={fold}
        rowsOf={membership?.rowsOf ?? EMPTY_ROWS}
        waiting={waitingCount}
        focused={pickedTopic}
        open={topicsOpen}
        onToggle={setTopicsOpen}
        onFocus={(key) => {
          // On a phone the open panel covers the short canvas: a topic
          // picked there folds it so the graph shows the circle (its
          // members stay one tap away, unfolded under its title). A
          // topic with none of its memories loaded has no circle: the
          // panel stays open on its sentence.
          if (key !== null && narrowViewport() && loadedOf(key) > 0) setTopicsOpen(false);
          focusTopic(key);
        }}
        onOpenMember={openMember}
        onHoverTopic={(key) => {
          hoverTopicRef.current = key;
        }}
        onHoverRows={(ids) => {
          hoverRowsRef.current = ids === null ? null : new Set(seamRows(fold, ids, "onHoverRows"));
        }}
        onFrameRows={(ids) => frameRows(seamRows(fold, ids, "onFrameRows"))}
        onRetry={retryTopics}
        colorOf={(n) => KIND_COLORS[nodeClass(n)] ?? KIND_COLORS.unknown}
      />
      {pagePanel ? (
        <div className="gc_tp_grip" aria-hidden="true" title="Drag to move the panel (or drag its title bar)">
          ⠿
        </div>
      ) : null}
      {pagePanel && panelFloat.at !== null ? (
        // Moved: one control puts it back (docked top-right, its size
        // kept). Never the head's double-click: the head is the fold
        // button, and a double-click folded and unfolded it (review F1).
        <button type="button" className="gc_tp_dock" title="Put the panel back at the top right" onClick={() => setPanelFloat({ ...panelFloatRef.current, at: null })}>
          put back
        </button>
      ) : null}
      {pagePanel && stack.topics === "sheet" ? <div className="gc_tp_resize" aria-hidden="true" title="Drag to resize the panel" /> : null}
    </div>
  ) : null;

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
      {card?.kind === "topic" && topicCard ? (
        <HoverCardBox ref={cardElRef} x={card.x} y={card.y} className="gc_hovercard gc_topic_card" onEnter={onCardEnter} onLeave={onCardLeave}>
          <div className="gc_hc_head" style={{ borderLeft: `3px solid ${topicColor(topicCard.key)}`, paddingLeft: 8 }}>
            <span className="gc_hc_kind_dot" style={{ background: topicColor(topicCard.key) }} aria-hidden="true" />
            <span className="ei_kind">topic</span>
            <span className={`gc_hc_title gc_topic_words${topicCard.titlePending ? " gc_topic_pending" : ""}`}>{topicTitle(topicCard, TITLE_BEING_WRITTEN)}</span>
          </div>
          {/* Its authored summary (Markdown), or that it is being written. */}
          {topicCard.summaryPending ? (
            <div className="gc_hc_summary gc_hc_plain gc_topic_pending">{topicSummary(topicCard)}</div>
          ) : topicCard.summary ? (
            <Words text={topicCard.summary} className="gc_hc_summary" />
          ) : null}
          {topicLeading.length ? (
            <div className="gc_topic_most">
              <span className="gc_topic_most_word">most used</span>
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
              {/* The panel's words: what it holds, and how many of them are loaded when that differs. */}
              {topicCountWords(heldCount(topicCard), loadedOf(topicCard.key))}
              {topicCard.provisional.size > 0 ? ` (${topicCard.provisional.size} placed until his next sleep)` : ""}
            </span>
          </div>
          {/* "N memories →" opens the list: N is its length. */}
          <CardActions actions={topicActions(loadedOf(topicCard.key))} onAction={runCardAction} />
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
      {/* THE PHONE OVERLAY STACK (overlay_stack.ts): on a phone-width canvas
        * the Context legend and the Topics panel are one column — the legend
        * on top, never under the panel; open, the panel takes its slot and
        * the legend steps aside. A wide canvas draws no box (display:
        * contents): the legend keeps its place (leaving the docked panel its
        * width), the panel floats over the page (portaled below). */}
      <div
        ref={stackRef}
        className="gc_overlay_stack"
        data-legend={stack.legend}
        data-topics={stack.topics}
        style={
          panelView || contextAt
            ? ({
                ...(panelView ? { "--gc-tp-top-reserve": topReserve(panelFloat) } : {}),
                ...(contextAt ? { "--gc-rl-top": "10px", "--gc-rl-centre": `${contextAt.centre}px`, "--gc-rl-max": `${contextAt.max}px`, "--gc-rl-z": "6" } : {}),
              } as React.CSSProperties)
            : undefined
        }
      >
        {recallShown && recall ? (
          // THE CONTEXT LEGEND (operator 2026-11-09): the rings counted; what
          // each colour means, the lit lines and the grey-to-green fill.
          <ContextLegend recall={recall} open={legendOpen} onToggle={setLegendOpen} />
        ) : null}
        {pagePanel ? null : panelBox}
      </div>
      {pagePanel && panelBox && panelHost ? createPortal(panelBox, panelHost) : null}
      {/* Motion controls: icon + WORD labels (operator 2026-07-15 — the
        * bare 🌊⚓♻️🎯 emoji row read as mystery meat). aria-pressed marks
        * the freeze toggle's state. Served topics place every memory (no
        * simulation): freeze and settle have nothing to do then. ONE row
        * (operator 2026-11-11): the closed-memories toggle, fit, then freeze
        * and settle when they show. */}
      <div ref={motionRef} className="gc_motion_controls">
        {served && outside && outside.closed > 0 ? (
          // THE CLOSED MEMORIES: hidden by default; this pressed toggle
          // shows them on their ring (graph_canvas_outside.ts). Left of fit
          // (operator 2026-11-10 20:13, backlog 0028).
          <button
            className={`gc_btn gc_outside_toggle ${showOutside ? "gc_btn_on" : ""}`}
            aria-pressed={showOutside}
            title={closedTitle(outside)}
            aria-label={`${outside.closed} ${closedWord(outside.closed)}`}
            onClick={() => setShowOutside((v) => !v)}
          >
            ◌ <span className="gc_btn_count">{outside.closed}</span>
            <span className="gc_btn_word">{closedWord(outside.closed)}</span>
          </button>
        ) : null}
        <button
          className="gc_btn"
          title="Fit view — recenter the camera on the whole graph"
          onClick={() => {
            // The records drawn (the hidden records left out).
            const nodes = Array.from(layoutRef.current.values()).filter((n) => drawnOutside(hiddenRowsRef.current, n.id, selectedRow));
            if (nodes.length === 0) return;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const n of nodes) {
              minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
              minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
            }
            const canvas = canvasRef.current;
            const rect = canvas?.getBoundingClientRect();
            const spanX = Math.max(120, maxX - minX + 120);
            const spanY = Math.max(120, maxY - minY + 120);
            // A glide to the whole graph (reduced motion: one step).
            moveCamera({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: rect ? Math.min(6, Math.max(0.12, Math.min(rect.width / spanX, rect.height / spanY))) : cameraRef.current.zoom });
          }}
        >
          ⛶ <span className="gc_btn_word">fit</span>
        </button>
        {served ? null : (
          <>
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
          </>
        )}
      </div>
    </>
  );
}

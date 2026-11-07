/**
 * Topics as the NATURAL layout of the memory graph (operator 2026-11-07:
 * "all the memory nodes should have been naturally grouped by topics so we
 * don't have to click on 'topics' to alter the graph; it would at best
 * show the labels of nodes already clustered").
 *
 * The communities themselves are computed at the runtime level and served
 * by the gateway (topic_map.fetchCommunities — deterministic Louvain over
 * engraved relations + digest-keyword bridges). This module only turns
 * that payload into GEOMETRY for the canvas's existing force layout:
 *
 * - every topic gets a HOME on the disc (deterministic spiral packing,
 *   outside the identity ring, sized by its free-memory count, a label-
 *   sized gap between homes) that it KEEPS, with its colour, across
 *   refetches and reloads while its members stay the same group (Jaccard
 *   ≥ 0.6); new topics take free room;
 * - a topic's memories hold SEATS inside their home (a small sunflower,
 *   oldest at the centre, newer at the rim — a newer memory never moves an
 *   older one); the canvas pulls each memory to its seat with the SAME
 *   anchor strength the global seats use today, so the engraved-relation
 *   springs keep exactly the say they had (nothing new fights them);
 * - an unclustered memory sits where its relations are: at the mean of
 *   its related memories' seats (no relation into a topic → no topic pull);
 * - a usage trail (co-use edge) between two DIFFERENT topics stays drawn
 *   (its green still says "used together recently") but does not pull:
 *   position by topic, warmth by colour. Otherwise one recall's shelf —
 *   fifty memories co-selected across topics — collapses every topic into
 *   one ball (nerin, measured: 47% of members ended nearer another
 *   topic's centre; 25% with this rule) and the recall highlight could no
 *   longer show WHICH parts of the graph were used. Engraved relations
 *   (structural edges, what the topics are computed from) always pull;
 * - the halo of a topic circles most of its members where they are NOW
 *   (a hub its relations drag across the disc does not inflate it); its
 *   label goes just outside, only where it covers no node or label.
 *
 * Lanes stay lanes: identity (the ring), diary (the shelf) and standing
 * targets (the outer arc) keep their own places — only the free memories
 * of the disc group by topic. Pure functions; the canvas does the drawing.
 */

import type { FoldState, NodeState } from "./stream_fold";
import type { TopicCommunity } from "./topic_map";
import { hash01 } from "./force_layout";
import { summaryLabel } from "./node_label";

const GOLDEN_ANGLE = 2.399963229728653;
/** Seat spacing inside a home: nearest neighbours ≈ 1.77 × this (≈ 55 px)
 * — the repulsion/anchor balance holds seats (see graph_canvas PHYLLO). */
export const TOPIC_SPACING = 31;
/** Rim margin around a home's last seat (node radius + breathing room). */
export const TOPIC_PAD = 20;
/** Gap between two homes: room for a topic label between their halos. */
export const TOPIC_GAP = 64;
/** Pull toward a topic seat: the SAME strength the canvas's global seats
 * use, so the relation springs keep exactly the say they had. */
export const TOPIC_SEAT_STRENGTH = 0.1;
/** Homes stay clear of the identity ring (graph_canvas PHYLLO_INNER_R). */
export const IDENTITY_CLEAR = 175;

const IDENTITY_KIND_NAMES = ["value", "purpose", "trait", "claim"];

/** Stable topic palette (index-keyed by home order) — theme-adjacent
 * mid-tones, legible on both theme groups. */
export const TOPIC_COLORS = [
  "#79c7ff",
  "#7bd88a",
  "#e7b45a",
  "#c084dd",
  "#5eead4",
  "#f28fad",
  "#a8c66c",
  "#8fb8de",
  "#e8a54a",
  "#9d8cff",
  "#6fd6c3",
  "#d98fbf",
];

export interface TopicHome {
  id: number;
  label: string;
  /** Every keyword the runtime gave this topic (the label is the first 3). */
  keywords: string[];
  /** Members the payload counts (all lanes). */
  size: number;
  color: string;
  /** Index into TOPIC_COLORS — kept by a persisting topic. */
  colorIndex: number;
  /** Home centre + radius (world px). */
  x: number;
  y: number;
  r: number;
  /** Free memories the payload counts for this topic (sizes the home). */
  free: number;
  /** The members' GRAPH ids (the identity a later fetch is matched on). */
  members: string[];
  /** The runtime's most representative member (graph id + title). */
  exemplarId: string;
  exemplarTitle: string;
}

/** What the layout remembers of a topic between fetches (and reloads):
 * where its home is, its colour, and who was in it. */
export interface TopicSlot {
  x: number;
  y: number;
  color: number;
  members: string[];
}

/** A refetched topic keeps a previous topic's home and colour when their
 * member sets overlap by Jaccard ≥ this — AbstractNote's communities rule
 * (abstractnote/recall/communities.py KEEP_JACCARD): best overlaps first,
 * each previous topic used once. The runtime's community ids are Louvain
 * labels, not identities (they renumber as the life grows). */
export const KEEP_JACCARD = 0.6;

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Free (disc) members a community counts — its size minus the lanes'
 * kinds (diary entries, identity records). Payload-only, so a home's size
 * never changes with the scrub position. */
export function freeCountOf(c: TopicCommunity): number {
  let lane = Number(c.kinds?.diary ?? 0);
  for (const k of IDENTITY_KIND_NAMES) lane += Number(c.kinds?.[k] ?? 0);
  return Math.max(0, c.size - lane);
}

export function topicRadius(free: number): number {
  return TOPIC_SPACING * Math.sqrt(Math.max(1, free)) + TOPIC_PAD;
}

/** Seat `rank` (0 = oldest) inside a home, relative to its centre. */
export function topicSeatOffset(rank: number): { dx: number; dy: number } {
  const r = TOPIC_SPACING * Math.sqrt(rank + 0.5);
  const a = rank * GOLDEN_ANGLE;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

/** Homes STABLE across refetches (review 2026-11-07: rank-derived homes
 * moved a topic 839-1188 px and recoloured it whenever its size rank
 * changed). A topic matching a previous one (KEEP_JACCARD) keeps that
 * home's centre and colour — only its radius follows its size. New topics
 * take free room: biggest first, each walking a golden spiral out from
 * the identity ring until it clears every home by TOPIC_GAP, coloured with
 * the least-used palette colour. With no previous slots this is the plain
 * deterministic packing (the same payload always maps the same). */
export function planTopicHomes(communities: TopicCommunity[], previous: TopicSlot[] = []): TopicHome[] {
  const sized = communities
    .map((c) => ({ c, free: freeCountOf(c), members: new Set(c.member_ids) }))
    .filter((x) => x.free > 0)
    .sort((a, b) => b.free - a.free || a.c.id - b.c.id);
  const prevSets = previous.map((p) => new Set(p.members));
  const pairs: Array<{ j: number; i: number; k: number }> = [];
  sized.forEach((x, i) => {
    prevSets.forEach((set, k) => {
      const j = jaccard(x.members, set);
      if (j >= KEEP_JACCARD) pairs.push({ j, i, k });
    });
  });
  pairs.sort((a, b) => b.j - a.j || a.i - b.i || a.k - b.k);
  const slotOf = new Map<number, TopicSlot>();
  const usedPrev = new Set<number>();
  for (const { i, k } of pairs) {
    if (slotOf.has(i) || usedPrev.has(k)) continue;
    slotOf.set(i, previous[k]);
    usedPrev.add(k);
  }
  const homes: TopicHome[] = [];
  const home = (x: (typeof sized)[number], at: { x: number; y: number }, colorIndex: number): TopicHome => ({
    id: x.c.id,
    label: x.c.label,
    keywords: x.c.keywords ?? [],
    size: x.c.size,
    color: TOPIC_COLORS[colorIndex % TOPIC_COLORS.length],
    colorIndex,
    x: at.x,
    y: at.y,
    r: topicRadius(x.free),
    free: x.free,
    members: [...x.c.member_ids],
    exemplarId: x.c.exemplar_id ?? "",
    exemplarTitle: x.c.exemplar_title ?? "",
  });
  // Persisting topics first: they hold their place.
  const kept = new Map<number, TopicHome>();
  sized.forEach((x, i) => {
    const slot = slotOf.get(i);
    if (slot) kept.set(i, home(x, slot, slot.color));
  });
  const placed: TopicHome[] = [...kept.values()];
  const colorUse = new Array<number>(TOPIC_COLORS.length).fill(0);
  for (const h of placed) colorUse[h.colorIndex % TOPIC_COLORS.length] += 1;
  sized.forEach((x, i) => {
    const keptHome = kept.get(i);
    if (keptHome) {
      homes.push(keptHome);
      return;
    }
    const r = topicRadius(x.free);
    const n = placed.length;
    let at: { x: number; y: number } | null = null;
    for (let step = 0; step < 20000 && !at; step++) {
      const dist = IDENTITY_CLEAR + r + step * 3;
      const angle = n * GOLDEN_ANGLE + step * 0.21;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      if (placed.every((h) => Math.hypot(h.x - px, h.y - py) >= h.r + r + TOPIC_GAP)) at = { x: px, y: py };
    }
    let colorIndex = 0;
    for (let c = 1; c < colorUse.length; c++) if (colorUse[c] < colorUse[colorIndex]) colorIndex = c;
    colorUse[colorIndex] += 1;
    const h = home(x, at ?? { x: 0, y: IDENTITY_CLEAR + r + n * 2 * r }, colorIndex);
    placed.push(h);
    homes.push(h);
  });
  return homes;
}

/** What to remember of these homes for the next fetch / reload. */
export function topicSlotsOf(homes: TopicHome[]): TopicSlot[] {
  return homes.map((h) => ({ x: Math.round(h.x * 10) / 10, y: Math.round(h.y * 10) / 10, color: h.colorIndex, members: h.members }));
}

/** Read remembered slots back (storage is presentation: anything
 * malformed is dropped, never trusted). */
export function parseTopicSlots(raw: string | null): TopicSlot[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    const list = Array.isArray(v) ? v : [];
    return list.filter(
      (s): s is TopicSlot =>
        !!s &&
        typeof s === "object" &&
        Number.isFinite((s as TopicSlot).x) &&
        Number.isFinite((s as TopicSlot).y) &&
        Number.isInteger((s as TopicSlot).color) &&
        Array.isArray((s as TopicSlot).members),
    );
  } catch {
    return [];
  }
}

/** A diary ENTRY id as the runtime mints it (identity/diary.py:
 * "diary_" + 24 hex) — never a label a person should read. */
const ENTRY_ID = /^diary_[0-9a-f]{24}$/;

/** A topic keyword as a person reads it: a raw diary entry id becomes
 * that entry's title (its summary, when the fold carries one), else
 * "a diary entry"; every other keyword stays as the runtime wrote it. */
export function readableKeyword(keyword: string, entryTitle: (entryId: string) => string | null): string {
  const k = keyword.trim();
  if (!ENTRY_ID.test(k)) return k;
  return entryTitle(k) ?? "a diary entry";
}

/** Entry id -> the entry's readable title from the fold (its summary
 * when served; null for a redacted entry or one not in the fold). */
export function entryTitleOf(fold: FoldState): (entryId: string) => string | null {
  const byEntry = new Map<string, NodeState>();
  for (const n of fold.nodes.values()) if (n.entry_id) byEntry.set(n.entry_id, n);
  return (id) => {
    const n = byEntry.get(id);
    return n ? summaryLabel(n.title, n.redacted) : null;
  };
}

/** The label's words, readable (the label is the runtime's first three
 * keywords joined by ", "). */
export function readableTopicLabel(label: string, entryTitle: (entryId: string) => string | null): string {
  return label
    .split(", ")
    .map((k) => readableKeyword(k, entryTitle))
    .join(", ");
}

/** Wrap a label onto at most two lines of `maxW` (measured), breaking
 * after ", " first, then at spaces. `complete` = nothing was left out (the
 * canvas then needs no "…"; the hover card always shows everything). */
export function wrapTopicLabel(text: string, maxW: number, measure: (s: string) => number): { lines: string[]; complete: boolean } {
  if (measure(text) <= maxW) return { lines: [text], complete: true };
  const tokens = text.split(/(?<=, )|(?<= )/);
  let first = "";
  let i = 0;
  while (i < tokens.length && measure(first + tokens[i]) <= maxW) {
    first += tokens[i];
    i += 1;
  }
  if (!first) {
    // One word wider than a line: it is the first line as is.
    first = tokens[0];
    i = 1;
  }
  const rest = tokens.slice(i).join("").trim();
  if (!rest) return { lines: [first.trim()], complete: true };
  if (measure(rest) <= maxW) return { lines: [first.trim(), rest], complete: true };
  let second = "";
  for (const ch of rest) {
    if (measure(second + ch + "…") > maxW) break;
    second += ch;
  }
  return { lines: [first.trim(), `${second.trimEnd()}…`], complete: false };
}

/** Furthest world reach of the homes (lanes step outside it). */
export function homesExtent(homes: TopicHome[]): number {
  let max = 0;
  for (const h of homes) max = Math.max(max, Math.hypot(h.x, h.y) + h.r);
  return max;
}

export interface TopicPlan {
  homes: TopicHome[];
  /** Free node id -> its seat (world) — topic members AND unclustered
   * memories seated among their relations. */
  anchorOf: Map<string, { x: number; y: number }>;
  /** Free node id -> topic id (members only). */
  topicOf: Map<string, number>;
  /** topic id -> its free members present in the fold (halo input). */
  membersOf: Map<number, string[]>;
  /** topic id -> EVERY member present in the fold (diary and identity
   * included) — what a click on the topic label lights. */
  allRowsOf: Map<number, Set<string>>;
  /** Free nodes in no topic with no related topic member (no topic pull:
   * the canvas keeps them on its outer rim). */
  loose: Set<string>;
  extent: number;
}

function rowOf(fold: FoldState, graphId: string): string | null {
  const row = fold.graph_to_row.get(graphId);
  if (row !== undefined && fold.nodes.has(row)) return row;
  return fold.nodes.has(graphId) ? graphId : null;
}

/** The seats for the fold at the scrub position. `isFree` is the canvas's
 * own lane rule (identity ring / diary shelf stay out of the disc). */
export function planTopicSeats(
  fold: FoldState,
  communities: TopicCommunity[],
  homes: TopicHome[],
  isFree: (node: NodeState) => boolean,
): TopicPlan {
  const homeById = new Map(homes.map((h) => [h.id, h]));
  const anchorOf = new Map<string, { x: number; y: number }>();
  const topicOf = new Map<string, number>();
  const membersOf = new Map<number, string[]>();
  const allRowsOf = new Map<number, Set<string>>();
  for (const c of communities) {
    const all = new Set<string>();
    const free: NodeState[] = [];
    for (const gid of c.member_ids) {
      const row = rowOf(fold, gid);
      if (row === null) continue;
      all.add(row);
      const node = fold.nodes.get(row);
      if (node && isFree(node) && !topicOf.has(row)) free.push(node);
    }
    allRowsOf.set(c.id, all);
    const home = homeById.get(c.id);
    if (!home) continue;
    // Oldest at the centre: rank by first sight (ties by id) — a newer
    // memory only ever takes the next rim seat.
    free.sort((a, b) => a.first_seq - b.first_seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const ids: string[] = [];
    free.forEach((node, rank) => {
      const o = topicSeatOffset(rank);
      anchorOf.set(node.id, { x: home.x + o.dx, y: home.y + o.dy });
      topicOf.set(node.id, c.id);
      ids.push(node.id);
    });
    membersOf.set(c.id, ids);
  }

  // Unclustered free memories: where their relations are.
  const unclustered = new Set<string>();
  for (const node of fold.nodes.values()) {
    if (isFree(node) && !topicOf.has(node.id)) unclustered.add(node.id);
  }
  const sum = new Map<string, { x: number; y: number; n: number }>();
  const touch = (u: string, v: string) => {
    if (!unclustered.has(u)) return;
    const seat = topicOf.has(v) ? anchorOf.get(v) : undefined;
    if (!seat) return;
    const s = sum.get(u) ?? { x: 0, y: 0, n: 0 };
    s.x += seat.x;
    s.y += seat.y;
    s.n += 1;
    sum.set(u, s);
  };
  for (const e of fold.edges.values()) {
    touch(e.a, e.b);
    touch(e.b, e.a);
  }
  for (const se of fold.structural_edges.values()) {
    const a = rowOf(fold, se.source_graph_id);
    const b = rowOf(fold, se.target_graph_id);
    if (a === null || b === null || a === b) continue;
    touch(a, b);
    touch(b, a);
  }
  const loose = new Set<string>();
  for (const id of unclustered) {
    const s = sum.get(id);
    if (!s) {
      loose.add(id);
      continue;
    }
    // A stable nudge off the mean so two memories with the same relations
    // never share one point (repulsion would fight over it).
    const a = hash01(id, 17) * Math.PI * 2;
    anchorOf.set(id, { x: s.x / s.n + Math.cos(a) * TOPIC_SPACING, y: s.y / s.n + Math.sin(a) * TOPIC_SPACING });
  }
  return { homes, anchorOf, topicOf, membersOf, allRowsOf, loose, extent: homesExtent(homes) };
}

/** Does this usage trail pull its two ends together? Not across two
 * topics (see the module note); yes inside one topic, and yes whenever an
 * end is in no topic (an unclustered memory sits where its relations put
 * it). Without a plan every trail pulls (today's layout). */
export function trailPulls(plan: Pick<TopicPlan, "topicOf"> | null, a: string, b: string): boolean {
  if (!plan) return true;
  const ta = plan.topicOf.get(a);
  const tb = plan.topicOf.get(b);
  return ta === undefined || tb === undefined || ta === tb;
}

/** How far from its home a member still counts as SETTLED there (in
 * home radii). A member its relations drag further (a hub linked into
 * other topics, a memory bound to the diary shelf) stays visible where it
 * is, but outside its topic's halo — the halo marks where the topic
 * lives, never a circle swollen across the neighbours. */
export const HALO_HOME_REACH = 1.6;

/** A topic's halo: the members settled at its home (within
 * HALO_HOME_REACH home radii of the home centre), circled where they are
 * NOW — centred on them, reaching the furthest one's rim. null when fewer
 * than two are settled (a dispersed topic draws no halo). */
export function haloOf(
  home: { x: number; y: number; r: number },
  points: Array<{ x: number; y: number; r: number }>,
): { cx: number; cy: number; r: number; settled: number } | null {
  const reach = home.r * HALO_HOME_REACH;
  const kept = points.filter((p) => Math.hypot(p.x - home.x, p.y - home.y) <= reach);
  if (kept.length < 2) return null;
  let cx = 0;
  let cy = 0;
  for (const p of kept) {
    cx += p.x;
    cy += p.y;
  }
  cx /= kept.length;
  cy /= kept.length;
  let r = 0;
  for (const p of kept) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy) + p.r);
  return { cx, cy, r, settled: kept.length };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectHitsCircle(rc: Rect, c: { x: number; y: number; r: number }): boolean {
  const nx = Math.max(rc.x, Math.min(c.x, rc.x + rc.w));
  const ny = Math.max(rc.y, Math.min(c.y, rc.y + rc.h));
  return (nx - c.x) ** 2 + (ny - c.y) ** 2 < c.r * c.r;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Where a topic label may go (screen px): just above the halo, else
 * below, right, left — never over a node, another label, a blocked band,
 * or off the canvas. null = no free spot this frame (the label waits). */
export function placeTopicLabel(args: {
  halo: { cx: number; cy: number; r: number };
  w: number;
  h: number;
  nodes: Array<{ x: number; y: number; r: number }>;
  placed: Rect[];
  bounds: { w: number; h: number };
  blocked?: (rc: Rect) => boolean;
}): Rect | null {
  const { halo, w, h, nodes, placed, bounds, blocked } = args;
  const candidates: Rect[] = [
    { x: halo.cx - w / 2, y: halo.cy - halo.r - 4 - h, w, h },
    { x: halo.cx - w / 2, y: halo.cy + halo.r + 4, w, h },
    { x: halo.cx + halo.r + 6, y: halo.cy - h / 2, w, h },
    { x: halo.cx - halo.r - 6 - w, y: halo.cy - h / 2, w, h },
  ];
  for (const rc of candidates) {
    if (rc.x < 2 || rc.y < 2 || rc.x + rc.w > bounds.w - 2 || rc.y + rc.h > bounds.h - 2) continue;
    if (blocked?.(rc)) continue;
    if (placed.some((p) => rectsOverlap(p, rc))) continue;
    if (nodes.some((n) => rectHitsCircle(rc, n))) continue;
    return rc;
  }
  return null;
}

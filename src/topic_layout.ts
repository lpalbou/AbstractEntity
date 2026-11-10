/**
 * The graph's BASE placement from his served topics (memory-owned
 * communities, COMMUNITIES-DESIGN 2026-11-10 §4; the payload is read by
 * communities.ts): every circle at its served xy/radius, every member on its
 * served seat — diary entries and identity records included — and a member
 * with no served seat (vector-less, or provisional: placed since the
 * version) on a rim seat in join order (placeCommunities + seatFold). The
 * app never detects, labels or seats a topic itself: no keyword, no force
 * layout for the base. The only motion it adds is the viewer's: a dragged
 * circle REPELS the circles it meets (relaxCircles / dragCircle — never an
 * attraction). Memories the version does not list wait on a ring outside.
 * Pure functions (no DOM); graph_canvas draws.
 */

import type { FoldState, NodeState } from "./stream_fold";
import type { ServedCommunities } from "./communities";
import type { TailPlacement } from "./topic_map";
import { hash01 } from "./force_layout";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function readPair(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) ? [v[0], v[1]] : null;
}

/** World size of a community with `n` members (the same density the graph
 * had: a seat ≈ 55 px apart). The served units are scaled uniformly so the
 * MEDIAN circle meets it — a uniform scale keeps every served relation:
 * circles that do not overlap still do not, seats stay inside. */
export const TOPIC_SPACING = 31;
export const TOPIC_PAD = 20;
export function targetRadius(n: number): number {
  return TOPIC_SPACING * Math.sqrt(Math.max(1, n)) + TOPIC_PAD;
}
/** A member's seat stays this far inside its circle's rim (node + margin). */
export const SEAT_MARGIN = 14;
/** Rim seats (members with no served seat): spacing along a ring, and the
 * step inward to the next ring when one is full. */
export const RIM_SPACING = 30;
export const RIM_STEP = 28;
/** The gap a dragged circle keeps from the circles it pushes. */
export const CIRCLE_GAP = 24;
/** Memories the version does not list wait on a ring this far outside. */
export const WAITING_GAP = 90;
export const WAITING_SPACING = 36;

/** Topic palette, keyed by the community's stable id (a topic keeps its
 * colour across versions). Theme-adjacent mid-tones. */
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

export function topicColor(key: string): string {
  return TOPIC_COLORS[Math.floor(hash01(key, 29) * TOPIC_COLORS.length) % TOPIC_COLORS.length];
}

export interface PlacedCircle {
  /** The community key. */
  id: string;
  x: number;
  y: number;
  r: number;
}

/** The served scale (world px per served unit): the median of each
 * circle's density radius over its served radius, counted on the members
 * of the version (a provisional member placed since never moves the scale,
 * so it never moves anyone). */
export function servedScale(communities: ServedCommunities["communities"]): number {
  if (communities.length === 0) return 1;
  const ratios = communities.map((c) => targetRadius(c.members.filter((m) => !c.provisional.has(m.id)).length) / c.layout.radius).sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
}

/** Rim seat `j` (join order among the members with no served seat) inside
 * a circle of radius `r`, relative to its centre: rings from the rim
 * inward, evenly spaced from the top. A newcomer takes the next seat; no
 * earlier seat moves. */
export function rimSeat(j: number, r: number): { dx: number; dy: number } {
  let ring = 0;
  let k = j;
  for (;;) {
    const rr = r - SEAT_MARGIN - ring * RIM_STEP;
    if (rr <= RIM_STEP) {
      // The circle is full of rings: the rest share its centre region (a
      // small sunflower; never two on one point).
      const a = k * 2.399963229728653;
      const d = Math.min(RIM_STEP, Math.max(0, r - SEAT_MARGIN)) * Math.sqrt(((k % 13) + 0.5) / 13);
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d };
    }
    const cap = Math.max(1, Math.floor((2 * Math.PI * rr) / RIM_SPACING));
    if (k < cap) {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / cap + ring * 0.37;
      return { dx: Math.cos(a) * rr, dy: Math.sin(a) * rr };
    }
    k -= cap;
    ring += 1;
  }
}

/** Push overlapping circles apart until none overlaps (with CIRCLE_GAP):
 * repel ONLY — a pair that does not overlap never moves, nothing is ever
 * pulled toward anything. `pinned` (the circle the viewer drags) never
 * moves; the others take the push. Deterministic (fixed order, fixed
 * iterations). Returns new circles; the input is untouched. */
export function relaxCircles(
  circles: PlacedCircle[],
  pinned: string | null,
  gap: number | ((a: PlacedCircle, b: PlacedCircle) => number) = CIRCLE_GAP,
  iterations = 80,
): PlacedCircle[] {
  const out = circles.map((c) => ({ ...c }));
  const gapOf = typeof gap === "number" ? () => gap : gap;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let k = i + 1; k < out.length; k++) {
        const a = out[i];
        const b = out[k];
        const min = a.r + b.r + gapOf(a, b);
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= min - 1e-6) continue;
        if (d < 1e-6) {
          // Same centre: part along a direction fixed by the two ids.
          const ang = hash01(`${a.id}\u0000${b.id}`, 3) * Math.PI * 2;
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const push = min - Math.hypot(b.x - a.x, b.y - a.y);
        const ux = dx / d;
        const uy = dy / d;
        if (a.id === pinned) {
          b.x += ux * push;
          b.y += uy * push;
        } else if (b.id === pinned) {
          a.x -= ux * push;
          a.y -= uy * push;
        } else {
          a.x -= (ux * push) / 2;
          a.y -= (uy * push) / 2;
          b.x += (ux * push) / 2;
          b.y += (uy * push) / 2;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

export interface CommunityPlacement {
  scale: number;
  circles: PlacedCircle[];
  circleById: Map<string, PlacedCircle>;
  /** Member GRAPH id -> its world seat. */
  seatOf: Map<string, { x: number; y: number }>;
  /** Member graph id -> its ONE community key (a member listed twice —
   * memory's I1 breached — keeps its first listing). */
  circleOf: Map<string, string>;
  /** Furthest world reach of the circles from the origin. */
  extent: number;
}

/** The served placement in world px: circles at their served xy/radius
 * (uniform scale), moved by the viewer's offsets (world px, by community
 * key), any overlap resolved repel-only; members on their served seats
 * (kept inside the rim), members with no served seat (or provisional) on
 * rim seats in join order. */
export function placeCommunities(data: ServedCommunities, offsets: ReadonlyMap<string, { dx: number; dy: number }> = new Map()): CommunityPlacement {
  const scale = servedScale(data.communities);
  const base: PlacedCircle[] = data.communities.map((c) => {
    const off = offsets.get(c.key);
    return { id: c.key, x: c.layout.x * scale + (off?.dx ?? 0), y: c.layout.y * scale + (off?.dy ?? 0), r: c.layout.radius * scale };
  });
  // The served base is kept as served; only a true overlap (a drag's
  // offsets meeting a new version) is resolved, repel-only.
  const circles = relaxCircles(base, null, 0);
  const circleById = new Map(circles.map((c) => [c.id, c]));
  const seatOf = new Map<string, { x: number; y: number }>();
  const circleOf = new Map<string, string>();
  let extent = 0;
  data.communities.forEach((c, i) => {
    const circle = circles[i];
    extent = Math.max(extent, Math.hypot(circle.x, circle.y) + circle.r);
    const inner = Math.max(0, circle.r - SEAT_MARGIN);
    let rim = 0;
    for (const m of c.members) {
      if (circleOf.has(m.id)) continue;
      circleOf.set(m.id, c.key);
      const served = c.provisional.has(m.id) ? undefined : c.layout.seats.get(m.id);
      let dx: number;
      let dy: number;
      if (served) {
        dx = served.dx * scale;
        dy = served.dy * scale;
        const d = Math.hypot(dx, dy);
        if (d > inner && d > 0) {
          dx = (dx / d) * inner;
          dy = (dy / d) * inner;
        }
      } else {
        ({ dx, dy } = rimSeat(rim, circle.r));
        rim += 1;
      }
      seatOf.set(m.id, { x: circle.x + dx, y: circle.y + dy });
    }
  });
  return { scale, circles, circleById, seatOf, circleOf, extent };
}

/** The version as served, plus the memories memory placed since it (the
 * stream's `placed` events against THIS version, in the order placed): each
 * joins its community as a provisional member — at the rim, never moving
 * anyone (the scale counts the version's members only). A placement against
 * another version, into a community this version does not have, or of a
 * record already listed is ignored. The same object comes back when nothing
 * joins. */
export function withTailPlacements(data: ServedCommunities, placed: ReadonlyMap<string, TailPlacement>): ServedCommunities {
  if (placed.size === 0) return data;
  const listed = new Set<string>();
  for (const c of data.communities) for (const m of c.members) listed.add(m.id);
  const joins = new Map<string, string[]>();
  for (const [rid, at] of placed) {
    if (at.versionSeq !== data.versionSeq || listed.has(rid)) continue;
    const list = joins.get(at.key) ?? [];
    list.push(rid);
    joins.set(at.key, list);
  }
  if (joins.size === 0) return data;
  let added = false;
  const communities = data.communities.map((c) => {
    const ids = joins.get(c.key);
    if (!ids) return c;
    added = true;
    const provisional = new Set(c.provisional);
    for (const id of ids) provisional.add(id);
    return { ...c, members: [...c.members, ...ids.map((id) => ({ id, via: "provisional" }))], provisional };
  });
  return added ? { ...data, communities } : data;
}

/** Seat `i` of the memories the version does not list (closed records,
 * records formed since it with no placement yet): a ring outside every
 * circle, oldest first, no circle drawn round them. */
export function waitingSeat(i: number, extent: number): { x: number; y: number } {
  const r0 = extent + WAITING_GAP;
  let ring = 0;
  let k = i;
  for (;;) {
    const rr = r0 + ring * WAITING_SPACING;
    const cap = Math.max(1, Math.floor((2 * Math.PI * rr) / WAITING_SPACING));
    if (k < cap) {
      const a = Math.PI / 2 + (2 * Math.PI * k) / cap;
      return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
    }
    k -= cap;
    ring += 1;
  }
}

export interface SeatedFold {
  /** Fold row id -> its world target. Every node of the fold has one. */
  targetOf: Map<string, { x: number; y: number }>;
  /** Fold row id -> its one community key (absent: waiting outside). */
  circleOfRow: Map<string, string>;
  /** Community key -> its rows present in the fold, in served order. */
  rowsOf: Map<string, string[]>;
  /** Rows the version does not list, oldest first. */
  waiting: string[];
}

function graphIdOf(node: NodeState): string {
  return node.graph_id ?? node.id;
}

/** Every memory of the fold on its seat: each member in exactly one circle,
 * diary entries and identity records included; the rest on the waiting
 * ring. */
export function seatFold(fold: FoldState, placement: CommunityPlacement): SeatedFold {
  const targetOf = new Map<string, { x: number; y: number }>();
  const circleOfRow = new Map<string, string>();
  const rowsOf = new Map<string, string[]>();
  for (const c of placement.circles) rowsOf.set(c.id, []);
  const waitingNodes: NodeState[] = [];
  for (const node of fold.nodes.values()) {
    const gid = graphIdOf(node);
    const circle = placement.circleOf.get(gid) ?? placement.circleOf.get(node.id);
    const seat = placement.seatOf.get(gid) ?? placement.seatOf.get(node.id);
    if (circle !== undefined && seat) {
      targetOf.set(node.id, seat);
      circleOfRow.set(node.id, circle);
    } else {
      waitingNodes.push(node);
    }
  }
  // Served order within each community (the panel's and the halo's).
  for (const [gid, circle] of placement.circleOf) {
    const row = fold.graph_to_row.get(gid) ?? gid;
    if (circleOfRow.get(row) === circle) rowsOf.get(circle)?.push(row);
  }
  waitingNodes.sort((a, b) => a.first_seq - b.first_seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const waiting = waitingNodes.map((n) => n.id);
  waiting.forEach((id, i) => targetOf.set(id, waitingSeat(i, placement.extent)));
  return { targetOf, circleOfRow, rowsOf, waiting };
}

/** Membership only (no geometry): fold row -> community, community ->
 * rows. What the panel and the cards need; independent of the viewer's
 * drags. */
export function membershipOf(fold: FoldState, data: ServedCommunities): { circleOfRow: Map<string, string>; rowsOf: Map<string, string[]> } {
  const firstOf = new Map<string, string>();
  for (const c of data.communities) for (const m of c.members) if (!firstOf.has(m.id)) firstOf.set(m.id, c.key);
  const circleOfRow = new Map<string, string>();
  const rowsOf = new Map<string, string[]>(data.communities.map((c) => [c.key, []]));
  for (const c of data.communities) {
    for (const m of c.members) {
      if (firstOf.get(m.id) !== c.key) continue;
      const row = fold.graph_to_row.get(m.id) ?? m.id;
      if (!fold.nodes.has(row) || circleOfRow.has(row)) continue;
      circleOfRow.set(row, c.key);
      rowsOf.get(c.key)?.push(row);
    }
  }
  return { circleOfRow, rowsOf };
}

// ------------------------------------------------------------- the drag

/** The viewer moves circle `key` by (dx, dy) world px: it goes there, the
 * circles it meets are pushed away (repel only) and STAY where they were
 * pushed. Returns the new offsets (world px from each served position, by
 * community key). */
export function dragCircle(
  data: ServedCommunities,
  offsets: ReadonlyMap<string, { dx: number; dy: number }>,
  key: string,
  dx: number,
  dy: number,
): Map<string, { dx: number; dy: number }> {
  const scale = servedScale(data.communities);
  const current = placeCommunities(data, offsets).circles;
  const moved = current.map((c) => (c.id === key ? { ...c, x: c.x + dx, y: c.y + dy } : c));
  // The dragged circle keeps CIRCLE_GAP from what it meets; two circles
  // already closer than that keep the clearance they had (the drag never
  // makes the rest of the map breathe), but never overlap.
  const before = new Map(current.map((c) => [c.id, c]));
  const clearance = (a: PlacedCircle, b: PlacedCircle): number => {
    if (a.id === key || b.id === key) return CIRCLE_GAP;
    const pa = before.get(a.id)!;
    const pb = before.get(b.id)!;
    return Math.min(CIRCLE_GAP, Math.max(0, Math.hypot(pa.x - pb.x, pa.y - pb.y) - pa.r - pb.r));
  };
  const relaxed = relaxCircles(moved, key, clearance);
  const next = new Map<string, { dx: number; dy: number }>();
  data.communities.forEach((c, i) => {
    const ox = relaxed[i].x - c.layout.x * scale;
    const oy = relaxed[i].y - c.layout.y * scale;
    if (Math.abs(ox) > 1e-6 || Math.abs(oy) > 1e-6) next.set(c.key, { dx: ox, dy: oy });
  });
  return next;
}

/** Remembered offsets back from storage (presentation: anything malformed
 * is dropped). */
export function parseOffsets(raw: string | null): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>();
  if (!raw) return out;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!isObj(v)) return out;
    for (const [id, o] of Object.entries(v)) {
      const p = readPair(o);
      if (p) out.set(id, { dx: p[0], dy: p[1] });
    }
  } catch {
    return out;
  }
  return out;
}

export function serializeOffsets(offsets: ReadonlyMap<string, { dx: number; dy: number }>): string {
  const o: Record<string, [number, number]> = {};
  for (const [id, v] of offsets) o[id] = [Math.round(v.dx * 10) / 10, Math.round(v.dy * 10) / 10];
  return JSON.stringify(o);
}

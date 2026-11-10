/**
 * The graph's BASE placement from his served topics (DOM-free): served
 * layout -> world positions (one uniform scale), members on their served
 * seats, the ones with none (vector-less, provisional) on rim seats in join
 * order, every memory of the fold in exactly one circle — diary entries and
 * identity records included — or on the waiting ring; and the viewer's drag:
 * circles REPEL only, never attract. Seats are computed on the real fold
 * (stream envelopes in), never on hand-made fold objects.
 */
import { describe, expect, it } from "vitest";

import { readCommunities, type ServedCommunities } from "./communities";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import {
  CIRCLE_GAP,
  dragCircle,
  membershipOf,
  parseOffsets,
  placeCommunities,
  pruneOffsets,
  relaxCircles,
  rimSeat,
  SEAT_MARGIN,
  seatFold,
  serializeOffsets,
  servedScale,
  targetRadius,
  TOPIC_COLORS,
  topicColor,
  waitingSeat,
  withTailPlacements,
  type PlacedCircle,
} from "./topic_layout";

type Raw = Record<string, unknown>;

function comm(key: string, members: string[], xy: [number, number], radius: number, seats: Record<string, [number, number]> = {}, over: Raw = {}): Raw {
  return {
    id: `ex:community-${key}-r1`,
    key,
    title: `Topic ${key}`,
    summary: null,
    pending: [],
    verdict: null,
    size: members.length,
    kinds: { episode: members.length },
    members: members.map((id) => ({ id, via: "detected" })),
    provisional_ids: [],
    cohesion: 0.5,
    layout: { xy, radius, seats },
    centroid_stale: false,
    facts: {},
    ...over,
  };
}

function data(communities: Raw[]): ServedCommunities {
  const read = readCommunities({ version: 2, version_seq: 7, first_sleep_pending: false, algorithm: "louvain-warm-v1", communities, links: [] });
  if (read.kind !== "served") throw new Error(JSON.stringify(read));
  return read.data;
}

function binding(seq: number, id: string, kind: string, extra: Raw = {}): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "binding",
    observed_at: "2026-11-10T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { record_id: id, scope: "life", owner_id: "entity:test", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    display: { record_id: id, kind, title: `title ${id}`, graph_id: id, ...extra } as ReplayEnvelope["display"],
  } as ReplayEnvelope;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("served layout -> world positions", () => {
  // Two topics; served units: radius 2 for 4 members, 1 for 1 member.
  const d = data([
    comm("a", ["ex:a1", "ex:a2", "ex:a3", "ex:a4"], [0, 0], 2, { "ex:a1": [0, 0], "ex:a2": [1, 0], "ex:a3": [0, -1], "ex:a4": [5, 0] }),
    comm("b", ["ex:b1"], [10, 0], 1, { "ex:b1": [0, 0.5] }),
  ]);

  it("one uniform scale: the median circle meets the graph's density", () => {
    const k = servedScale(d.communities);
    // ratios: a = targetRadius(4)/2, b = targetRadius(1)/1 -> median of two.
    expect(k).toBeCloseTo((targetRadius(4) / 2 + targetRadius(1) / 1) / 2, 6);
  });

  it("each circle at its served xy and radius (scaled), each member on its served seat", () => {
    const p = placeCommunities(d);
    const k = p.scale;
    const a = p.circleById.get("a")!;
    const b = p.circleById.get("b")!;
    expect(a).toMatchObject({ x: 0, y: 0 });
    expect(a.r).toBeCloseTo(2 * k, 6);
    expect(b.x).toBeCloseTo(10 * k, 6);
    expect(b.r).toBeCloseTo(k, 6);
    expect(p.seatOf.get("ex:a2")!.x).toBeCloseTo(1 * k, 6);
    expect(p.seatOf.get("ex:a3")!.y).toBeCloseTo(-1 * k, 6);
    expect(p.seatOf.get("ex:b1")!.y).toBeCloseTo(0.5 * k, 6);
  });

  it("a seat served past the rim is kept inside its circle", () => {
    const p = placeCommunities(d);
    const a = p.circleById.get("a")!;
    expect(dist(p.seatOf.get("ex:a4")!, a)).toBeCloseTo(a.r - SEAT_MARGIN, 6);
  });

  it("two served circles closer than the drag gap (but not overlapping) stay exactly where served", () => {
    const k = servedScale(data([comm("x", ["ex:x1"], [0, 0], 1)]).communities);
    // 4 px apart in world units (CIRCLE_GAP is 24): memory's layout is kept as is.
    const tight = data([comm("x", ["ex:x1"], [0, 0], 1), comm("y", ["ex:y1"], [(2 * k + 4) / k, 0], 1)]);
    const p = placeCommunities(tight);
    expect(p.circleById.get("x")!.x).toBe(0);
    expect(p.circleById.get("y")!.x).toBeCloseTo(2 * k + 4, 6);
  });

  it("the served base is kept as served (non-overlapping circles never move)", () => {
    const p = placeCommunities(d);
    const k = p.scale;
    expect(p.circles.map((c) => [c.id, c.x, c.y])).toEqual([
      ["a", 0, 0],
      ["b", 10 * k, 0],
    ]);
  });
});

describe("members with no served seat: rim seats in join order", () => {
  it("vector-less and provisional members sit on rim seats, in join order; a newcomer moves nobody", () => {
    const base = comm("a", ["ex:a1", "ex:a2", "ex:v1"], [0, 0], 3, { "ex:a1": [0, 0], "ex:a2": [1, 1], "ex:p1": [0.2, 0.2] }, { provisional_ids: ["ex:p1"] });
    const p1 = placeCommunities(data([base]));
    const circle = p1.circleById.get("a")!;
    const rim = (j: number) => rimSeat(j, circle.r);
    // ex:v1 has no served seat (join index 0); ex:p1 is provisional (index 1) — its served seat is ignored.
    expect(p1.seatOf.get("ex:v1")).toEqual({ x: rim(0).dx, y: rim(0).dy });
    expect(p1.seatOf.get("ex:p1")).toEqual({ x: rim(1).dx, y: rim(1).dy });
    // One more provisional member: it takes the next rim seat; earlier seats stay.
    const grown = { ...base, provisional_ids: ["ex:p1", "ex:p2"] };
    const p2 = placeCommunities(data([grown]));
    expect(p2.circleById.get("a")!.r).toBeCloseTo(circle.r, 6);
    for (const id of ["ex:a1", "ex:a2", "ex:v1", "ex:p1"]) expect(p2.seatOf.get(id)).toEqual(p1.seatOf.get(id));
    expect(p2.seatOf.get("ex:p2")).toEqual({ x: rim(2).dx, y: rim(2).dy });
  });

  it("rim seats stay inside the circle and never share a point", () => {
    const r = 120;
    const seen = new Set<string>();
    for (let j = 0; j < 400; j++) {
      const s = rimSeat(j, r);
      expect(Math.hypot(s.dx, s.dy)).toBeLessThanOrEqual(r - SEAT_MARGIN + 1e-9);
      const key = `${s.dx.toFixed(3)},${s.dy.toFixed(3)}`;
      if (j < 60) expect(seen.has(key), `seat ${j}`).toBe(false);
      seen.add(key);
    }
    // The first seats are on the outer ring (the rim).
    expect(Math.hypot(rimSeat(0, r).dx, rimSeat(0, r).dy)).toBeCloseTo(r - SEAT_MARGIN, 6);
  });
});

describe("memories placed since the version (the stream's placed events)", () => {
  const d = data([comm("a", ["ex:a1"], [0, 0], 2, { "ex:a1": [0, 0] }, { provisional_ids: ["ex:p0"] }), comm("b", ["ex:b1"], [10, 0], 1, { "ex:b1": [0, 0] })]);
  const at = (key: string, versionSeq = 7) => ({ key, versionSeq });

  it("join their community as provisional members, after the served ones, in the order placed — nobody moves", () => {
    const placed = new Map([
      ["ex:n1", at("a")],
      ["ex:n2", at("b")],
      ["ex:n3", at("a")],
    ]);
    const live = withTailPlacements(d, placed);
    const a = live.communities[0];
    expect(a.members.map((m) => m.id)).toEqual(["ex:a1", "ex:p0", "ex:n1", "ex:n3"]);
    expect([...a.provisional]).toEqual(["ex:p0", "ex:n1", "ex:n3"]);
    expect(live.communities[1].members.map((m) => m.id)).toEqual(["ex:b1", "ex:n2"]);
    const before = placeCommunities(d);
    const after = placeCommunities(live);
    expect(after.scale).toBe(before.scale);
    for (const id of ["ex:a1", "ex:p0", "ex:b1"]) expect(after.seatOf.get(id)).toEqual(before.seatOf.get(id));
    const circle = after.circleById.get("a")!;
    expect(after.seatOf.get("ex:n1")).toEqual({ x: circle.x + rimSeat(1, circle.r).dx, y: circle.y + rimSeat(1, circle.r).dy });
    expect(after.circleOf.get("ex:n2")).toBe("b");
    // The served version is never mutated.
    expect(d.communities[0].members.map((m) => m.id)).toEqual(["ex:a1", "ex:p0"]);
  });

  it("ignores a placement against another version, into an unknown community, or of a listed record — same object back", () => {
    expect(withTailPlacements(d, new Map())).toBe(d);
    expect(withTailPlacements(d, new Map([["ex:n1", at("a", 6)]]))).toBe(d);
    expect(withTailPlacements(d, new Map([["ex:n1", at("zz")]]))).toBe(d);
    expect(withTailPlacements(d, new Map([["ex:b1", at("a")]]))).toBe(d);
  });
});

describe("every memory of the fold in exactly one circle", () => {
  const d = data([
    comm("a", ["ex:episode-1", "ex:diary-2", "ex:value-3"], [0, 0], 2, { "ex:episode-1": [0, 0], "ex:diary-2": [1, 0], "ex:value-3": [0, 1] }),
    comm("b", ["ex:dream-4", "ex:episode-1"], [10, 0], 1, { "ex:dream-4": [0, 0] }),
  ]);
  const fold = foldEnvelopes([
    binding(1, "ex:episode-1", "episode"),
    binding(2, "ex:diary-2", "diary", { diary: true }),
    binding(3, "ex:value-3", "value"),
    binding(4, "ex:dream-4", "dream"),
    binding(5, "ex:episode-new", "episode"),
  ]);

  it("diary entries, identity records and dreams sit on their seats inside their circle", () => {
    const p = placeCommunities(d);
    const s = seatFold(fold, p);
    for (const [id, key] of [
      ["ex:diary-2", "a"],
      ["ex:value-3", "a"],
      ["ex:dream-4", "b"],
    ] as const) {
      expect(s.circleOfRow.get(id)).toBe(key);
      const c = p.circleById.get(key)!;
      expect(dist(s.targetOf.get(id)!, c)).toBeLessThanOrEqual(c.r);
    }
  });

  it("a member listed twice (memory's I1 breached) keeps its first listing — one circle, never two", () => {
    const s = seatFold(fold, placeCommunities(d));
    expect(s.circleOfRow.get("ex:episode-1")).toBe("a");
    expect(s.rowsOf.get("a")).toEqual(["ex:episode-1", "ex:diary-2", "ex:value-3"]);
    expect(s.rowsOf.get("b")).toEqual(["ex:dream-4"]);
  });

  it("a memory the version does not list waits on a ring outside every circle; every node has a seat", () => {
    const p = placeCommunities(d);
    const s = seatFold(fold, p);
    expect(s.waiting).toEqual(["ex:episode-new"]);
    expect(s.circleOfRow.has("ex:episode-new")).toBe(false);
    const w = s.targetOf.get("ex:episode-new")!;
    expect(w).toEqual(waitingSeat(0, p.extent));
    expect(Math.hypot(w.x, w.y)).toBeGreaterThan(p.extent);
    for (const id of fold.nodes.keys()) expect(s.targetOf.has(id), id).toBe(true);
  });

  it("members resolve through graph_to_row (a node re-keyed by its usage row keeps its seat)", () => {
    const usage = {
      ...binding(6, "row-77", "episode"),
      family: "event",
      payload: { kind: "selected", scope: "life", owner_id: "entity:test", record_id: "row-77", pair_ids: null, weight: 1, matched: true, event_id: "e6", seq: 6 },
      display: { record_id: "row-77", graph_id: "ex:episode-1", kind: "episode", title: "title ex:episode-1" },
    } as unknown as ReplayEnvelope;
    const rekeyed = foldEnvelopes([binding(1, "ex:episode-1", "episode"), binding(2, "ex:diary-2", "diary", { diary: true }), binding(3, "ex:value-3", "value"), binding(4, "ex:dream-4", "dream"), usage]);
    expect(rekeyed.nodes.has("row-77")).toBe(true);
    const p = placeCommunities(d);
    const s = seatFold(rekeyed, p);
    expect(s.circleOfRow.get("row-77")).toBe("a");
    expect(s.targetOf.get("row-77")).toEqual(p.seatOf.get("ex:episode-1"));
    expect(membershipOf(rekeyed, d).rowsOf.get("a")).toEqual(["row-77", "ex:diary-2", "ex:value-3"]);
  });

  it("membership (no geometry) agrees with the seating", () => {
    const m = membershipOf(fold, d);
    const s = seatFold(fold, placeCommunities(d));
    expect(m.circleOfRow).toEqual(s.circleOfRow);
    expect(m.rowsOf).toEqual(s.rowsOf);
  });
});

describe("the viewer's drag: circles repel only, never attract", () => {
  const c = (id: string, x: number, y: number, r: number): PlacedCircle => ({ id, x, y, r });

  it("circles that do not overlap never move — nothing pulls them together", () => {
    const far = [c("a", 0, 0, 50), c("b", 500, 0, 50), c("c", 0, 900, 80)];
    expect(relaxCircles(far, null)).toEqual(far);
    expect(relaxCircles(far, "a")).toEqual(far);
  });

  it("an overlap is pushed apart to the gap; the pinned (dragged) circle never moves", () => {
    const out = relaxCircles([c("a", 0, 0, 50), c("b", 60, 0, 50)], "a");
    expect(out[0]).toEqual(c("a", 0, 0, 50));
    expect(out[1].x).toBeCloseTo(100 + CIRCLE_GAP, 6);
    expect(out[1].y).toBeCloseTo(0, 6);
  });

  it("a push travels on (a pushed circle pushes the next) and every pair ends apart", () => {
    const out = relaxCircles([c("a", 0, 0, 50), c("b", 90, 0, 50), c("c", 190, 0, 50)], "a");
    for (let i = 0; i < out.length; i++)
      for (let k = i + 1; k < out.length; k++) expect(dist(out[i], out[k]) + 1e-6).toBeGreaterThanOrEqual(out[i].r + out[k].r + CIRCLE_GAP);
    expect(out[0]).toEqual(c("a", 0, 0, 50));
  });

  it("same centre: parted along a direction fixed by the ids (deterministic)", () => {
    const a = relaxCircles([c("a", 0, 0, 10), c("b", 0, 0, 10)], null);
    const b = relaxCircles([c("a", 0, 0, 10), c("b", 0, 0, 10)], null);
    expect(a).toEqual(b);
    expect(dist(a[0], a[1])).toBeCloseTo(20 + CIRCLE_GAP, 6);
  });

  it("dragCircle: the circle goes where it is dragged; one it meets is pushed and STAYS pushed; one far away never moves", () => {
    const d = data([comm("a", ["ex:a1"], [0, 0], 1), comm("b", ["ex:b1"], [3, 0], 1), comm("far", ["ex:f1"], [0, 40], 1)]);
    const base = placeCommunities(d);
    const k = base.scale;
    const offsets = dragCircle(d, new Map(), "a", 2 * k, 0);
    const after = placeCommunities(d, offsets);
    const a = after.circleById.get("a")!;
    const b = after.circleById.get("b")!;
    expect(a.x).toBeCloseTo(2 * k, 6);
    expect(b.x).toBeGreaterThan(base.circleById.get("b")!.x); // pushed away, never toward
    expect(dist(a, b) + 1e-6).toBeGreaterThanOrEqual(a.r + b.r + CIRCLE_GAP);
    expect(after.circleById.get("far")).toEqual(base.circleById.get("far"));
    expect(offsets.has("far")).toBe(false);
    // Dragging "a" back: "b" does not follow (never attracted).
    const back = placeCommunities(d, dragCircle(d, offsets, "a", -2 * k, 0));
    expect(back.circleById.get("a")!.x).toBeCloseTo(0, 6);
    expect(back.circleById.get("b")!.x).toBeCloseTo(b.x, 6);
    // Members ride their circle.
    expect(after.seatOf.get("ex:a1")!.x - a.x).toBeCloseTo(base.seatOf.get("ex:a1")!.x - base.circleById.get("a")!.x, 6);
  });

  it("a drag never makes the rest of the map breathe: two circles closer than the gap keep their clearance", () => {
    // b and c sit 4 px apart (closer than CIRCLE_GAP); a drag far from them moves neither.
    const k = servedScale(data([comm("a", ["ex:a1"], [0, 0], 1)]).communities);
    const near = data([comm("a", ["ex:a1"], [0, 0], 1), comm("b", ["ex:b1"], [0, 30], 1), comm("c", ["ex:c1"], [(2 * k + 4) / k, 30], 1)]);
    const base = placeCommunities(near);
    const after = placeCommunities(near, dragCircle(near, new Map(), "a", -40, 0));
    expect(after.circleById.get("b")).toEqual(base.circleById.get("b"));
    expect(after.circleById.get("c")).toEqual(base.circleById.get("c"));
    const gapBC = Math.hypot(base.circleById.get("b")!.x - base.circleById.get("c")!.x, 0) - 2 * k;
    expect(gapBC).toBeCloseTo(4, 6);
  });

  it("the drag offsets are remembered by community key (malformed storage dropped)", () => {
    const offsets = new Map([["k1", { dx: 12.34, dy: -5 }]]);
    expect(parseOffsets(serializeOffsets(offsets))).toEqual(new Map([["k1", { dx: 12.3, dy: -5 }]]));
    expect(parseOffsets(null).size).toBe(0);
    expect(parseOffsets("{not json").size).toBe(0);
    expect(parseOffsets(JSON.stringify({ a: [1, "2"], b: [1] })).size).toBe(0);
  });

  it("a key the version no longer serves (renamed, dissolved) leaves no offset behind (review N2)", () => {
    const offsets = new Map([
      ["k1", { dx: 12, dy: -5 }],
      ["community-key-03", { dx: 40, dy: 8 }],
    ]);
    const pruned = pruneOffsets(offsets, new Set(["k1", "k2"]));
    expect(pruned).toEqual(new Map([["k1", { dx: 12, dy: -5 }]]));
    expect(serializeOffsets(pruned)).toBe('{"k1":[12,-5]}');
    // Every key still served: the same map (nothing written back).
    expect(pruneOffsets(pruned, new Set(["k1", "k2"]))).toBe(pruned);
  });
});

describe("a topic keeps its colour by its stable key", () => {
  it("same key, same colour (a nightly revision changes the record id, never the key)", () => {
    expect(topicColor("community-k1")).toBe(topicColor("community-k1"));
    expect(TOPIC_COLORS).toContain(topicColor("anything"));
  });
});

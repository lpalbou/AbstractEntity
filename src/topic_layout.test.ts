/**
 * Topics as the natural layout — the geometry the canvas's force sim pulls
 * toward: homes, seats, the unclustered rule, which usage trails pull,
 * halos and label placement; plus when the communities are asked again.
 * Seats are computed on the real fold (stream envelopes in), never on
 * hand-made fold objects.
 */
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import type { NodeState } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import type { TopicCommunity } from "./topic_map";
import {
  entryTitleOf,
  freeCountOf,
  HALO_HOME_REACH,
  haloOf,
  homesExtent,
  IDENTITY_CLEAR,
  contained,
  KEEP_CONTAINED,
  parseTopicSlots,
  placeTopicLabel,
  planTopicHomes,
  planTopicSeats,
  TOPIC_GAP,
  TOPIC_SPACING,
  topicRadius,
  topicSeatOffset,
  topicSlotsOf,
  trailPulls,
  wrapTopicLabel,
  readableKeyword,
  readableTopicLabel,
  type TopicHome,
} from "./topic_layout";

function comm(id: number, size: number, kinds: Record<string, number> = { episode: size }, members?: string[]): TopicCommunity {
  return {
    id,
    label: `topic ${id}`,
    keywords: ["k"],
    exemplar_id: `ex:e${id}`,
    exemplar_title: `exemplar ${id}`,
    size,
    kinds,
    member_ids: members ?? Array.from({ length: size }, (_, i) => `ex:m${id}-${i}`),
  };
}

function binding(seq: number, id: string, kind: string, edges: Array<{ target_graph_id: string; relation: string }> = []): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "binding",
    observed_at: "2026-11-07T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { record_id: id, scope: "life", owner_id: "entity:test", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    display: { record_id: id, kind, title: id, edges } as ReplayEnvelope["display"],
  } as ReplayEnvelope;
}

/** The canvas's lane rule, restated for the tests (identity kinds and
 * diary entries keep their lanes). */
const isFree = (n: NodeState) => !n.diary && !["value", "purpose", "trait", "claim"].includes(n.kind);

describe("freeCountOf / topicRadius / topicSeatOffset", () => {
  it("counts only the disc's memories (diary and identity keep their lanes)", () => {
    expect(freeCountOf(comm(1, 20, { episode: 10, diary: 6, value: 2, claim: 1, summary: 1 }))).toBe(11);
    expect(freeCountOf(comm(1, 4, { diary: 4 }))).toBe(0);
  });

  it("homes grow with their memories; seats spiral out from the centre", () => {
    expect(topicRadius(40)).toBeGreaterThan(topicRadius(10));
    const r = (k: number) => Math.hypot(topicSeatOffset(k).dx, topicSeatOffset(k).dy);
    expect(r(0)).toBeLessThan(TOPIC_SPACING);
    for (let k = 1; k < 50; k++) expect(r(k)).toBeGreaterThan(r(k - 1));
    // The last seat of n members sits inside the home radius.
    expect(r(39)).toBeLessThan(topicRadius(40));
  });
});

describe("planTopicHomes", () => {
  const cs = [comm(3, 12), comm(1, 40), comm(2, 7), comm(9, 3, { diary: 3 }), comm(4, 40)];

  it("is deterministic and orders by free size, then id", () => {
    const a = planTopicHomes(cs);
    expect(a).toEqual(planTopicHomes(cs));
    expect(a.map((h) => h.id)).toEqual([1, 4, 3, 2]); // the diary-only topic has no home
  });

  it("never overlaps two homes (a label-sized gap between) and keeps clear of the identity ring", () => {
    const many = Array.from({ length: 24 }, (_, i) => comm(i, 2 + ((i * 11) % 60)));
    const homes = planTopicHomes(many);
    for (let i = 0; i < homes.length; i++) {
      expect(Math.hypot(homes[i].x, homes[i].y)).toBeGreaterThanOrEqual(IDENTITY_CLEAR + homes[i].r - 1e-6);
      for (let j = i + 1; j < homes.length; j++) {
        const d = Math.hypot(homes[i].x - homes[j].x, homes[i].y - homes[j].y);
        expect(d).toBeGreaterThanOrEqual(homes[i].r + homes[j].r + TOPIC_GAP - 1e-6);
      }
    }
    expect(homesExtent(homes)).toBeGreaterThan(0);
  });
});

describe("planTopicSeats", () => {
  // Topic 1: three episodes + a diary entry + a value; topic 2: one memory.
  // ex:memory-u is in no topic but related to topic 1; ex:memory-z is in no
  // topic and related to nothing.
  const envs = [
    binding(1, "ex:episode-a", "episode"),
    binding(2, "ex:episode-b", "episode"),
    binding(3, "ex:episode-c", "episode"),
    binding(4, "ex:diary-d", "diary"),
    binding(5, "ex:value-v", "value"),
    binding(6, "ex:memory-x", "memory"),
    binding(7, "ex:memory-u", "memory", [
      { target_graph_id: "ex:episode-a", relation: "mentions" },
      { target_graph_id: "ex:episode-b", relation: "mentions" },
    ]),
    binding(8, "ex:memory-z", "memory"),
  ];
  const cs = [
    comm(1, 5, { episode: 3, diary: 1, value: 1 }, ["ex:episode-c", "ex:episode-a", "ex:diary-d", "ex:value-v", "ex:episode-b"]),
    comm(2, 1, { memory: 1 }, ["ex:memory-x"]),
  ];
  const fold = foldEnvelopes(envs);
  const homes = planTopicHomes(cs);
  const plan = planTopicSeats(fold, cs, homes, isFree);
  const home1 = homes.find((h) => h.id === 1)!;

  it("seats a topic's disc memories in its home, oldest at the centre", () => {
    const d = (id: string) => Math.hypot(plan.anchorOf.get(id)!.x - home1.x, plan.anchorOf.get(id)!.y - home1.y);
    expect(plan.membersOf.get(1)).toEqual(["ex:episode-a", "ex:episode-b", "ex:episode-c"]);
    expect(d("ex:episode-a")).toBeLessThan(d("ex:episode-b"));
    expect(d("ex:episode-b")).toBeLessThan(d("ex:episode-c"));
    for (const id of ["ex:episode-a", "ex:episode-b", "ex:episode-c"]) expect(d(id)).toBeLessThan(home1.r);
    expect(plan.topicOf.get("ex:episode-a")).toBe(1);
  });

  it("a newer memory never moves an older one's seat", () => {
    const older = planTopicSeats(foldEnvelopes(envs, 2), cs, homes, isFree);
    expect(older.anchorOf.get("ex:episode-a")).toEqual(plan.anchorOf.get("ex:episode-a"));
    expect(older.anchorOf.get("ex:episode-b")).toEqual(plan.anchorOf.get("ex:episode-b"));
    expect(older.anchorOf.has("ex:episode-c")).toBe(false);
  });

  it("lanes keep their places, but a topic click lights every member", () => {
    expect(plan.anchorOf.has("ex:diary-d")).toBe(false);
    expect(plan.anchorOf.has("ex:value-v")).toBe(false);
    expect([...plan.allRowsOf.get(1)!].sort()).toEqual(["ex:diary-d", "ex:episode-a", "ex:episode-b", "ex:episode-c", "ex:value-v"]);
  });

  it("an unclustered memory sits among its relations; with none it gets no topic pull", () => {
    const a = plan.anchorOf.get("ex:episode-a")!;
    const b = plan.anchorOf.get("ex:episode-b")!;
    const u = plan.anchorOf.get("ex:memory-u")!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    expect(Math.hypot(u.x - mid.x, u.y - mid.y)).toBeCloseTo(TOPIC_SPACING, 6);
    expect(plan.topicOf.has("ex:memory-u")).toBe(false);
    expect(plan.anchorOf.has("ex:memory-z")).toBe(false);
    expect(plan.loose.has("ex:memory-z")).toBe(true);
  });

  it("resolves members through graph_to_row (re-keyed nodes keep their seat)", () => {
    const rekeyed = foldEnvelopes([
      ...envs,
      {
        ...binding(9, "x", "memory"),
        family: "event",
        payload: { kind: "listed", scope: "life", owner_id: "entity:test", record_id: "row-a", pair_ids: null, weight: 0, matched: false, event_id: "e9", seq: 9 },
        display: { record_id: "row-a", graph_id: "ex:episode-a", title: "ex:episode-a" } as ReplayEnvelope["display"],
      } as ReplayEnvelope,
    ]);
    expect(rekeyed.nodes.has("row-a")).toBe(true);
    const p = planTopicSeats(rekeyed, cs, homes, isFree);
    expect(p.anchorOf.get("row-a")).toEqual(plan.anchorOf.get("ex:episode-a"));
  });
});

describe("trailPulls", () => {
  const plan = { topicOf: new Map([["a", 1], ["b", 1], ["c", 2]]) };
  it("pulls inside a topic and to unclustered memories, never across two topics", () => {
    expect(trailPulls(plan, "a", "b")).toBe(true);
    expect(trailPulls(plan, "a", "c")).toBe(false);
    expect(trailPulls(plan, "a", "loose")).toBe(true);
    expect(trailPulls(null, "a", "c")).toBe(true); // no topics: today's layout
  });
});

describe("haloOf", () => {
  const home = { x: 0, y: 0, r: 100 };
  it("circles the members settled at home, where they are now", () => {
    const h = haloOf(home, [
      { x: -20, y: 0, r: 4 },
      { x: 20, y: 0, r: 6 },
    ])!;
    expect(h.cx).toBe(0);
    expect(h.cy).toBe(0);
    expect(h.r).toBe(26); // furthest centre + its own radius
    expect(h.settled).toBe(2);
  });

  it("a member dragged off by its relations stays outside the halo", () => {
    const far = { x: home.r * HALO_HOME_REACH + 1, y: 0, r: 4 };
    const h = haloOf(home, [{ x: -20, y: 0, r: 4 }, { x: 20, y: 0, r: 4 }, far])!;
    expect(h.settled).toBe(2);
    expect(h.r).toBe(24);
  });

  it("a dispersed topic draws no halo", () => {
    expect(haloOf(home, [{ x: 10, y: 0, r: 4 }, { x: 500, y: 0, r: 4 }])).toBeNull();
    expect(haloOf(home, [])).toBeNull();
  });
});

describe("placeTopicLabel", () => {
  const base = { halo: { cx: 300, cy: 300, r: 50 }, w: 80, h: 18, placed: [], bounds: { w: 800, h: 800 } };
  it("prefers just above the halo", () => {
    expect(placeTopicLabel({ ...base, nodes: [] })).toEqual({ x: 260, y: 228, w: 80, h: 18 });
  });

  it("moves below, then beside, when a node sits there — never over a node", () => {
    const below = placeTopicLabel({ ...base, nodes: [{ x: 300, y: 236, r: 5 }] })!;
    expect(below.y).toBe(354);
    const right = placeTopicLabel({ ...base, nodes: [{ x: 300, y: 236, r: 5 }, { x: 300, y: 362, r: 5 }] })!;
    expect(right.x).toBe(356);
    const left = placeTopicLabel({ ...base, nodes: [{ x: 300, y: 236, r: 5 }, { x: 300, y: 362, r: 5 }, { x: 390, y: 300, r: 5 }] })!;
    expect(left.x).toBe(164);
  });

  it("never over another label, a blocked band or off the canvas; null when nowhere is free", () => {
    const taken = placeTopicLabel({ ...base, nodes: [], placed: [{ x: 250, y: 220, w: 100, h: 30 }] })!;
    expect(taken.y).toBe(354);
    expect(placeTopicLabel({ ...base, nodes: [], blocked: (rc) => rc.y < 300 })!.y).toBe(354);
    expect(placeTopicLabel({ ...base, halo: { cx: 30, cy: 30, r: 20 }, nodes: [] })!.x).toBeGreaterThanOrEqual(2);
    expect(placeTopicLabel({ ...base, nodes: [], blocked: () => true })).toBeNull();
  });
});

describe("stable homes across refetches", () => {
  /** A life of 12 topics, sizes 20..31. */
  const fetch1 = Array.from({ length: 12 }, (_, i) => comm(i, 20 + i));
  /** The same life 18 memories later: the runtime renumbered every
   * community (Louvain labels are not identities), the six smallest
   * topics grew (+3 each: 18 new memories) and overtook others in rank. */
  const fetch2 = fetch1.map((c, i) => {
    const grow = i < 6 ? 3 : 0;
    const extra = Array.from({ length: grow }, (_, k) => `ex:new${i}-${k}`);
    return comm(100 + ((i * 7) % 12), c.size + grow, { episode: c.size + grow }, [...c.member_ids, ...extra]);
  });
  const byMembers = (homes: TopicHome[], c: TopicCommunity) => homes.find((h) => contained(new Set(h.members), new Set(c.member_ids)) >= KEEP_CONTAINED)!;

  it("two fetches 18 new memories apart give the same home and colour to every persisting topic", () => {
    const h1 = planTopicHomes(fetch1);
    const h2 = planTopicHomes(fetch2, topicSlotsOf(h1));
    for (let i = 0; i < fetch1.length; i++) {
      const a = byMembers(h1, fetch1[i]);
      const b = byMembers(h2, fetch2[i]);
      expect(Math.abs(a.x - b.x)).toBeLessThan(0.06);
      expect(Math.abs(a.y - b.y)).toBeLessThan(0.06);
      expect(b.colorIndex).toBe(a.colorIndex);
      expect(b.color).toBe(a.color);
    }
  });

  it("without the remembered slots the same refetch moves topics (what the slots prevent)", () => {
    const h1 = planTopicHomes(fetch1);
    const h2 = planTopicHomes(fetch2);
    const moved = fetch1.filter((c, i) => {
      const a = byMembers(h1, c);
      const b = byMembers(h2, fetch2[i]);
      return Math.hypot(a.x - b.x, a.y - b.y) > 1 || a.colorIndex !== b.colorIndex;
    });
    expect(moved.length).toBeGreaterThan(0);
  });

  it("a regrouped topic (holding < 0.6 of every old one) is new: free room, a colour no kept topic wears", () => {
    const h1 = planTopicHomes([comm(1, 30), comm(2, 20)]);
    // Half of topic 1 split off on its own: it holds only half of topic 1.
    const regrouped = comm(9, 15, { episode: 15 }, comm(1, 30).member_ids.slice(0, 15));
    expect(contained(new Set(regrouped.member_ids), new Set(comm(1, 30).member_ids))).toBe(0.5);
    const h2 = planTopicHomes([regrouped, comm(2, 20)], topicSlotsOf(h1));
    const kept = h2.find((h) => h.id === 2)!;
    const fresh = h2.find((h) => h.id === 9)!;
    expect(kept.x).toBeCloseTo(h1.find((h) => h.id === 2)!.x, 1);
    expect(fresh.colorIndex).not.toBe(kept.colorIndex);
    expect(Math.hypot(fresh.x - kept.x, fresh.y - kept.y)).toBeGreaterThanOrEqual(fresh.r + kept.r + TOPIC_GAP - 1e-6);
    // It did not inherit topic 1's home: a regrouping is a new topic.
    const old1 = h1.find((h) => h.id === 1)!;
    expect(Math.hypot(fresh.x - old1.x, fresh.y - old1.y)).toBeGreaterThan(1);
  });

  it("a new topic bigger than every kept one never lands on a kept home nor wears its colour", () => {
    const h1 = planTopicHomes([comm(1, 30)]);
    const big = comm(7, 60, { episode: 60 }, Array.from({ length: 60 }, (_, k) => `ex:big${k}`));
    const h2 = planTopicHomes([big, comm(1, 30)], topicSlotsOf(h1));
    const kept = h2.find((h) => h.id === 1)!;
    const fresh = h2.find((h) => h.id === 7)!;
    expect(kept.x).toBeCloseTo(h1[0].x, 1);
    expect(kept.colorIndex).toBe(h1[0].colorIndex);
    expect(fresh.colorIndex).not.toBe(kept.colorIndex);
    expect(Math.hypot(fresh.x - kept.x, fresh.y - kept.y)).toBeGreaterThanOrEqual(fresh.r + kept.r + TOPIC_GAP - 1e-6);
  });

  it("contained is the share of the OLD topic's members", () => {
    expect(contained(new Set(["a", "b", "x", "y", "z"]), new Set(["a", "b", "c"]))).toBeCloseTo(2 / 3, 10);
    expect(contained(new Set(["a"]), new Set())).toBe(0);
  });

  it("a merge (two old topics folded into one) inherits the bigger contributor's home and colour", () => {
    const a = comm(1, 20);
    const b = comm(2, 18);
    const other = comm(3, 12);
    const h1 = planTopicHomes([a, b, other]);
    const merged = comm(9, 40, { episode: 40 }, [...a.member_ids, ...b.member_ids, "ex:n1", "ex:n2"]);
    // Each old topic is wholly inside the new one (by Jaccard neither
    // would be the same group: 20/40, 18/40).
    expect(contained(new Set(merged.member_ids), new Set(a.member_ids))).toBe(1);
    const h2 = planTopicHomes([merged, comm(3, 12)], topicSlotsOf(h1));
    const m = h2.find((h) => h.id === 9)!;
    const oldA = h1.find((h) => h.id === 1)!;
    expect(m.x).toBeCloseTo(oldA.x, 1);
    expect(m.y).toBeCloseTo(oldA.y, 1);
    expect(m.colorIndex).toBe(oldA.colorIndex);
    expect(h2.find((h) => h.id === 3)!.colorIndex).toBe(h1.find((h) => h.id === 3)!.colorIndex);
  });

  it("a topic holding less than KEEP_CONTAINED of an old one inherits nothing", () => {
    const a = comm(1, 20);
    const h1 = planTopicHomes([a]);
    // Half of a, plus 25 new: neither the same group nor a merge.
    const half = comm(9, 35, { episode: 35 }, [...a.member_ids.slice(0, 10), ...Array.from({ length: 25 }, (_, k) => `ex:h${k}`)]);
    expect(contained(new Set(half.member_ids), new Set(a.member_ids))).toBe(0.5);
    expect(KEEP_CONTAINED).toBe(0.6);
    const h2 = planTopicHomes([half], topicSlotsOf(h1));
    expect(Math.hypot(h2[0].x - h1[0].x, h2[0].y - h1[0].y)).toBeGreaterThan(1);
  });

  it("a topic that grew by a small old one keeps the big one's home", () => {
    const a = comm(1, 20);
    const b = comm(2, 6);
    const h1 = planTopicHomes([a, b]);
    // a grew by b's six: Jaccard with a = 20/26 ≈ 0.77 — the same group.
    const grown = comm(9, 26, { episode: 26 }, [...a.member_ids, ...b.member_ids]);
    const h2 = planTopicHomes([grown], topicSlotsOf(h1));
    expect(h2[0].x).toBeCloseTo(h1.find((h) => h.id === 1)!.x, 1);
  });

  it("the topic that brought the most members continues it, each old topic once", () => {
    const base = comm(1, 20);
    const h1 = planTopicHomes([base]);
    // Two new topics both hold most of the old one (not a real partition —
    // the guard for it): the one holding more continues it.
    const near = comm(5, 20, { episode: 20 }, [...base.member_ids.slice(0, 19), "ex:z1"]);
    const far = comm(6, 22, { episode: 22 }, [...base.member_ids.slice(0, 16), ...Array.from({ length: 6 }, (_, k) => `ex:y${k}`)]);
    expect(contained(new Set(far.member_ids), new Set(base.member_ids))).toBeGreaterThanOrEqual(KEEP_CONTAINED);
    const h2 = planTopicHomes([far, near], topicSlotsOf(h1));
    expect(h2.find((h) => h.id === 5)!.x).toBeCloseTo(h1[0].x, 1);
    expect(Math.hypot(h2.find((h) => h.id === 6)!.x - h1[0].x, h2.find((h) => h.id === 6)!.y - h1[0].y)).toBeGreaterThan(1);
  });

  it("remembered slots read back safely (malformed storage is dropped)", () => {
    const slots = topicSlotsOf(planTopicHomes([comm(1, 12)]));
    expect(parseTopicSlots(JSON.stringify(slots))).toEqual(slots);
    expect(parseTopicSlots(null)).toEqual([]);
    expect(parseTopicSlots("{not json")).toEqual([]);
    expect(parseTopicSlots(JSON.stringify([{ x: 1, y: "2", color: 0, members: [] }, { x: 1, y: 2, color: 1.5, members: [] }]))).toEqual([]);
  });
});

describe("readable topic words", () => {
  const titles = (id: string) => (id === "diary_3e3341cea4d59b5427e106f4" ? "the night I mapped the bridges" : null);
  it("a raw diary entry id becomes the entry's title, else 'a diary entry'", () => {
    expect(readableKeyword("diary_3e3341cea4d59b5427e106f4", titles)).toBe("the night I mapped the bridges");
    expect(readableKeyword("diary_aaaaaaaaaaaaaaaaaaaaaaaa", titles)).toBe("a diary entry");
    expect(readableTopicLabel("diary_3e3341cea4d59b5427e106f4, syntax, wake", () => null)).toBe("a diary entry, syntax, wake");
  });

  it("every other keyword stays as the runtime wrote it", () => {
    expect(readableKeyword("diary_list", titles)).toBe("diary_list");
    expect(readableKeyword("web_search", titles)).toBe("web_search");
    expect(readableTopicLabel("climate, task, bridge", titles)).toBe("climate, task, bridge");
  });

  it("reads entry titles from the fold: the summary when served, never a redacted entry's", () => {
    const diary = (seq: number, id: string, entry: string, display: Record<string, unknown>): ReplayEnvelope => ({
      ...binding(seq, id, "diary"),
      payload: { ...binding(seq, id, "diary").payload, provenance: { entry_id: entry } },
      display: { record_id: id, ...display } as ReplayEnvelope["display"],
    });
    const fold = foldEnvelopes([
      diary(1, "ex:diary-open", "diary_111111111111111111111111", { kind: "diary", diary: true, title: "the bridges were real" }),
      diary(2, "ex:diary-shut", "diary_222222222222222222222222", { kind: "memory", title: "x" }),
    ]);
    const title = entryTitleOf(fold);
    expect(title("diary_111111111111111111111111")).toBe("the bridges were real");
    expect(title("diary_222222222222222222222222")).toBeNull();
    expect(readableKeyword("diary_222222222222222222222222", title)).toBe("a diary entry");
  });
});

describe("wrapTopicLabel", () => {
  const m = (t: string) => t.length * 6; // 6 px per character
  it("one line when it fits", () => {
    expect(wrapTopicLabel("climate, task, bridge", 220, m)).toEqual({ lines: ["climate, task, bridge"], complete: true });
  });

  it("wraps after a comma onto a second line, nothing left out", () => {
    const r = wrapTopicLabel("humanitarian-needs, east-africa, response-plan", 220, m);
    expect(r.complete).toBe(true);
    expect(r.lines).toEqual(["humanitarian-needs, east-africa,", "response-plan"]);
    expect(r.lines.join(" ")).toBe("humanitarian-needs, east-africa, response-plan");
  });

  it("a label longer than two lines says so ('…'); the card shows the rest", () => {
    const r = wrapTopicLabel("aaaaaaaaaa, bbbbbbbbbb, cccccccccc, dddddddddd, eeeeeeeeee", 72, m);
    expect(r.lines).toHaveLength(2);
    expect(r.complete).toBe(false);
    expect(r.lines[1].endsWith("…")).toBe(true);
    for (const l of r.lines) expect(m(l)).toBeLessThanOrEqual(72);
  });
});

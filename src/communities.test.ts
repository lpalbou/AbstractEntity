/**
 * His topics as memory serves them (payload v2, COMMUNITIES-DESIGN
 * 2026-11-10 §3): what the app reads, what it refuses (named), and that a
 * gateway before v2 is told apart by the ABSENCE of `version` only — then
 * the titles and summaries in his words (authored, or being written; never
 * a label the app made), and the fold's ghost guard (a community record is
 * a circle, never a node).
 */
import { describe, expect, it } from "vitest";

import { readCommunities, SUMMARY_BEING_WRITTEN, topicSummary, topicTitle, UNTITLED_TOPIC, type CommunitiesRead } from "./communities";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { TITLE_BEING_WRITTEN } from "./untitled";

type Raw = Record<string, unknown>;

function rawCommunity(key: string, members: string[], over: Raw = {}): Raw {
  return {
    id: `ex:community-${key}-r1`,
    key,
    title: `Topic ${key}`,
    summary: `What ${key} is about.`,
    pending: [],
    verdict: null,
    size: members.length,
    kinds: { episode: members.length },
    members: members.map((id) => ({ id, via: "detected" })),
    provisional_ids: [],
    cohesion: 0.61,
    layout: { xy: [0, 0], radius: 10, seats: Object.fromEntries(members.map((id, i) => [id, [i, 0]])) },
    ...over,
  };
}

function rawPayload(communities: Raw[], over: Raw = {}): Raw {
  return { version: 2, version_seq: 102850, first_sleep_pending: false, algorithm: "louvain-warm-v1", communities, links: [], ...over };
}

const served = (read: CommunitiesRead) => {
  if (read.kind !== "served") throw new Error(`expected served, got ${JSON.stringify(read)}`);
  return read.data;
};

describe("readCommunities: payload v2", () => {
  it("reads the served communities: key, record id, title, summary, members, layout", () => {
    const data = served(readCommunities(rawPayload([rawCommunity("a", ["ex:episode-1", "ex:diary-2"], { layout: { xy: [3, -4], radius: 7, seats: { "ex:episode-1": [1, 2] } } })])));
    expect(data.versionSeq).toBe(102850);
    const [c] = data.communities;
    expect(c.key).toBe("a");
    expect(c.recordId).toBe("ex:community-a-r1");
    expect(c.title).toBe("Topic a");
    expect(c.summary).toBe("What a is about.");
    expect(c.titlePending).toBe(false);
    expect(c.members).toEqual([
      { id: "ex:episode-1", via: "detected" },
      { id: "ex:diary-2", via: "detected" },
    ]);
    expect(c.layout).toMatchObject({ x: 3, y: -4, radius: 7 });
    expect(c.layout.seats.get("ex:episode-1")).toEqual({ dx: 1, dy: 2 });
    expect(c.layout.seats.has("ex:diary-2")).toBe(false);
  });

  it("provisional members: via provisional or listed in provisional_ids, appended in join order", () => {
    const data = served(
      readCommunities(
        rawPayload([
          rawCommunity("a", ["ex:m1"], {
            members: [
              { id: "ex:m1", via: "detected" },
              { id: "ex:m2", via: "provisional" },
            ],
            provisional_ids: ["ex:m3", "ex:m2"],
          }),
        ]),
      ),
    );
    const [c] = data.communities;
    expect(c.members.map((m) => m.id)).toEqual(["ex:m1", "ex:m2", "ex:m3"]);
    expect([...c.provisional].sort()).toEqual(["ex:m2", "ex:m3"]);
  });

  it("pending fields come from the served list of names", () => {
    const [c] = served(readCommunities(rawPayload([rawCommunity("a", ["ex:m1"], { title: null, summary: null, pending: ["title", "summary"] })]))).communities;
    expect(c.titlePending).toBe(true);
    expect(c.summaryPending).toBe(true);
    expect(c.title).toBeNull();
  });

  it("first_sleep_pending: true is its own state (no communities yet)", () => {
    expect(readCommunities({ version: 2, version_seq: null, first_sleep_pending: true, communities: [] })).toEqual({ kind: "first_sleep" });
  });

  it("a gateway before v2 (no `version`) is UNSERVED — told apart by that absence only", () => {
    // Today's v1 payload: Louvain labels, keywords, exemplar — nothing of it is read.
    const v1 = {
      algorithm: "louvain-v1",
      node_count: 1030,
      edge_count: 4772,
      communities: [{ id: 0, label: "isabella-cognita, abstract-hand, last-turn", keywords: ["isabella-cognita"], exemplar_id: "ex:e", exemplar_title: "x", size: 3, kinds: {}, member_ids: ["a", "b", "c"] }],
      unclustered: [],
      links: [],
      params: {},
      journal_seq: 102850,
    };
    expect(readCommunities(v1)).toEqual({ kind: "unserved" });
    expect(readCommunities({ communities: [] })).toEqual({ kind: "unserved" });
    // A v2 answer with a layout-less community is NOT taken for v1: it is named.
    const noLayout = readCommunities(rawPayload([rawCommunity("a", ["ex:m1"], { layout: undefined })]));
    expect(noLayout).toEqual({ kind: "malformed", problem: "community a: no layout" });
  });

  it("a wrong v2 shape is named, never repaired", () => {
    const problem = (body: unknown) => {
      const r = readCommunities(body);
      return r.kind === "malformed" ? r.problem : r.kind;
    };
    expect(problem(null)).toBe("the answer is not a JSON object");
    expect(problem([])).toBe("the answer is not a JSON object");
    expect(problem(rawPayload([], { version: 3 }))).toBe("topics version 3 (this app reads version 2)");
    expect(problem(rawPayload([], { first_sleep_pending: "no" }))).toBe("first_sleep_pending is not true or false");
    expect(problem(rawPayload([], { version_seq: "102850" }))).toBe("version_seq is not a number");
    expect(problem(rawPayload([], { communities: {} }))).toBe("communities is not a list");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { key: "" })]))).toBe("communities[0].key is not a string");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { id: 7 })]))).toBe("communities[0].id is not a string");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"]), rawCommunity("a", ["ex:m2"])]))).toBe("two communities share the key a");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { title: 3 })]))).toBe("community a: title is neither text nor null");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { pending: "title" })]))).toBe("community a: pending is not a list of field names");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { members: ["ex:m1"] })]))).toBe("community a: a member is not {id, via}");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { member_ids: ["ex:m1"], members: undefined })]))).toBe("community a: members is not a list");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { provisional_ids: undefined })]))).toBe("community a: provisional_ids is not a list of ids");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { layout: { x: 1, y: 2, radius: 3, seats: {} } })]))).toBe("community a: layout.xy is not [x, y]");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { layout: { xy: [1, 2], radius: 0, seats: {} } })]))).toBe("community a: layout.radius is not a positive number");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { layout: { xy: [1, 2], radius: 3, seats: { "ex:m1": [1] } } })]))).toBe("community a: the seat of ex:m1 is not [dx, dy]");
  });
});

describe("a topic's words", () => {
  it("the authored title; 'title being written…' while memory says so; never a made-up label", () => {
    expect(topicTitle({ title: "The harbour archive", titlePending: false }, TITLE_BEING_WRITTEN)).toBe("The harbour archive");
    // A title being rewritten (stale membership) still reads as being written.
    expect(topicTitle({ title: "The harbour archive", titlePending: true }, TITLE_BEING_WRITTEN)).toBe(TITLE_BEING_WRITTEN);
    expect(topicTitle({ title: null, titlePending: true }, TITLE_BEING_WRITTEN)).toBe("title being written…");
    expect(topicTitle({ title: null, titlePending: false }, TITLE_BEING_WRITTEN)).toBe(UNTITLED_TOPIC);
  });

  it("the authored summary; 'summary being written…' while pending; else nothing", () => {
    expect(topicSummary({ summary: "Ports and tides.", summaryPending: false })).toBe("Ports and tides.");
    expect(topicSummary({ summary: "old", summaryPending: true })).toBe(SUMMARY_BEING_WRITTEN);
    expect(topicSummary({ summary: null, summaryPending: false })).toBeNull();
  });
});

describe("the fold's ghost guard", () => {
  const binding = (seq: number, id: string, kind: string): ReplayEnvelope =>
    ({
      stream: "abstractmemory.replay",
      stream_version: 1,
      seq,
      family: "binding",
      observed_at: "2026-11-10T03:00:00+00:00",
      scope: "life",
      owner_id: "entity:castor",
      trace_id: null,
      turn_id: null,
      run_id: null,
      payload: { record_id: id, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "inactive", lifecycle: "formed", source: "maintenance", reason: null, binding_id: `b${seq}`, seq },
      display: { record_id: id, kind, title: `t ${id}`, graph_id: id, edges: [{ relation: "summarizes", target_graph_id: "ex:episode-1" }] },
    }) as unknown as ReplayEnvelope;

  it("a community binding on the replay forms no node and no edge (its circle is served)", () => {
    const fold = foldEnvelopes([binding(1, "ex:episode-1", "episode"), binding(2, "ex:community-abc", "community")]);
    expect([...fold.nodes.keys()]).toEqual(["ex:episode-1"]);
    expect(fold.structural_edges.size).toBe(1); // the episode's own edge only
  });
});

/**
 * His topics as memory serves them (payload v2, COMMUNITIES-DESIGN
 * 2026-11-10 §3; memory's final shape at d1c1d9a): what the app reads, what
 * it refuses (named), that an answer which is not this shape — no `version`
 * (a gateway before v2) or a required field left out — is NOT SERVED (one
 * sentence, nothing filled in; only the facts' fields may be absent) — then
 * the titles and summaries in his words (authored, or being written; never
 * a label the app made), and the fold's ghost guard (a community record is
 * a circle, never a node).
 */
import { describe, expect, it } from "vitest";

import fs from "node:fs";
import path from "node:path";

import { heldCount, NO_COMMON_SUBJECT, readCommunities, SUMMARY_BEING_WRITTEN, topicSummary, topicTitle, UNTITLED_TOPIC, type CommunitiesRead } from "./communities";
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
    centroid_stale: false,
    facts: {
      span: { first: "2026-07-07T09:00:00+00:00", last: "2026-11-09T21:14:00+00:00" },
      activity: 12,
      hub: members[0] ?? null,
      bridges: members.slice(0, 1),
      paths: members.length > 1 ? [{ from: members[0], to: members[1], count: 4 }] : [],
      changed_since_last_sleep: { added: 0, moved: 0, split_from: null },
    },
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
  it("reads the served communities: key, title, summary, members, layout (the record id is read, not kept)", () => {
    const data = served(readCommunities(rawPayload([rawCommunity("a", ["ex:episode-1", "ex:diary-2"], { layout: { xy: [3, -4], radius: 7, seats: { "ex:episode-1": [1, 2] } } })])));
    expect(data.versionSeq).toBe(102850);
    const [c] = data.communities;
    expect(c.key).toBe("a");
    expect("recordId" in c).toBe(false);
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

  it("the final shape: verdict, size, kinds, centroid_stale, every fact, the topic links", () => {
    const data = served(
      readCommunities(
        rawPayload(
          [
            rawCommunity("a", ["ex:m1", "ex:m2"], {
              verdict: "no_common_subject",
              size: 2,
              kinds: { episode: 1, diary: 1 },
              centroid_stale: true,
              facts: {
                span: { first: "2026-07-07T09:00:00+00:00", last: "2026-11-09T21:14:00+00:00" },
                activity: 9,
                hub: "ex:m2",
                bridges: ["ex:m1"],
                paths: [{ from: "ex:m1", to: "ex:m2", count: 3 }],
                changed_since_last_sleep: { added: 4, moved: 1, split_from: "b" },
              },
            }),
            rawCommunity("b", ["ex:m3"]),
          ],
          { links: [{ a: "a", b: "b", weight: 0.42 }] },
        ),
      ),
    );
    const [a, b] = data.communities;
    expect(a.verdict).toBe(NO_COMMON_SUBJECT);
    expect(b.verdict).toBeNull();
    expect(a.size).toBe(2);
    expect([...a.kinds]).toEqual([
      ["episode", 1],
      ["diary", 1],
    ]);
    expect(a.centroidStale).toBe(true);
    expect(b.centroidStale).toBe(false);
    expect(a.facts).toEqual({
      span: { first: "2026-07-07T09:00:00+00:00", last: "2026-11-09T21:14:00+00:00" },
      activity: 9,
      hub: "ex:m2",
      bridges: ["ex:m1"],
      paths: [{ from: "ex:m1", to: "ex:m2", count: 3 }],
      changed: { added: 4, moved: 1, splitFrom: "b" },
    });
    expect(data.links).toEqual([{ a: "a", b: "b", weight: 0.42 }]);
  });

  it("every field of facts may be absent: it is simply not there (served)", () => {
    const [c] = served(readCommunities(rawPayload([rawCommunity("a", ["ex:m1"], { facts: {} })]))).communities;
    expect(c.facts).toEqual({});
    const [d] = served(readCommunities(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { hub: null, span: { first: null, last: null } } })]))).communities;
    expect(d.facts).toEqual({ hub: null, span: { first: null, last: null } });
  });

  it("first_sleep_pending: true is its own state (memory's empty payload, as served)", () => {
    expect(readCommunities({ version: 2, version_seq: null, first_sleep_pending: true, algorithm: null, communities: [], links: [] })).toEqual({ kind: "first_sleep" });
  });

  it("a required field left out is NOT SERVED — the one sentence, the field named in `missing`, nothing filled in", () => {
    const missing = (body: unknown) => {
      const r = readCommunities(body);
      if (r.kind !== "unserved") throw new Error(`expected unserved, got ${JSON.stringify(r)}`);
      return r.missing;
    };
    for (const name of ["version_seq", "first_sleep_pending", "algorithm", "communities", "links"]) {
      const body = rawPayload([rawCommunity("a", ["ex:m1"])]);
      delete body[name];
      expect(missing(body)).toBe(name);
    }
    // Memory's empty payload without its links (the first v2 gateway's) is not served either.
    expect(missing({ version: 2, version_seq: null, first_sleep_pending: true, algorithm: null, communities: [] })).toBe("links");
    for (const name of ["id", "key", "title", "summary", "pending", "verdict", "size", "kinds", "members", "provisional_ids", "cohesion", "layout", "centroid_stale", "facts"]) {
      const c = rawCommunity("a", ["ex:m1"]);
      delete c[name];
      expect(missing(rawPayload([rawCommunity("z", ["ex:z1"]), c]))).toBe(`communities[1].${name}`);
    }
    for (const name of ["xy", "radius", "seats"]) {
      const c = rawCommunity("a", ["ex:m1"]);
      delete (c.layout as Raw)[name];
      expect(missing(rawPayload([c]))).toBe(`communities[0].layout.${name}`);
    }
    // Inside a fact that IS served, its own fields are required.
    expect(missing(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { span: { first: "2026-07-07T09:00:00+00:00" } } })]))).toBe("communities[0].facts.span.last");
    expect(missing(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { changed_since_last_sleep: { added: 1, moved: 0 } } })]))).toBe("communities[0].facts.changed_since_last_sleep.split_from");
    expect(missing(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { paths: [{ from: "ex:m1", to: "ex:m2" }] } })]))).toBe("communities[0].facts.paths[0].count");
    expect(missing(rawPayload([rawCommunity("a", ["ex:m1"])], { links: [{ a: "a", weight: 1 }] }))).toBe("links[0].b");
    // The first v2 shape (08e85ef's: no verdict, kinds, centroid_stale, facts) is not served.
    const first = rawCommunity("a", ["ex:m1"]);
    for (const name of ["verdict", "kinds", "centroid_stale", "facts"]) delete first[name];
    expect(missing(rawPayload([first]))).toBe("communities[0].verdict");
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
    // A v2 answer whose layout is there but not an object is named.
    const noLayout = readCommunities(rawPayload([rawCommunity("a", ["ex:m1"], { layout: null })]));
    expect(noLayout).toEqual({ kind: "malformed", problem: "topic 1 (“Topic a”): layout is not an object" });
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
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { key: "" })]))).toBe("topic 1: key is not a string");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { id: 7 })]))).toBe("topic 1: id is not a string");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"]), rawCommunity("a", ["ex:m2"], { id: "ex:community-a2-r1" })]))).toBe("two topics share one key");
    // The record id is checked like the key (review N1): two topics, one revision record.
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"]), rawCommunity("b", ["ex:m2"], { id: "ex:community-a-r1" })]))).toBe("two topics share one record id");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { title: 3 })]))).toBe("topic 1: title is neither text nor null");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { pending: "title" })]))).toBe("topic 1 (“Topic a”): pending is not a list of field names");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { members: ["ex:m1"] })]))).toBe("topic 1 (“Topic a”): a member is not {id, via}");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { members: { "ex:m1": "detected" } })]))).toBe("topic 1 (“Topic a”): members is not a list");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { provisional_ids: null })]))).toBe("topic 1 (“Topic a”): provisional_ids is not a list of ids");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { summary: 4 })]))).toBe("topic 1 (“Topic a”): summary is neither text nor null");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { cohesion: "0.6" })]))).toBe("topic 1 (“Topic a”): cohesion is not a number");
    expect(problem(rawPayload([], { algorithm: null }))).toBe("algorithm is not a name");
    expect(problem(rawPayload([], { links: {} }))).toBe("links is not a list");
    expect(problem(rawPayload([], { links: [{ a: "a", b: "b", weight: "1" }] }))).toBe("links[0] is not {a, b, weight}");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { verdict: "unrelated" })]))).toBe("topic 1 (“Topic a”): its verdict is not one this app reads");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { verdict: false })]))).toBe("topic 1 (“Topic a”): its verdict is not one this app reads");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { size: "1" })]))).toBe("topic 1 (“Topic a”): size is not a count");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { kinds: { episode: "1" } })]))).toBe("topic 1 (“Topic a”): kinds is not {kind: count}");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { centroid_stale: null })]))).toBe("topic 1 (“Topic a”): centroid_stale is not true or false");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { facts: null })]))).toBe("topic 1 (“Topic a”): facts is not an object");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { span: "2026" } })]))).toBe("topic 1 (“Topic a”): facts.span is not {first, last}");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { span: { first: 1, last: null } } })]))).toBe("topic 1 (“Topic a”): facts.span is not {first, last}");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { activity: "9" } })]))).toBe("topic 1 (“Topic a”): facts.activity is not a count");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { hub: 3 } })]))).toBe("topic 1 (“Topic a”): facts.hub is neither an id nor null");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { bridges: "ex:m1" } })]))).toBe("topic 1 (“Topic a”): facts.bridges is not a list of ids");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { paths: {} } })]))).toBe("topic 1 (“Topic a”): facts.paths is not a list");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { paths: [{ from: "ex:m1", to: "ex:m2", count: "2" }] } })]))).toBe("topic 1 (“Topic a”): facts.paths[0] is not {from, to, count}");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { facts: { changed_since_last_sleep: { added: 1, moved: 0, split_from: 7 } } })]))).toBe("topic 1 (“Topic a”): facts.changed_since_last_sleep is not {added, moved, split_from}");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { layout: { xy: { x: 1, y: 2 }, radius: 3, seats: {} } })]))).toBe("topic 1 (“Topic a”): layout.xy is not [x, y]");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { layout: { xy: [1, 2], radius: 0, seats: {} } })]))).toBe("topic 1 (“Topic a”): layout.radius is not a positive number");
    expect(problem(rawPayload([rawCommunity("a", ["ex:m1"], { layout: { xy: [1, 2], radius: 3, seats: { "ex:m1": [1] } } })]))).toBe("topic 1 (“Topic a”): a member's seat is not [dx, dy]");
  });

  it("a problem names a topic by its place and its title — never its key, its record id or a member's id (review N4)", () => {
    const key = "community-key-00";
    const bad = [
      { verdict: "mixed" },
      { layout: { xy: [1, 2], radius: 3, seats: { "ex:episode-secret-1": [1] } } },
      { layout: { xy: "here", radius: 3, seats: {} } },
      { facts: { hub: 4 } },
      { title: 9 },
    ];
    for (const over of bad) {
      const r = readCommunities(rawPayload([rawCommunity("b", ["ex:m0"]), rawCommunity(key, ["ex:episode-secret-1"], { id: "ex:community-rev-77", title: "The harbour archive", ...over })]));
      if (r.kind !== "malformed") throw new Error(JSON.stringify(r));
      expect(r.problem).toMatch(/^topic 2\b/);
      for (const raw of [key, "ex:community-rev-77", "ex:episode-secret-1", "mixed"]) expect(r.problem, JSON.stringify(over)).not.toContain(raw);
    }
  });

  it("a member listed twice in ONE topic is one memory: listed once, counted once (review S4)", () => {
    const [c] = served(
      readCommunities(
        rawPayload([
          rawCommunity("a", ["ex:m1", "ex:m2"], {
            members: [
              { id: "ex:m1", via: "detected" },
              { id: "ex:m2", via: "detected" },
              { id: "ex:m1", via: "attached" },
            ],
          }),
        ]),
      ),
    ).communities;
    expect(c.members).toEqual([
      { id: "ex:m1", via: "detected" },
      { id: "ex:m2", via: "detected" },
    ]);
    expect(c.listed).toBe(2);
    expect(heldCount(c)).toBe(2);
  });

  it("a topic holds memory's count plus the memories placed in it since — whatever the graph has loaded (heldCount)", () => {
    const [c] = served(readCommunities(rawPayload([rawCommunity("a", ["ex:m1"], { size: 28, provisional_ids: ["ex:m9", "ex:m1"] })]))).communities;
    expect(c.listed).toBe(1);
    expect(c.members.map((m) => m.id)).toEqual(["ex:m1", "ex:m9"]);
    expect(heldCount(c)).toBe(29);
    // Served with no member listed (memory's size kept): it still holds them.
    const [none] = served(readCommunities(rawPayload([rawCommunity("b", [], { size: 28 })]))).communities;
    expect(none.listed).toBe(0);
    expect(heldCount(none)).toBe(28);
  });
});

describe("memory's own names (drift pin against the sibling checkout)", () => {
  const SLEEP_PY = path.resolve(__dirname, "../../abstractmemory/src/abstractmemory/communities.py");
  it.skipIf(!fs.existsSync(SLEEP_PY))("the one verdict memory's author may return is the one this app reads", () => {
    const m = fs.readFileSync(SLEEP_PY, "utf8").match(/^NO_COMMON_SUBJECT = "([^"]+)"$/m);
    expect(m?.[1]).toBe(NO_COMMON_SUBJECT);
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

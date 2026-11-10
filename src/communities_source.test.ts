/**
 * Where the graph's topics come from: one GET of the gateway's
 * /entities/{name}/communities, read by communities.readCommunities — a v1
 * answer is unserved, a v2 answer served, an HTTP error a failed read. The
 * hook's wiring (asked once per life, then only on a newer live marker,
 * never polled) is pinned on the source: the package ships no DOM for tests.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { communitiesUrl, fetchCommunities } from "./communities_source";

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

describe("fetchCommunities", () => {
  it("asks the gateway's communities route for the life", () => {
    expect(communitiesUrl("http://gw", "castor")).toBe("http://gw/api/gateway/entities/castor/communities");
    expect(communitiesUrl("http://gw/", "a b")).toBe("http://gw/api/gateway/entities/a%20b/communities");
  });

  it("a v2 answer is served; first sleep pending is its own state; a v1 answer is unserved", async () => {
    const v2 = {
      version: 2,
      version_seq: 9,
      first_sleep_pending: false,
      algorithm: "louvain-warm-v1",
      communities: [
        {
          id: "ex:community-r1",
          key: "k1",
          title: "Ports",
          summary: null,
          pending: [],
          verdict: null,
          size: 1,
          kinds: { episode: 1 },
          members: [{ id: "ex:m1", via: "detected" }],
          provisional_ids: [],
          cohesion: null,
          layout: { xy: [0, 0], radius: 1, seats: {} },
          centroid_stale: false,
          facts: {},
        },
      ],
      links: [],
    };
    expect((await fetchCommunities("http://gw", "castor", reply(200, v2))).kind).toBe("served");
    expect(await fetchCommunities("http://gw", "castor", reply(200, { version: 2, version_seq: null, first_sleep_pending: true, algorithm: null, communities: [], links: [] }))).toEqual({ kind: "first_sleep" });
    expect(await fetchCommunities("http://gw", "castor", reply(200, { algorithm: "louvain-v1", communities: [{ id: 0, label: "a, b, c", keywords: ["a"] }] }))).toEqual({ kind: "unserved" });
  });

  it("an HTTP error is a failed read (named by its status)", async () => {
    await expect(fetchCommunities("http://gw", "castor", reply(503, { detail: "x" }))).rejects.toThrow("HTTP 503");
  });
});

describe("the hook's wiring (source pins)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "communities_source.ts"), "utf8");
  it("re-reads only on a newer marker, keeping the shown answer; never polls", () => {
    expect(src).toContain("if (!key || !refetchForMarker(marker, meta.shown, meta.asked)) return;");
    expect(src).toContain("meta.asked = marker;\n    load(true);");
    expect(src).not.toMatch(/setInterval|setTimeout|nodeCount|REFRESH_MS/);
  });
  it("a failed re-read keeps what is shown", () => {
    expect(src).toContain('setState((prev) => ("kind" in prev && prev.kind === "read" ? prev : { kind: "error", message }));');
  });
});

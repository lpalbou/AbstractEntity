/**
 * The closing visit's reflection acts (chat_drawer.tsx reflectionActivity): a topic version's link to
 * the one before, closed with it during the close, never shows as "Belief revised" (W2's ledgerLine
 * rule, fed the topic versions seen in that stretch of the stream).
 */
import { describe, expect, it } from "vitest";

import { reflectionActivity } from "./chat_drawer";
import type { ReplayEnvelope } from "./stream_types";

const at = "2026-11-10T02:40:13.957351+00:00";
/** A topic version's closure (memory's community record), then the link row closed with it: kind
 * "memory", the version's graph id (castor's shape, ledger_topics.test.ts). */
const versionClosed = { seq: 11, family: "closure", observed_at: at, payload: { assertion_id: "ex:community-v1", kind: "supersede", reason: "a newer version", replacement_ids: ["ex:community-v2"], closure_id: "c11", seq: 11 }, display: { record_id: "ex:community-v1", kind: "community", graph_id: "ex:community-v1", community_key: "ex:community-k1", size: 12, title: "Tending the bridges" } } as unknown as ReplayEnvelope;
const link = { seq: 12, family: "closure", observed_at: at, payload: { assertion_id: "row-12", kind: "supersede", reason: "community ex:community-k1: version 2", replacement_ids: ["ex:community-v2"], closure_id: "c12", seq: 12 }, display: { record_id: "row-12", kind: "memory", title: "ex:community-v1 refines", graph_id: "ex:community-v1" } } as unknown as ReplayEnvelope;
const belief = { seq: 13, family: "closure", observed_at: at, payload: { assertion_id: "ex:belief-1", kind: "supersede", reason: "he changed his mind", replacement_ids: [], closure_id: "c13", seq: 13 }, display: { record_id: "ex:belief-1", kind: "memory", title: "the tide turns at six", graph_id: "ex:belief-1" } } as unknown as ReplayEnvelope;

describe("the reflection's acts", () => {
  it("a topic version's link closed with it stays out; a belief's revision stays in", () => {
    const titles = reflectionActivity([versionClosed, link, belief], 10).map((l) => l.title);
    expect(titles).not.toContain("A topic's link to its earlier version was closed");
    expect(titles.filter((t) => t === "Belief revised")).toHaveLength(1);
    // Without the version's own record in the stretch, nothing tells the link from a belief's.
    expect(reflectionActivity([link], 10).map((l) => l.title)).toEqual(["Belief revised"]);
  });

  it("only what landed after the close began, in stream order", () => {
    expect(reflectionActivity([versionClosed, link, belief], 12).map((l) => l.seq)).toEqual([13]);
    expect(reflectionActivity([belief], null)).toEqual([]);
  });
});

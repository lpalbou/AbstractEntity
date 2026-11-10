/**
 * THE LIVE MARKER (COMMUNITIES-DESIGN 2026-11-10 §3): the live tail carries
 * one `communities_changed` host marker per version of his topics; the graph
 * re-reads its topics on a marker NEWER than the version it shows, once per
 * marker — never by polling, never on node growth. The ledger says it in
 * his words.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CommunitiesRead } from "./communities";
import { ledgerLine } from "./ledger_lines";
import type { ReplayEnvelope } from "./stream_types";
import { COMMUNITIES_CHANGED, latestCommunitiesMarker, placedOnStream, refetchForMarker, useCommunitiesMarker, usePlacedOnStream } from "./topic_map";

function env(seq: number, family: string, payload: Record<string, unknown>): ReplayEnvelope {
  return { stream: "abstractmemory.replay", stream_version: 1, seq, family, observed_at: "2026-11-10T03:00:00+00:00", scope: "life", owner_id: "entity:castor", trace_id: null, turn_id: null, run_id: null, payload } as unknown as ReplayEnvelope;
}
const marker = (seq: number, version_seq: unknown) => env(seq, "host", { kind: COMMUNITIES_CHANGED, version_seq });
const SERVED = (versionSeq: number): CommunitiesRead => ({ kind: "served", data: { versionSeq, communities: [], links: [] } });

describe("latestCommunitiesMarker", () => {
  it("the newest communities_changed version_seq on the stream", () => {
    const envs = [env(1, "binding", {}), marker(2.001, 100), env(3, "host", { kind: "phase_changed", rev: 9 }), marker(4.001, 140), marker(4.002, 120)];
    expect(latestCommunitiesMarker(envs)).toBe(140);
  });

  it("only host envelopes of that kind with a numeric version_seq count", () => {
    expect(latestCommunitiesMarker([env(1, "event", { kind: COMMUNITIES_CHANGED, version_seq: 5 })])).toBeNull();
    expect(latestCommunitiesMarker([marker(1, "5"), marker(2, null), env(3, "host", { kind: "summon", version_seq: 9 })])).toBeNull();
    // The marker key is `kind` (the gateway's host-marker convention), never a second spelling.
    expect(latestCommunitiesMarker([env(1, "host", { marker: COMMUNITIES_CHANGED, version_seq: 5 })])).toBeNull();
  });

  it("incremental: continues from an index onto the previous answer", () => {
    const envs = [marker(1, 100), marker(2, 90), marker(3, 150)];
    expect(latestCommunitiesMarker(envs, 1, 100)).toBe(150);
    expect(latestCommunitiesMarker(envs, 3, 100)).toBe(100);
  });

  it("the hook reads the whole stream (not the scrub position) and only for a gateway source", () => {
    const Probe = ({ envs, on }: { envs: ReplayEnvelope[]; on: boolean }) => React.createElement("i", null, String(useCommunitiesMarker(envs, on)));
    expect(renderToStaticMarkup(React.createElement(Probe, { envs: [marker(1, 100), marker(2, 140)], on: true }))).toBe("<i>140</i>");
    expect(renderToStaticMarkup(React.createElement(Probe, { envs: [marker(1, 100)], on: false }))).toBe("<i>null</i>");
  });
});

describe("refetchForMarker", () => {
  it("a marker newer than the version shown is read", () => {
    expect(refetchForMarker(150, SERVED(100), null)).toBe(true);
  });

  it("a marker no newer than the version shown is not", () => {
    expect(refetchForMarker(100, SERVED(100), null)).toBe(false);
    expect(refetchForMarker(90, SERVED(100), null)).toBe(false);
    expect(refetchForMarker(null, SERVED(100), null)).toBe(false);
  });

  it("once per marker (a gateway still serving the old version is not asked again until the next one)", () => {
    expect(refetchForMarker(150, SERVED(100), 150)).toBe(false);
    expect(refetchForMarker(160, SERVED(100), 150)).toBe(true);
  });

  it("his first version landing (first sleep pending, or an unserved answer) is read", () => {
    expect(refetchForMarker(150, { kind: "first_sleep" }, null)).toBe(true);
    expect(refetchForMarker(150, { kind: "malformed", problem: "x" }, null)).toBe(true);
  });
});

describe("placedOnStream: memories memory placed since a version", () => {
  const placed = (seq: number, rid: unknown, key: unknown, version_seq: unknown) => env(seq, "event", { kind: "placed", record_id: rid, provenance: { community_key: key, community_id: "ex:community-x", how: "centroid", score: 0.71, provisional: true, version_seq } });

  it("record -> its community key and the version it was placed against, newest event wins, in the order first seen", () => {
    const map = placedOnStream([placed(1, "ex:episode-a", "k1", 100), env(2, "event", { kind: "selected", record_id: "ex:episode-a" }), placed(3, "ex:episode-b", "k2", 100), placed(4, "ex:episode-a", "k3", 140)]);
    expect([...map]).toEqual([
      ["ex:episode-a", { key: "k3", versionSeq: 140 }],
      ["ex:episode-b", { key: "k2", versionSeq: 100 }],
    ]);
  });

  it("a malformed placement is not one (no record, no key, no version, not an event)", () => {
    expect(placedOnStream([placed(1, "", "k1", 1), placed(2, "ex:a", "", 1), placed(3, "ex:a", "k1", "1"), env(4, "host", { kind: "placed", record_id: "ex:a", provenance: { community_key: "k", version_seq: 1 } })]).size).toBe(0);
  });

  it("the same Map comes back when nothing new was placed (identity is the change signal)", () => {
    const first = placedOnStream([placed(1, "ex:a", "k1", 1)]);
    expect(placedOnStream([placed(1, "ex:a", "k1", 1), env(2, "event", { kind: "selected" })], 1, first)).toBe(first);
    const grown = placedOnStream([placed(1, "ex:a", "k1", 1), placed(2, "ex:b", "k1", 1)], 1, first);
    expect(grown).not.toBe(first);
    expect(first.size).toBe(1); // the previous answer is never mutated
    expect(grown.size).toBe(2);
  });

  it("the hook reads the whole stream, only for a gateway source", () => {
    const Probe = ({ envs, on }: { envs: ReplayEnvelope[]; on: boolean }) => React.createElement("i", null, String(usePlacedOnStream(envs, on).size));
    expect(renderToStaticMarkup(React.createElement(Probe, { envs: [placed(1, "ex:a", "k1", 1), placed(2, "ex:b", "k1", 1)], on: true }))).toBe("<i>2</i>");
    expect(renderToStaticMarkup(React.createElement(Probe, { envs: [placed(1, "ex:a", "k1", 1)], on: false }))).toBe("<i>0</i>");
  });
});

describe("the ledger says it in his words", () => {
  it("a placed event is a quiet line in his words, never the raw kind", () => {
    const line = ledgerLine(env(6, "event", { kind: "placed", record_id: "ex:episode-a", provenance: { community_key: "k1", version_seq: 1 } }));
    expect(line.title).toBe("Placed in a topic until his next sleep");
    expect(line.tone).toBe("quiet");
  });

  it("a communities_changed marker is one line, never 'Host: communities_changed'", () => {
    const line = ledgerLine(marker(5.001, 140));
    expect(line.title).toBe("🗺 His topics changed");
    expect(line.detail).toBe("regrouped and named in his sleep");
    expect(line.title).not.toContain(COMMUNITIES_CHANGED);
  });
});

/**
 * Utterance harvest — the cognition-wave feed (uic c1807 split: I own the
 * feed, uic owns the scorer). These pin the two properties that carry the
 * contract: only the ENTITY's own words are harvested (never the other
 * party's / operator's), and a SEALED diary entry's words never enter the
 * feed. Pure extractors, tested without I/O (the async fetch composition is
 * a bounded fan-out over these).
 */
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import { countBySource, harvestableNodes, utterancesFromTranscript, type Utterance } from "./utterance_harvest";
import type { ChatTranscript } from "./stream_source";
import type { ReplayEnvelope } from "./stream_types";

let seq = 0;
function bindEnv(recordId: string, display: Record<string, unknown>, bornAt: string): ReplayEnvelope {
  seq += 1;
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    observed_at: bornAt,
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    family: "binding",
    payload: {
      record_id: recordId,
      scope: "life",
      owner_id: "entity:test",
      search_state: "indexed",
      prompt_state: "active",
      lifecycle: "formed",
      source: "remember",
      reason: null,
      observed_at: bornAt,
      binding_id: `b-${recordId}`,
      seq,
    },
    display,
  } as ReplayEnvelope;
}

describe("utterancesFromTranscript", () => {
  it("harvests the entity's reply, never the other party's line", () => {
    const transcript: ChatTranscript = {
      chat_id: "chat-1",
      turns: [
        { turn_id: "t1", speaker: "person:laurent", text: "How are you feeling today?", reply: "I feel steady — my memories are within reach and the room is quiet.", at: "2026-07-08T10:00:00Z" },
        { turn_id: "t2", speaker: "person:laurent", text: "hi", reply: "short" }, // reply too short → skipped
      ],
    };
    const out = utterancesFromTranscript(transcript);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("t1");
    expect(out[0].source).toBe("visit");
    // The harvested text is the entity's REPLY, not the operator's question.
    expect(out[0].text.startsWith("I feel steady")).toBe(true);
    expect(out[0].text.includes("How are you feeling")).toBe(false);
  });
});

describe("harvestableNodes", () => {
  it("includes authored records + readable diary, excludes sealed diary", () => {
    const fold = foldEnvelopes([
      bindEnv("ex:ep", { record_id: "ex:ep", kind: "episode", title: "a lived moment" }, "2026-07-07T09:00:00Z"),
      bindEnv("ex:sum", { record_id: "ex:sum", kind: "summary", title: "a reflection" }, "2026-07-07T10:00:00Z"),
      bindEnv("ex:d-open", { record_id: "ex:d-open", kind: "diary", diary: true, entry_id: "diary_open", title: "readable entry" }, "2026-07-07T11:00:00Z"),
      bindEnv("ex:d-seal", { record_id: "ex:d-seal", kind: "diary", redacted: "diary" }, "2026-07-07T12:00:00Z"),
    ]);
    const rows = harvestableNodes(fold);
    const ids = rows.map((r) => r.node.id);
    // Episode, summary, and the readable diary are harvestable.
    expect(rows.some((r) => r.source === "episode")).toBe(true);
    expect(rows.some((r) => r.source === "summary")).toBe(true);
    expect(rows.some((r) => r.source === "diary")).toBe(true);
    // The SEALED diary entry is NOT harvestable — its words never enter the feed.
    const sealed = [...fold.nodes.values()].find((n) => n.redacted && !n.entry_id);
    expect(sealed).toBeTruthy();
    expect(ids.includes(sealed!.id)).toBe(false);
  });

  it("orders chronologically by born_at", () => {
    const fold = foldEnvelopes([
      bindEnv("ex:b", { record_id: "ex:b", kind: "episode", title: "second" }, "2026-07-08T00:00:00Z"),
      bindEnv("ex:a", { record_id: "ex:a", kind: "episode", title: "first" }, "2026-07-07T00:00:00Z"),
    ]);
    const rows = harvestableNodes(fold);
    expect(rows.map((r) => r.node.title)).toEqual(["first", "second"]);
  });
});

describe("countBySource", () => {
  it("labels the calibration corpus by source (uic's calibrated_on)", () => {
    const u: Utterance[] = [
      { id: "1", label: "visit", text: "a", at: "", source: "visit" },
      { id: "2", label: "visit", text: "b", at: "", source: "visit" },
      { id: "3", label: "diary", text: "c", at: "", source: "diary" },
      { id: "4", label: "episode", text: "d", at: "", source: "episode" },
    ];
    expect(countBySource(u)).toEqual({ total: 4, visit: 2, diary: 1, episode: 1, summary: 0 });
  });
});

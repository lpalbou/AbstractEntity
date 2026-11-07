/** The time panel's lanes of defining events (operator 2026-11-07). */

import { describe, expect, it } from "vitest";

import { foldEvents, laneOf } from "./timeline";
import type { ReplayEnvelope } from "./stream_types";

const bind = (seq: number, display: Record<string, unknown>, source = "remember") =>
  ({ seq, family: "binding", observed_at: "2026-11-07T16:08:00+00:00", payload: { record_id: `r${seq}`, source }, display }) as unknown as ReplayEnvelope;

describe("defining events", () => {
  it("each formed memory goes on its lane; everything else stays off the panel", () => {
    expect(laneOf(bind(1, { kind: "episode" }))).toBe("moments");
    expect(laneOf(bind(2, { kind: "diary" }))).toBe("diary");
    expect(laneOf(bind(3, { diary: true }))).toBe("diary");
    expect(laneOf(bind(4, { redacted: "diary" }))).toBe("diary");
    expect(laneOf(bind(5, { kind: "lesson" }))).toBe("lessons");
    expect(laneOf(bind(6, { kind: "world_model" }))).toBe("world");
    expect(laneOf(bind(7, { kind: "dream" }))).toBe("dreams");
    expect(laneOf(bind(8, { kind: "summary" }))).toBeNull();
    expect(laneOf(bind(9, { kind: "episode" }, "visibility"))).toBeNull();
    expect(laneOf({ seq: 10, family: "event", payload: {} } as unknown as ReplayEnvelope)).toBeNull();
  });

  it("fold incrementally: a new array on every change, the same one when nothing changed", () => {
    const all = [bind(1, { kind: "episode", title: "exchange: hi" }), bind(2, { kind: "summary" }), bind(3, { kind: "dream", title: "Dream" })];
    const a = foldEvents(null, all.slice(0, 2));
    const b = foldEvents(a, all);
    expect(b.events).not.toBe(a.events);
    expect(b.events.map((e) => [e.index, e.lane, e.recordId])).toEqual([
      [0, "moments", "r1"],
      [2, "dreams", "r3"],
    ]);
    expect(foldEvents(b, all)).toBe(b);
    // a different life with the same seqs is folded from scratch
    const other = all.map((e) => ({ ...e }) as ReplayEnvelope);
    expect(foldEvents(b, other)).not.toBe(b);
  });
});

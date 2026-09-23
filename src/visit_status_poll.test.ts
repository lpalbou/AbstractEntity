import { describe, expect, it } from "vitest";

import { foldVisitStatus } from "./visit_status_poll";

describe("foldVisitStatus (the c5330 law as a reducer — fable5 findings 5+6)", () => {
  it("one racy open:false read never resets a held room", () => {
    const a = foldVisitStatus({ runId: "A", misses: 0, missesForRun: null }, { open: false });
    expect(a).toEqual({ kind: "count_miss", misses: 1, missesForRun: "A" });
  });

  it("two agreeing reads for the SAME run confirm the close", () => {
    const a = foldVisitStatus({ runId: "A", misses: 1, missesForRun: "A" }, { open: false });
    expect(a.kind).toBe("confirmed_closed");
  });

  it("an open read dissolves the streak", () => {
    const a = foldVisitStatus({ runId: "A", misses: 1, missesForRun: "A" }, { open: true, run_id: "A" });
    expect(a).toEqual({ kind: "keep", misses: 0, missesForRun: null });
  });

  it("a foreign run holding the room is a positive fact — immediate reset", () => {
    const a = foldVisitStatus({ runId: "A", misses: 0, missesForRun: null }, { open: true, run_id: "B" });
    expect(a.kind).toBe("foreign_takeover");
  });

  it("a miss streak NEVER leaks across run identities (finding 6: run A's miss must not half-kill fresh run B)", () => {
    const a = foldVisitStatus({ runId: "B", misses: 1, missesForRun: "A" }, { open: false });
    expect(a).toEqual({ kind: "count_miss", misses: 1, missesForRun: "B" });
  });

  it("no held room: closed reads are inert", () => {
    const a = foldVisitStatus({ runId: null, misses: 0, missesForRun: null }, { open: false });
    expect(a).toEqual({ kind: "keep", misses: 0, missesForRun: null });
  });

  it("open with a missing run_id keeps ours (a status shape without ids must not evict)", () => {
    const a = foldVisitStatus({ runId: "A", misses: 0, missesForRun: null }, { open: true });
    expect(a.kind).toBe("keep");
  });
});

import { describe, expect, it } from "vitest";

import { foldFlowAnswer, foldGoodbyeWords, pollRunToTerminal, queueCardLine, screenDiaryFences, type RunSummaryShape } from "./flow_lane";

/** Deterministic clock + instant sleep for table-driven poll tests. */
function harness(reads: Array<RunSummaryShape | Error>, opts?: { abortAfter?: number }) {
  let t = 0;
  let calls = 0;
  return {
    fetchSummary: () => {
      const r = reads[Math.min(calls, reads.length - 1)];
      calls += 1;
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
    aborted: () => (opts?.abortAfter != null ? calls >= opts.abortAfter : false),
    callCount: () => calls,
  };
}

describe("pollRunToTerminal (the ONE loop both lanes ride — fable5 finding 1/B)", () => {
  it("reaches terminal and carries output + error", async () => {
    const h = harness([{ status: "running" }, { status: "completed", output: { answer: "hi" }, error: null }]);
    const out = await pollRunToTerminal(h.fetchSummary, { deadlineMs: 60_000, ...h });
    expect(out).toEqual({ kind: "terminal", status: "completed", output: { answer: "hi" }, error: null });
  });

  it("an abort wins over everything — even between sleep and fetch", async () => {
    const h = harness([{ status: "running" }], { abortAfter: 1 });
    const out = await pollRunToTerminal(h.fetchSummary, { deadlineMs: 60_000, ...h });
    expect(out.kind).toBe("aborted");
    // the aborted loop must not keep fetching
    expect(h.callCount()).toBe(1);
  });

  it("four consecutive failures recover; the fifth loses the view honestly", async () => {
    const boom = new Error("net");
    const recovers = harness([boom, boom, boom, boom, { status: "completed", output: "ok", error: null }]);
    const r1 = await pollRunToTerminal(recovers.fetchSummary, { deadlineMs: 600_000, ...recovers });
    expect(r1.kind).toBe("terminal");
    const dies = harness([boom, boom, boom, boom, boom]);
    const r2 = await pollRunToTerminal(dies.fetchSummary, { deadlineMs: 600_000, ...dies });
    expect(r2.kind).toBe("lost_view");
  });

  it("the deadline fires with the last seen status (never a silent hang)", async () => {
    const h = harness([{ status: "waiting" }]);
    const out = await pollRunToTerminal(h.fetchSummary, { deadlineMs: 3_000, ...h });
    expect(out).toEqual({ kind: "deadline", lastStatus: "waiting" });
  });

  it("failed and cancelled are terminal, not retried", async () => {
    const h = harness([{ status: "failed", error: "boom" }]);
    const out = await pollRunToTerminal(h.fetchSummary, { deadlineMs: 60_000, ...h });
    expect(out).toEqual({ kind: "terminal", status: "failed", output: undefined, error: "boom" });
  });
});

describe("screenDiaryFences (privacy guard — fable5 findings 2+3)", () => {
  it("no fence: text passes untouched, leaked=false", () => {
    expect(screenDiaryFences("plain words")).toEqual({ display: "plain words", leaked: false });
  });

  it("a terminated fence is withheld", () => {
    const r = screenDiaryFences("before\n```diary visibility=private\nsecret words\n```\nafter");
    expect(r.leaked).toBe(true);
    expect(r.display).not.toContain("secret words");
    expect(r.display).toContain("[diary entry withheld from display]");
    expect(r.display).toContain("before");
    expect(r.display).toContain("after");
  });

  it("multiple fences are all withheld", () => {
    const r = screenDiaryFences("```diary\none\n```\nmid\n```diary\ntwo\n```");
    expect(r.display).not.toContain("one");
    expect(r.display).not.toContain("two");
    expect(r.display).toContain("mid");
  });

  it("an UNTERMINATED fence withholds to end-of-string (the truncation shape a real leak takes)", () => {
    const r = screenDiaryFences("visible\n```diary visibility=private\nsecret truncated words");
    expect(r.leaked).toBe(true);
    expect(r.display).not.toContain("secret");
    expect(r.display).toContain("visible");
  });

  it("a single-line opener without a newline is still caught", () => {
    const r = screenDiaryFences("```diary secret```");
    expect(r.leaked).toBe(true);
    expect(r.display).not.toContain("secret");
  });

  it("is stateless across calls (the /g lastIndex refactor hazard, pinned)", () => {
    const text = "```diary\nx\n```";
    expect(screenDiaryFences(text).leaked).toBe(true);
    expect(screenDiaryFences(text).leaked).toBe(true);
  });
});

describe("foldFlowAnswer (tolerant fold + degraded contract)", () => {
  it("string output IS the answer", () => {
    expect(foldFlowAnswer("hello").answer).toBe("hello");
  });

  it("object variants fold in priority order and tools/rounds carry", () => {
    const f = foldFlowAnswer({ answer: "a", tools_ran: ["web_search", "web_search"], tool_rounds: 2 });
    expect(f.answer).toBe("a");
    expect(f.toolsRan).toEqual(["web_search", "web_search"]);
    expect(f.toolRoundsPresent).toBe(true);
  });

  it("absent tools_ran is null (blind gauge), served-empty is [] (authoritative zero)", () => {
    expect(foldFlowAnswer({ answer: "a" }).toolsRan).toBeNull();
    expect(foldFlowAnswer({ answer: "a", tools_ran: [] }).toolsRan).toEqual([]);
  });

  it("degraded + moment_error surface; whitespace answers are null", () => {
    const f = foldFlowAnswer({ answer: "  ", degraded: 1, moment_error: "effect died" });
    expect(f.answer).toBeNull();
    expect(f.degraded).toBe(true);
    expect(f.momentError).toBe("effect died");
  });
});

describe("foldGoodbyeWords", () => {
  it("answer wins, response is the fallback, junk is null", () => {
    expect(foldGoodbyeWords({ answer: "bye", response: "x" })).toBe("bye");
    expect(foldGoodbyeWords({ response: "closing words" })).toBe("closing words");
    expect(foldGoodbyeWords({ turns: 3 })).toBeNull();
    expect(foldGoodbyeWords(null)).toBeNull();
  });
});

describe("queueCardLine (decision:summon-queue-v1 §13/§3 — position honest, ETA a ceiling, own-time race legible)", () => {
  it("solo waiter is 'you're next'; ordinals only when >1", () => {
    expect(queueCardLine({ state: "queued", position: 1 })).toContain("you're next");
    expect(queueCardLine({ state: "queued", position: 2 })).toContain("2nd in line");
    expect(queueCardLine({ state: "queued", position: 4 })).toContain("4th in line");
  });

  it("own_time renders as the design working, never stuck silence", () => {
    const line = queueCardLine({ state: "queued", position: 1, waiting_behind: "own_time" });
    expect(line).toContain("his own time claimed it");
    expect(line).toContain("still first");
  });

  it("the deadline is worded as a ceiling, never a promise", () => {
    const line = queueCardLine({ state: "queued", position: 1, current_idle_deadline: new Date().toISOString() });
    expect(line).toContain("a ceiling, not a promise");
  });

  it("failed carries the door's reason verbatim; reaped and stepped_away say themselves", () => {
    expect(queueCardLine({ state: "failed", reason: "context floor" })).toContain("context floor");
    expect(queueCardLine({ state: "reaped" })).toContain("released");
    expect(queueCardLine({ state: "stepped_away" })).toContain("stepped away");
  });
});

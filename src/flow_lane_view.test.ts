import { describe, expect, it } from "vitest";
import { ReplayViewUnavailableError, type ReplayView, type ReplayViewTransport, type SseFrame } from "@abstractframework/panel-chat";

import { followRunToTerminal, waitingLine, type RunSummaryShape, type RunWaiting } from "./flow_lane";

const ROOT = "11111111-root";
const CHILD = "22222222-child";

function view(seq: number, status: string, extra: Partial<ReplayView> = {}): ReplayView {
  return {
    version: "replay_view_v1", root_run_id: ROOT, status, display_status: null,
    cursor: { token: `11111111:${seq}`, records: seq, runs: { [ROOT]: seq } },
    runs: [{ run_id: ROOT, status }], interaction: null, open_waits: [], messages: [], activities: [], artifacts: [], usage: null, warnings: [],
    ...extra,
  };
}
const delta = (v: ReplayView): SseFrame => ({ event: "delta", id: v.cursor.token, data: JSON.stringify({ status: v.status, cursor: v.cursor, interaction: v.interaction, messages: v.messages }) });
const ask = { kind: "tool_approval" as const, run_id: CHILD, wait_key: "tool_approval:x", prompt: "write a.txt?", choices: null };

/** A gateway: GET /view answers `initial`; each stream call delivers its batch of frames, then ends. */
function gateway(initial: ReplayView | Error, batches: Array<SseFrame[] | Error>) {
  const calls = { getView: 0, streams: [] as Array<string | null | undefined> };
  const transport: ReplayViewTransport = {
    async getView() {
      calls.getView += 1;
      if (initial instanceof Error) throw initial;
      return { notModified: false, view: JSON.parse(JSON.stringify(initial)), etag: `"${initial.cursor.token}"`, bytes: 0 };
    },
    async streamView(_runId, opts) {
      const batch = batches[Math.min(calls.streams.length, batches.length - 1)];
      calls.streams.push(opts.lastEventId);
      if (batch instanceof Error) throw batch;
      for (const f of batch) {
        if (opts.signal.aborted) break;
        opts.onFrame(f);
      }
      return { bytes: 0 };
    },
  };
  return { transport, calls };
}

function summaries(reads: RunSummaryShape[]) {
  let n = 0;
  return { fetchSummary: () => Promise.resolve(reads[Math.min(n++, reads.length - 1)]), count: () => n };
}
const fast = { now: () => 0, sleep: () => Promise.resolve() };

describe("followRunToTerminal (the replay view, runtime 0854)", () => {
  it("a run already terminal in the view: one summary read for the structured output, no stream", async () => {
    const gw = gateway(view(9, "completed"), [[]]);
    const s = summaries([{ status: "completed", output: { answer: "hi", tool_rounds: 0 }, error: null }]);
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: s.fetchSummary, deadlineMs: 60_000, aborted: () => false, ...fast });
    expect(out).toEqual({ kind: "terminal", status: "completed", output: { answer: "hi", tool_rounds: 0 }, error: null });
    expect(gw.calls.streams.length).toBe(0);
    expect(s.count()).toBe(1);
  });

  it("surfaces a waiting run once per wait, keeps following, and never polls the summary while running", async () => {
    const waiting = view(3, "waiting", { interaction: { ...ask, step_id: "s1" } });
    const gw = gateway(view(2, "running"), [[delta(waiting), delta(view(4, "waiting", { interaction: { ...ask, step_id: "s1" } })), delta(view(6, "completed"))]]);
    const s = summaries([{ status: "completed", output: { answer: "done" } }]);
    const seen: RunWaiting[] = [];
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: s.fetchSummary, deadlineMs: 60_000, aborted: () => false, onWaiting: (w) => seen.push(w), ...fast });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "tool_approval", run_id: CHILD, wait_key: "tool_approval:x" });
    expect(waitingLine(seen[0])).toMatch(/waiting for a tool approval: “write a.txt\?” \(run 22222222\)/);
    expect(out.kind).toBe("terminal");
    expect(s.count()).toBe(1);
    expect(gw.calls.streams).toEqual(["11111111:2"]);
  });

  it("reconnects from the last applied frame when the stream drops", async () => {
    const gw = gateway(view(1, "running"), [[delta(view(2, "running"))], new Error("reset"), [delta(view(5, "completed"))]]);
    const s = summaries([{ status: "completed", output: "ok" }]);
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: s.fetchSummary, deadlineMs: 60_000, aborted: () => false, ...fast });
    expect(out.kind).toBe("terminal");
    expect(gw.calls.streams).toEqual(["11111111:1", "11111111:2", "11111111:2"]);
  });

  it("a gateway without the view route falls back to the poll, labeled", async () => {
    const gw = gateway(new ReplayViewUnavailableError(404, "Not Found"), [[]]);
    const s = summaries([{ status: "running" }, { status: "completed", output: "polled" }]);
    const reasons: string[] = [];
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: s.fetchSummary, deadlineMs: 60_000, aborted: () => false, onFallback: (r) => reasons.push(r), ...fast });
    expect(out).toMatchObject({ kind: "terminal", output: "polled" });
    expect(reasons[0]).toMatch(/0\.17\.0/);
  });

  it("any other view failure is not a fallback: five failures lose the view", async () => {
    const gw = gateway(Object.assign(new Error("boom"), { status: 500 }), [[]]);
    const s = summaries([{ status: "completed", output: "never read" }]);
    const reasons: string[] = [];
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: s.fetchSummary, deadlineMs: 60_000, aborted: () => false, onFallback: (r) => reasons.push(r), ...fast });
    expect(out.kind).toBe("lost_view");
    expect(reasons).toEqual([]);
    expect(s.count()).toBe(0);
  });

  it("a summary that trails the ledger: retried, then the view's final message stands in", async () => {
    const final = view(7, "completed", { messages: [{ id: `${ROOT}:final`, role: "assistant", kind: "final", text: "from the view", run_id: ROOT }] });
    const gw = gateway(final, [[]]);
    let t = 0;
    const s = summaries([{ status: "running" }]);
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: s.fetchSummary, deadlineMs: 60_000, aborted: () => false, now: () => t, sleep: (ms) => { t += ms; return Promise.resolve(); } });
    expect(out).toEqual({ kind: "terminal", status: "completed", output: "from the view", error: null });
    expect(s.count()).toBeGreaterThan(1);
  });

  it("stop waiting returns aborted", async () => {
    const gw = gateway(view(1, "running"), [[]]);
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: summaries([{ status: "running" }]).fetchSummary, deadlineMs: 60_000, aborted: () => true, ...fast });
    expect(out).toEqual({ kind: "aborted", lastStatus: "starting" });
  });
});

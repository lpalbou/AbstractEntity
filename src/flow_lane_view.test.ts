import { describe, expect, it } from "vitest";
import { ReplayViewUnavailableError, type ReplayView, type ReplayViewTransport, type SseFrame } from "@abstractframework/panel-chat";

import { followRunToTerminal, foldGoodbyeWords, waitingLine, type RunSummaryShape, type RunWaiting } from "./flow_lane";
import { gatewayReplayView } from "./stream_source";

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
/** A clock that moves only when the follower sleeps. */
function clock() {
  let t = 0;
  return { now: () => t, sleep: (ms: number) => { t += ms; return Promise.resolve(); }, advance: (ms: number) => { t += ms; } };
}
const fast = clock();

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

  it("any other view failure is not a fallback: the view is lost only after 30 s without a frame", async () => {
    const gw = gateway(Object.assign(new Error("boom"), { status: 500 }), [[]]);
    const s = summaries([{ status: "completed", output: "never read" }]);
    const reasons: string[] = [];
    const c = clock();
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: s.fetchSummary, deadlineMs: 600_000, aborted: () => false, onFallback: (r) => reasons.push(r), now: c.now, sleep: c.sleep });
    expect(out.kind).toBe("lost_view");
    expect(c.now()).toBeGreaterThanOrEqual(30_000);
    expect(gw.calls.getView).toBeGreaterThan(5);
    expect(reasons).toEqual([]);
    expect(s.count()).toBe(0);
  });

  it("a summary that trails the ledger: retried, then the view's final message stands in", async () => {
    const final = view(7, "completed", { messages: [{ id: `${ROOT}:final`, role: "assistant", kind: "final", text: "from the view", run_id: ROOT }] });
    const gw = gateway(final, [[]]);
    let t = 0;
    const s = summaries([{ status: "running" }]);
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: s.fetchSummary, deadlineMs: 60_000, aborted: () => false, now: () => t, sleep: (ms) => { t += ms; return Promise.resolve(); } });
    expect(out).toEqual({ kind: "terminal", status: "completed", output: { answer: "from the view" }, error: null });
    expect(foldGoodbyeWords(out.kind === "terminal" ? out.output : null)).toBe("from the view");
    expect(s.count()).toBeGreaterThan(1);
  });

  it("stop waiting returns aborted", async () => {
    const gw = gateway(view(1, "running"), [[]]);
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: summaries([{ status: "running" }]).fetchSummary, deadlineMs: 60_000, aborted: () => true, ...fast });
    expect(out).toEqual({ kind: "aborted", lastStatus: "starting" });
  });

  it("a repeated ask on the same key (a new step) is shown again; the same wait gaining its step id is not", async () => {
    const at = (seq: number, step: string | null) => view(seq, "waiting", { interaction: { ...ask, step_id: step } });
    const gw = gateway(at(1, null), [[delta(at(2, "s1")), delta(at(3, "s1")), delta(at(4, "s2")), delta(view(5, "completed"))]]);
    const seen: RunWaiting[] = [];
    await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: summaries([{ status: "completed", output: "x" }]).fetchSummary, deadlineMs: 60_000, aborted: () => false, onWaiting: (w) => seen.push(w), ...clock() });
    expect(seen.map((w) => w.step_id ?? null)).toEqual([null, "s2"]);
  });

  it("a stop during the settle window returns aborted, never the old answer", async () => {
    let stopped = false;
    const gw = gateway(view(4, "completed"), [[]]);
    const out = await followRunToTerminal(ROOT, {
      view: gw.transport,
      fetchSummary: async () => { stopped = true; return { status: "running" }; },
      deadlineMs: 60_000, aborted: () => stopped, ...clock(),
    });
    expect(out.kind).toBe("aborted");
  });

  it("the view stands in with the summary's real error for a failed run", async () => {
    const gw = gateway(view(4, "failed", { display_status: "tool crashed" }), [[]]);
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: summaries([{ status: "running", error: "provider timeout" }]).fetchSummary, deadlineMs: 60_000, aborted: () => false, ...clock() });
    expect(out).toMatchObject({ kind: "terminal", status: "failed", error: "provider timeout" });
  });

  it("`done` with a view that does not read terminal backs off and re-reads (no hot loop)", async () => {
    const done: SseFrame = { event: "done", data: "{}" };
    const gw = gateway(view(1, "running"), [[done], [done], [delta(view(2, "completed"))]]);
    const c = clock();
    const out = await followRunToTerminal(ROOT, { view: gw.transport, fetchSummary: summaries([{ status: "completed", output: "ok" }]).fetchSummary, deadlineMs: 60_000, aborted: () => false, now: c.now, sleep: c.sleep });
    expect(out.kind).toBe("terminal");
    expect(gw.calls.getView).toBe(3);
    expect(c.now()).toBeGreaterThan(0);
  });

  it("stop waiting aborts an open stream (watchdog), and the deadline ends a stream that never moves", async () => {
    const blocking: ReplayViewTransport = {
      async getView() { return { notModified: false, view: view(1, "running"), etag: '"11111111:1"', bytes: 0 }; },
      streamView: (_r, o) => new Promise((_res, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))),
    };
    let stop = false;
    setTimeout(() => { stop = true; }, 60);
    const t0 = Date.now();
    const a = await followRunToTerminal(ROOT, { view: blocking, fetchSummary: summaries([{ status: "running" }]).fetchSummary, deadlineMs: 60_000, aborted: () => stop, watchMs: 10 });
    expect(a.kind).toBe("aborted");
    expect(Date.now() - t0).toBeLessThan(2000);
    const d = await followRunToTerminal(ROOT, { view: blocking, fetchSummary: summaries([{ status: "running" }]).fetchSummary, deadlineMs: 80, aborted: () => false, watchMs: 10 });
    expect(d).toEqual({ kind: "deadline", lastStatus: "running" });
  });
});

describe("gatewayReplayView (the transport the drawer uses)", () => {
  const enc = new TextEncoder();
  it("reads runs/{id}/view under api/gateway with the session's credentials; a FastAPI route-missing 404 falls back", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response('{"detail":"Not Found"}', { status: 404, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const reasons: string[] = [];
    const s = summaries([{ status: "completed", output: "polled" }]);
    const out = await followRunToTerminal("run/1", { view: gatewayReplayView("http://gw.example", { fetchImpl }), fetchSummary: s.fetchSummary, deadlineMs: 60_000, aborted: () => false, onFallback: (r) => reasons.push(r), ...clock() });
    expect(seen[0].url).toBe("http://gw.example/api/gateway/runs/run%2F1/view");
    expect(seen[0].init.credentials).toBe("include");
    expect(reasons[0]).toMatch(/does not serve the replay view/);
    expect(out).toMatchObject({ kind: "terminal", output: "polled" });
  });

  it("a run the gateway does not hold (404 with its own detail) is not a fallback", async () => {
    const fetchImpl = (async () => new Response("{\"detail\":\"Run 'x' not found\"}", { status: 404 })) as unknown as typeof fetch;
    await expect(gatewayReplayView("", { fetchImpl }).getView("x")).rejects.toMatchObject({ status: 404 });
  });

  it("a stream that goes silent is aborted after idleMs; keep-alive bytes keep it open", async () => {
    let pulls = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        async pull(c) {
          pulls += 1;
          if (pulls <= 3) { await new Promise((r) => setTimeout(r, 30)); c.enqueue(enc.encode(": keep-alive\n\n")); return; }
          await new Promise((_r, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }) as unknown as typeof fetch;
    const t = gatewayReplayView("", { fetchImpl, idleMs: 60 });
    const t0 = Date.now();
    await expect(t.streamView("r", { signal: new AbortController().signal, onFrame: () => undefined })).rejects.toBeTruthy();
    expect(pulls).toBeGreaterThan(3);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(90);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("a view read that never answers fails within its request budget", async () => {
    const fetchImpl = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    const t0 = Date.now();
    await expect(gatewayReplayView("", { fetchImpl, requestBudgetMs: 50 }).getView("r")).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

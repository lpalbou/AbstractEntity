/** The live activity panel's rows (backlog 0010, root 1196), DOM-free: castor's two recorded visits
 * (src/fixtures/visit_turn_ledger.json: GET .../visit/{run}/ledger on the live gateway 2026-11-10,
 * shape kept, words replaced) fed record by record, the flow brain's view + stream, the words, and
 * the ledger follower's reads (cost: it never reads the visit from the start when the turn is near
 * the end). */
import { describe, expect, it } from "vitest";
import type { ReplayView } from "@abstractframework/panel-chat";

import fixture from "./fixtures/visit_turn_ledger.json";
import { NO_ACTIVITY, currentRow, foldFlowTurn, foldVisitTurn, isVisitorTurnStart, toolAskWords, turnSummary, visitTurnSlice, type TurnActivity } from "./live_activity";
import type { VisitLedgerPage, VisitLedgerRecord } from "./stream_source";
import type { ReplayEnvelope } from "./stream_types";
import { FIRST_LOOKBACK, VisitLedgerFollower, shownVisitActivity } from "./use_live_activity";

const TOPICS = fixture.visits.topics.records as unknown as VisitLedgerRecord[];
const CHECK_IN = fixture.visits.check_in.records as unknown as VisitLedgerRecord[];

function fold(records: readonly VisitLedgerRecord[], runEnded = false): TurnActivity {
  const s = visitTurnSlice(records);
  return foldVisitTurn(s.records, { begun: s.begun, complete: s.complete, runEnded });
}

describe("his own visit: one turn from the recorded ledger", () => {
  it("finds the turn: after the resume that carried his words, up to the next wait on him", () => {
    const s = visitTurnSlice(TOPICS);
    expect(s.begun).toBe(true);
    expect(s.complete).toBe(true);
    // records 4..19 of the visit (RECALL .. ANSWER); the close's resume (22) is not a turn
    expect(s.records.map((r) => r.node_id)).toEqual(["RECALL", "RECALL", "reason", "reason", "act", "act", "reason", "reason", "COMMIT", "COMMIT", "VISIT_AUTHOR", "VISIT_AUTHOR", "FORM", "FORM", "ANSWER", "ANSWER"]);
    expect(isVisitorTurnStart(TOPICS[2])).toBe(true);
    expect(isVisitorTurnStart(TOPICS[21])).toBe(false); // the close resume
    expect(s.turnKey).toBe(TOPICS[2].step_id);
  });

  it("two turns on one record: the newest is the one shown", () => {
    const s = visitTurnSlice([...TOPICS.slice(0, 21), ...CHECK_IN.slice(2, 12)]);
    expect(s.turnKey).toBe(CHECK_IN[2].step_id);
    expect(s.complete).toBe(false);
    expect(s.records[0]).toBe(CHECK_IN[3]);
  });

  it("a close is never a turn, even one that carries words (the gateway's own rule, entity_visits _served_words)", () => {
    const close = structuredClone(TOPICS[21]);
    (close.effect!.payload!.payload as Record<string, unknown>).text = "goodbye";
    expect(isVisitorTurnStart(close)).toBe(false);
    expect(visitTurnSlice([...TOPICS.slice(0, 21), close]).turnKey).toBe(TOPICS[2].step_id);
  });

  it("the whole turn: what came to mind, two steps, the memories he looked for, what he formed", () => {
    const a = fold(TOPICS);
    expect(a.rows.map((r) => [r.kind, r.text, r.detail, r.state])).toEqual([
      ["recall_passive", "Recalled passively: 44 memories", null, "done"],
      ["thinking", "Step 1 · thought", "claude-haiku-5-5", "done"],
      ["recall_active", "Recalled on purpose: “main topics”", "search_memory", "done"],
      ["recall_active", "Recalled on purpose: his 10 latest book entries", "diary_list", "done"],
      ["thinking", "Step 2 · thought", "claude-haiku-5-5", "done"],
      ["writing", "Wrote this moment's title and summary", "claude-haiku-5-5", "done"],
      ["formed", "Formed a memory: A episode he formed 1", "episode", "done"],
    ]);
    expect(a.steps).toBe(2);
    expect(a.tools).toBe(2);
    expect(a.recalled).toBe(44); // 50 handles, 6 present by right (identity is never "recalled")
    expect(a.formed).toBe(1);
    expect(a.complete).toBe(true);
    expect(a.seconds).toBeGreaterThan(50);
  });

  it("each row opens what exists: the recalled memories, the tool's answer, the formed record", () => {
    const a = fold(TOPICS);
    const recall = a.rows[0].open;
    expect(recall?.type).toBe("records");
    if (recall?.type === "records") {
      expect(recall.items).toHaveLength(44);
      expect(recall.items[0].graphId).toMatch(/^ex:/);
    }
    const search = a.rows[2].open;
    expect(search).toEqual({ type: "tool", tool: { name: "search_memory", arg: '{"query":"main topics"}', result: "(what search_memory returned)", success: true } });
    expect(a.rows[6].open).toEqual({ type: "record", graphId: "ex:episode-fed1c32099924a37c65313298f" });
    expect(a.rows[1].open).toBeNull(); // a step has nothing of its own to open
  });

  it("a workspace tool reads as Tool: name — what it asked (never JSON)", () => {
    const a = fold(CHECK_IN);
    const tool = a.rows.find((r) => r.kind === "tool")!;
    expect(tool.text).toBe("Tool: list_files — mounts/mnemosyne");
    expect(tool.text).not.toContain("{");
    expect(a.steps).toBe(2);
    expect(turnSummary(a)).toMatch(/^2 steps · 1 tool · 44 memories came to mind · 1 formed · \d+ s$/);
  });

  it("live, record by record: the running row is what he is doing now", () => {
    const now = (n: number) => {
      const a = fold(TOPICS.slice(0, n));
      const r = currentRow(a);
      return r ? [r.text, r.state] : null;
    };
    expect(fold(TOPICS.slice(0, 2)).begun).toBe(false); // parked, the turn not sent
    expect(fold(TOPICS.slice(0, 3)).rows).toEqual([]); // resumed, nothing done yet
    expect(fold(TOPICS.slice(0, 3)).begun).toBe(true);
    expect(now(4)).toEqual(["Recalling…", "running"]);
    expect(now(6)).toEqual(["Step 1 · thinking…", "running"]);
    expect(fold(TOPICS.slice(0, 6)).rows[1].detail).toBe("claude-haiku-5-5");
    expect(now(8)).toEqual(["Recalled on purpose: his 10 latest book entries", "running"]);
    expect(fold(TOPICS.slice(0, 8)).rows.filter((r) => r.state === "running")).toHaveLength(2); // both calls of the batch
    expect(now(10)).toEqual(["Step 2 · thinking…", "running"]);
    expect(now(14)).toEqual(["Writing this moment's title and summary…", "running"]);
    expect(now(16)).toEqual(["Forming a memory…", "running"]);
    expect(fold(TOPICS.slice(0, 16)).complete).toBe(false);
    expect(fold(TOPICS.slice(0, 20)).complete).toBe(true); // the wait on him after the answer
  });

  it("a failed tool and a run that ended with a step open read as failed", () => {
    const broken = structuredClone(TOPICS.slice(0, 9));
    const results = (broken[8].result as { results: Array<Record<string, unknown>> }).results;
    results[0].success = false;
    results[0].error = "the memory store is closed";
    results[0].output = "";
    const a = fold(broken);
    const search = a.rows.find((r) => r.detail === "search_memory")!;
    expect(search.state).toBe("failed");
    expect(search.open).toEqual({ type: "tool", tool: { name: "search_memory", arg: '{"query":"main topics"}', result: "the memory store is closed", success: false } });
    const ended = fold(TOPICS.slice(0, 6), true);
    expect(ended.rows[1].state).toBe("failed");
    expect(ended.rows[1].text).toBe("Step 1 · the model call failed");
    expect(ended.complete).toBe(true);
  });

  it("a book entry written during a step reads as Wrote in his book and opens its record", () => {
    const rec = structuredClone(TOPICS[23]); // the reflection's call carries diary_entries
    const a = foldVisitTurn([rec], { begun: true, complete: true });
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({ kind: "wrote", text: "Wrote in his book: A book entry 1", open: { type: "record", graphId: "ex:diary-e70cc37bf09fee33b8f1dfeba7" } });
    expect(a.formed).toBe(1);
  });

  it("not begun is nothing to show, never a zero", () => {
    expect(foldVisitTurn([], { begun: false, complete: false })).toEqual(NO_ACTIVITY);
    expect(turnSummary(NO_ACTIVITY)).toBe("nothing to show");
  });
});

describe("the words of a tool's ask", () => {
  it("names what the tool declares, in plain words", () => {
    expect(toolAskWords("web_search", { query: "port storm 1890" })).toBe("“port storm 1890”");
    expect(toolAskWords("fetch_url", { url: "https://example.org/a" })).toBe("https://example.org/a");
    expect(toolAskWords("read_file", { path: "notes/plan.md" })).toBe("notes/plan.md");
    expect(toolAskWords("read_memory", { tag: "27e16c32" })).toBe("memory #27e16c32");
    expect(toolAskWords("topics", {})).toBe("his topics");
    expect(toolAskWords("topics", { topic: "#a1b2" })).toBe("the topic #a1b2");
    expect(toolAskWords("topics", { topic: "the sea" })).toBe("the topic closest to “the sea”");
    expect(toolAskWords("recent_memories", {})).toBe("his memories of the last 2 days");
  });

  it("an unknown tool: its scalar arguments as name value, objects left out, never JSON", () => {
    expect(toolAskWords("make_map", { region: "north", zoom: 3, layers: { a: 1 } })).toBe("region north, zoom 3");
    expect(toolAskWords("make_map", { layers: { a: 1 } })).toBeNull();
  });
});

describe("the flow brain: the run's view and the memory stream", () => {
  const env = (seq: number, family: ReplayEnvelope["family"], payload: Record<string, unknown>, display: Record<string, unknown> = {}, trace: string | null = null): ReplayEnvelope => ({
    stream: "abstractmemory.replay", stream_version: 1, seq, family, observed_at: new Date(Date.parse("2026-11-10T10:00:00Z") + seq * 1000).toISOString(),
    scope: "life", owner_id: "entity:castor", trace_id: trace, turn_id: "t-0002", run_id: null, payload, display,
  });
  const stream: ReplayEnvelope[] = [
    env(9, "binding", { source: "remember", record_id: "old" }, { kind: "episode", title: "before the turn", graph_id: "ex:old" }),
    env(10, "trace", { trace_id: "tr1", trace_kind: "reconstruct", selected: ["r1", "r2", "r3"], admissions: { r1: "self", r2: "stm", r3: "stimulus" }, need: {} }),
    env(11, "event", { kind: "selected", record_id: "r2" }, { title: "the harbour", graph_id: "ex:r2" }, "tr1"),
    env(12, "event", { kind: "selected", record_id: "r3" }, { title: "the storm ledger", graph_id: "ex:r3" }, "tr1"),
    env(20, "trace", { trace_id: "tr2", trace_kind: "probe", selected: ["r4", "r5"], admissions: {}, need: { cue_text: "1890 storm" } }),
    env(30, "binding", { source: "remember", record_id: "d1" }, { kind: "diary", diary: true, title: "Where the ledger went", graph_id: "ex:diary-1" }),
    env(31, "binding", { source: "remember", record_id: "c1" }, { kind: "community", title: "The sea", graph_id: "ex:c1" }),
  ];
  const view = {
    version: "replay_view_v1", root_run_id: "run-1", status: "running", cursor: { token: "x", records: 4, runs: {} }, runs: [], interaction: null, messages: [], artifacts: [],
    activities: [
      { id: "a1", run_id: "run-1", kind: "llm", status: "completed", started_at: "2026-11-10T10:00:13Z", ended_at: "2026-11-10T10:00:16Z" },
      { id: "a2", run_id: "run-1", kind: "tool", status: "running", started_at: "2026-11-10T10:00:17Z", tool_calls: [{ name: "web_search", arguments: { query: "port storm" }, status: "running" }] },
    ],
  } as unknown as ReplayView;

  it("thinking and tools from the view, what came to mind and what formed from the stream, by time", () => {
    const a = foldFlowTurn(view, stream, 9.5);
    expect(a.rows.map((r) => [r.kind, r.text, r.state])).toEqual([
      ["recall_passive", "Recalled passively: 2 memories", "done"],
      ["thinking", "Thought", "done"],
      ["tool", "Tool: web_search — “port storm”", "running"],
      ["recall_active", "Recalled on purpose: “1890 storm” → 2", "done"],
      ["wrote", "Wrote in his book: Where the ledger went", "done"],
    ]);
    expect(a.rows[0].open).toEqual({ type: "records", items: [{ graphId: "ex:r2", title: "the harbour" }, { graphId: "ex:r3", title: "the storm ledger" }] });
    expect(a.steps).toBeNull(); // the view names no loop iteration
    expect(a.recalled).toBe(2);
    expect(a.formed).toBe(1); // the topic version is not a memory he formed this turn
    expect(a.complete).toBe(false);
    expect(currentRow(a)?.text).toBe("Tool: web_search — “port storm”");
  });

  it("nothing before the turn's start, and a terminal view ends the open rows", () => {
    expect(foldFlowTurn(null, stream, 100).rows).toEqual([]);
    const done = foldFlowTurn({ ...view, status: "completed" } as ReplayView, stream, 9.5);
    expect(done.complete).toBe(true);
    expect(done.rows.find((r) => r.kind === "tool")?.state).toBe("failed");
  });
});

describe("the ledger follower (the driver lane's reads)", () => {
  /** A gateway ledger over `records` (the route's paging: after clamped, next_cursor, total). */
  function gateway(records: VisitLedgerRecord[], status = "running") {
    const calls: Array<[number, number]> = [];
    const read = async (after: number, limit: number): Promise<VisitLedgerPage> => {
      calls.push([after, limit]);
      const start = Math.min(Math.max(0, after), records.length);
      const page = records.slice(start, start + limit);
      return { run_id: "v1", status, after: start, records: page.map((record, i) => ({ cursor: start + i + 1, record })), next_cursor: start + page.length, total: records.length, done: false };
    };
    return { calls, read };
  }

  it("the first read looks back from the end for the turn's start, then reads only what is new", async () => {
    const live = TOPICS.slice(0, 8);
    const g = gateway(live);
    const f = new VisitLedgerFollower(g.read);
    expect(await f.step()).toBe(true);
    // head, then 4 back (no turn start), then 16 back (found)
    expect(g.calls.map((c) => c[0])).toEqual([Number.MAX_SAFE_INTEGER, live.length - FIRST_LOOKBACK, 0]);
    expect(f.activity().rows.map((r) => r.kind)).toEqual(["recall_passive", "thinking", "recall_active", "recall_active"]);
    g.calls.length = 0;
    live.push(...TOPICS.slice(8, 12));
    expect(await f.step()).toBe(true);
    expect(g.calls).toEqual([[8, 200]]);
    expect(f.activity().steps).toBe(2);
    g.calls.length = 0;
    expect(await f.step()).toBe(false); // nothing new
    expect(g.calls).toEqual([[12, 200]]);
  });

  it("a long visit: the first read never starts from the beginning", async () => {
    // ten earlier turns, then the current one
    const earlier = Array.from({ length: 10 }, () => TOPICS.slice(0, 22)).flat();
    const g = gateway([...earlier, ...TOPICS.slice(0, 22)]);
    const f = new VisitLedgerFollower(g.read);
    await f.step();
    // looks back 4, 16, then 64 records (the turn starts 20 records from the end): never from 0
    const total = earlier.length + 22;
    expect(g.calls.map((c) => c[0])).toEqual([Number.MAX_SAFE_INTEGER, total - 4, total - 16, total - 64]);
    expect(f.activity().complete).toBe(true);
    expect(f.activity().turnKey).toBe(TOPICS[2].step_id);
  });

  it("a new turn drops the previous one; a terminal run ends open steps", async () => {
    const live = TOPICS.slice(0, 22);
    const g = gateway(live);
    const f = new VisitLedgerFollower(g.read);
    await f.step();
    expect(f.activity().complete).toBe(true);
    live.push(...CHECK_IN.slice(2, 6)); // the next turn starts: resume, recall, reason started
    await f.step();
    const a = f.activity();
    expect(a.complete).toBe(false);
    expect(a.turnKey).toBe(CHECK_IN[2].step_id);
    expect(a.rows.map((r) => r.kind)).toEqual(["recall_passive", "thinking"]);
    expect(f.records[0]).toBe(CHECK_IN[2]);
    const ended = gateway(TOPICS.slice(0, 6), "failed");
    const f2 = new VisitLedgerFollower(ended.read);
    await f2.step();
    expect(f2.activity().rows[1].state).toBe("failed");
  });

  it("concurrent steps share one read", async () => {
    const g = gateway(TOPICS.slice(0, 22));
    const f = new VisitLedgerFollower(g.read);
    await Promise.all([f.step(), f.step()]);
    expect(g.calls.filter((c) => c[0] === Number.MAX_SAFE_INTEGER)).toHaveLength(1);
  });
});

describe("what the drawer shows for his visit", () => {
  const done = { ...fold(TOPICS), turnKey: "turn-a" };
  const running = { ...fold(TOPICS.slice(0, 8)), turnKey: "turn-b" };
  it("this visit's turn: live rows while it runs, the summary after", () => {
    expect(shownVisitActivity({ runId: "v1", activity: running }, "v1", true, undefined)).toBe(running);
    expect(shownVisitActivity({ runId: "v1", activity: done }, "v1", false, undefined)).toBe(done);
  });
  it("a turn just sent: the previous turn is not shown as this one", () => {
    expect(shownVisitActivity({ runId: "v1", activity: done }, "v1", true, "turn-a")).toBe(NO_ACTIVITY);
    expect(shownVisitActivity({ runId: "v1", activity: running }, "v1", true, "turn-a")).toBe(running);
    // the turn sent and over before the first read: a new key, shown
    expect(shownVisitActivity({ runId: "v1", activity: { ...done, turnKey: "turn-c" } }, "v1", true, "turn-a")?.turnKey).toBe("turn-c");
  });
  it("another visit's read, no visit, nothing begun: nothing (the waiting state while live)", () => {
    expect(shownVisitActivity({ runId: "v0", activity: done }, "v1", false, undefined)).toBeNull();
    expect(shownVisitActivity({ runId: "v0", activity: done }, "v1", true, undefined)).toBe(NO_ACTIVITY);
    expect(shownVisitActivity(null, null, false, undefined)).toBeNull();
    expect(shownVisitActivity({ runId: "v1", activity: NO_ACTIVITY }, "v1", false, undefined)).toBeNull();
  });
});

/** The three visit-ledger fields the live activity panel reads where served (AbstractRuntime 1afbf68,
 * entity-runtime.md "What a visit turn's ledger records say"): the topics a passive recall touched
 * (named by title, never by key), "Step n of max" on his reasoning loop, and "→ N found" on a memory
 * search. Fed castor's recorded visits as served before the fields (today's words, unchanged) and the
 * same records with the fields stamped where the runtime writes them (src/fixtures/visit_turn_fields.ts).
 * Plus the topic title reader's cost: one topics read per turn at most, only for a key not held. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readCommunities, type CommunitiesRead } from "./communities";
import fixture from "./fixtures/visit_turn_ledger.json";
import { MAX_ITERATIONS, SEARCH_HITS, TOPIC, communitiesAnswer, withServedFields } from "./fixtures/visit_turn_fields";
import { TOPIC_TITLES_SHOWN, activityTopicKeys, currentRow, foldVisitTurn, rankTopicKeys, turnSummary, visitTurnSlice, withTopicTitles, type TurnActivity } from "./live_activity";
import type { VisitLedgerRecord } from "./stream_source";
import { TopicTitleReader } from "./use_live_activity";

const TOPICS = fixture.visits.topics.records as unknown as VisitLedgerRecord[];
const CHECK_IN = fixture.visits.check_in.records as unknown as VisitLedgerRecord[];
const SERVED = withServedFields(TOPICS);

function fold(records: readonly VisitLedgerRecord[], runEnded = false): TurnActivity {
  const s = visitTurnSlice(records);
  return { ...foldVisitTurn(s.records, { begun: s.begun, complete: s.complete, runEnded }), turnKey: s.turnKey };
}

function titlesOf(read: CommunitiesRead): Map<string, string> {
  const m = new Map<string, string>();
  if (read.kind === "served") for (const c of read.data.communities) if (c.title && !c.titlePending) m.set(c.key, c.title);
  return m;
}

const ALL_TITLES = titlesOf(readCommunities(communitiesAnswer()));
const STORM_PENDING = titlesOf(readCommunities(communitiesAnswer({ stormPending: true })));

describe("the fixture stamps the fields where the runtime writes them", () => {
  it("topic on every recall handle, iteration and max on both reason records, hits on search_memory only", () => {
    const recall = SERVED[4].result!.handles as Array<Record<string, unknown>>;
    expect(recall.every((h) => "topic" in h)).toBe(true);
    expect(recall.filter((h) => h.admission === "self").every((h) => h.topic === null)).toBe(true);
    expect([SERVED[5], SERVED[6], SERVED[9], SERVED[10]].map((r) => [r.effect!.payload!.iteration, r.effect!.payload!.max_iterations])).toEqual([[1, 50], [1, 50], [2, 50], [2, 50]]);
    const results = SERVED[8].result!.results as Array<Record<string, unknown>>;
    expect(results.map((e) => [e.name, e.hits])).toEqual([["search_memory", SEARCH_HITS], ["diary_list", undefined]]);
    expect(TOPICS[4].result!.handles as Array<Record<string, unknown>>).not.toContainEqual(expect.objectContaining({ topic: expect.anything() })); // the recording itself is untouched
  });
});

describe("without the fields (a runtime before 1afbf68): today's words", () => {
  it("no 'of ?', no '0 found', no topics", () => {
    const a = fold(TOPICS);
    const texts = a.rows.map((r) => r.text);
    expect(texts).toContain("Step 1 · thought");
    expect(texts).toContain("Step 2 · thought");
    expect(texts).toContain("Recalled on purpose: “main topics”");
    expect(texts).toContain("Recalled passively: 44 memories");
    expect(texts.join("\n")).not.toMatch(/ of |found|\?/);
    expect(a.rows.some((r) => r.topicKeys)).toBe(false);
    expect(activityTopicKeys(a)).toEqual([]);
    expect(withTopicTitles(a, ALL_TITLES)).toBe(a); // nothing to name: the same object
  });

  it("live: the step counts his reasoning calls", () => {
    expect(currentRow(fold(TOPICS.slice(0, 6)))?.text).toBe("Step 1 · thinking…");
    expect(currentRow(fold(TOPICS.slice(0, 10)))?.text).toBe("Step 2 · thinking…");
  });
});

describe("with the fields", () => {
  it("the whole turn: the step of his loop's cap, what a search found, the recall's topics", () => {
    const a = fold(SERVED);
    expect(a.rows.map((r) => [r.kind, r.text])).toEqual([
      ["recall_passive", "Recalled passively: 44 memories"],
      ["thinking", `Step 1 of ${MAX_ITERATIONS} · thought`],
      ["recall_active", `Recalled on purpose: “main topics” → ${SEARCH_HITS} found`],
      ["recall_active", "Recalled on purpose: his 10 latest book entries"], // diary_list serves no hits
      ["thinking", `Step 2 of ${MAX_ITERATIONS} · thought`],
      ["writing", "Wrote this moment's title and summary"],
      ["formed", "Formed a memory: A episode he formed 1"],
    ]);
    // the harbour holds most of them (20), then the sea (14, though seen first), the storm, the letters
    expect(a.rows[0].topicKeys).toEqual([TOPIC.harbour, TOPIC.sea, TOPIC.storm, TOPIC.letters]);
    expect(turnSummary(a)).toBe(turnSummary(fold(TOPICS))); // the summary's counts are the turn's own
  });

  it("live: 'Step 2 of 50 · thinking…'; a search reads its count only once it answered", () => {
    expect(currentRow(fold(SERVED.slice(0, 6)))?.text).toBe("Step 1 of 50 · thinking…");
    expect(currentRow(fold(SERVED.slice(0, 10)))?.text).toBe("Step 2 of 50 · thinking…");
    const running = fold(SERVED.slice(0, 8)).rows.find((r) => r.detail === "search_memory")!;
    expect(running.state).toBe("running");
    expect(running.text).toBe("Recalled on purpose: “main topics”");
    expect(fold(SERVED.slice(0, 4)).rows[0]).toMatchObject({ text: "Recalling…" });
    expect(fold(SERVED.slice(0, 4)).rows[0].topicKeys).toBeUndefined();
  });

  it("the recall names its first three titled topics by title, never by key", () => {
    const a = fold(SERVED);
    expect(withTopicTitles(a, ALL_TITLES).rows[0].text).toBe("Recalled passively: 44 memories · Harbour work, The sea, The storm of 1890");
    expect(TOPIC_TITLES_SHOWN).toBe(3);
    // a title still being written is skipped (never its key, never "being written")
    const pending = withTopicTitles(a, STORM_PENDING);
    expect(pending.rows[0].text).toBe("Recalled passively: 44 memories · Harbour work, The sea, Old letters");
    expect(JSON.stringify(pending.rows.map((r) => r.text))).not.toContain("ex:community-");
    // no title held for any: today's words, the same object
    expect(withTopicTitles(a, new Map([["ex:community-other", "Elsewhere"]]))).toBe(a);
    expect(withTopicTitles(a, new Map())).toBe(a);
    // only the recall row changes
    expect(pending.rows.slice(1)).toEqual(a.rows.slice(1));
  });

  it("the loop's own position is the step, not a count of the calls read", () => {
    const records = structuredClone(SERVED.slice(0, 6));
    records[5].effect!.payload!.iteration = 4;
    expect(currentRow(fold(records))?.text).toBe("Step 4 of 50 · thinking…");
    delete records[5].effect!.payload!.max_iterations;
    expect(currentRow(fold(records))?.text).toBe("Step 4 · thinking…"); // no cap served: no "of"
    for (const wrong of [0, -1, 2.5, "3", null]) {
      records[5].effect!.payload!.iteration = wrong;
      records[5].effect!.payload!.max_iterations = wrong;
      expect(currentRow(fold(records))?.text).toBe("Step 1 · thinking…");
    }
  });

  it("hits: zero found is said when served; a failed search and other tools never say a count", () => {
    const zero = structuredClone(SERVED.slice(0, 9));
    (zero[8].result!.results as Array<Record<string, unknown>>)[0].hits = 0;
    expect(fold(zero).rows.find((r) => r.detail === "search_memory")!.text).toBe("Recalled on purpose: “main topics” → 0 found");
    const failed = structuredClone(SERVED.slice(0, 9));
    Object.assign((failed[8].result!.results as Array<Record<string, unknown>>)[0], { success: false, error: "the memory store is closed" });
    expect(fold(failed).rows.find((r) => r.detail === "search_memory")!.text).toBe("Recalled on purpose: “main topics”");
    const tool = structuredClone(CHECK_IN);
    for (const e of tool[8].result!.results as Array<Record<string, unknown>>) e.hits = 3;
    expect(fold(tool).rows.find((r) => r.kind === "tool")!.text).toBe("Tool: list_files — mounts/mnemosyne");
  });

  it("a live correction's recall (node reason, effect memory_recall) names its topics too, and is no step", () => {
    const correction = structuredClone(SERVED[4]);
    correction.node_id = "reason";
    correction.step_id = "correction-recall";
    const a = foldVisitTurn([correction], { begun: true, complete: true });
    expect(a.steps).toBe(0);
    expect(withTopicTitles(a, ALL_TITLES).rows.map((r) => [r.kind, r.text])).toEqual([["recall_passive", "Recalled passively: 44 memories · Harbour work, The sea, The storm of 1890"]]);
  });

  it("rankTopicKeys: most first, ties by first seen, none and absent left out", () => {
    expect(rankTopicKeys([{ topic: "b" }, { topic: "a" }, { topic: null }, {}, { topic: "a" }, { topic: "c" }, { topic: "b" }, { topic: " " }])).toEqual(["b", "a", "c"]);
    expect(rankTopicKeys([{ topic: null }, {}])).toEqual([]);
  });
});

describe("the topic title reader (cost: one topics read per turn at most)", () => {
  const reader = (answers: Array<unknown | Error>) => {
    let calls = 0;
    const r = new TopicTitleReader(async () => {
      const next = answers[Math.min(calls++, answers.length - 1)];
      if (next instanceof Error) throw next;
      return readCommunities(next);
    });
    return { r, calls: () => calls };
  };
  const turnA = { ...fold(SERVED), turnKey: "turn-a" };
  const turnB = { ...fold(SERVED), turnKey: "turn-b" };

  it("no topic in the turn: no read", () => {
    const { r } = reader([communitiesAnswer()]);
    expect(r.wants(fold(TOPICS))).toBe(false);
  });

  it("reads once for a turn naming topics, then not again while every title is held", async () => {
    const { r, calls } = reader([communitiesAnswer()]);
    expect(r.wants(turnA)).toBe(true);
    expect(await r.load(turnA)).toBe(true);
    expect(calls()).toBe(1);
    expect(r.titles.get(TOPIC.harbour)).toBe("Harbour work");
    expect([...r.titles.values()]).not.toContain(TOPIC.harbour);
    expect(r.wants(turnA)).toBe(false);
    expect(r.wants(turnB)).toBe(false); // every key held: the next turn reads nothing
    expect(withTopicTitles(turnB, r.titles).rows[0].text).toBe("Recalled passively: 44 memories · Harbour work, The sea, The storm of 1890");
  });

  it("a title still being written: not held, asked again on the next turn only", async () => {
    const { r, calls } = reader([communitiesAnswer({ stormPending: true }), communitiesAnswer()]);
    await r.load(turnA);
    expect(r.titles.has(TOPIC.storm)).toBe(false);
    expect(r.wants(turnA)).toBe(false); // this turn was read for
    expect(r.wants(turnB)).toBe(true);
    expect(await r.load(turnB)).toBe(true);
    expect(calls()).toBe(2);
    expect(r.titles.get(TOPIC.storm)).toBe("The storm of 1890");
  });

  it("a failed read or an answer with no topics served: no titles, no second read this turn", async () => {
    const { r, calls } = reader([new Error("HTTP 503"), { version: 2, version_seq: null, first_sleep_pending: true, algorithm: null, communities: [], links: [] }]);
    await expect(r.load(turnA)).rejects.toThrow("HTTP 503");
    expect(r.wants(turnA)).toBe(false);
    expect(r.titles.size).toBe(0);
    expect(await r.load(turnB)).toBe(false);
    expect(calls()).toBe(2);
    expect(withTopicTitles(turnB, r.titles)).toBe(turnB);
  });

  it("the hook: titles applied to the shown turn, the read through the topics route only when wanted", () => {
    const src = readFileSync(resolve(__dirname, "use_live_activity.ts"), "utf8");
    expect(src).toContain("if (!reader.wants(shown)) return;");
    expect(src).toContain("new TopicTitleReader(readTopics ?? (() => fetchCommunities(baseUrl, entity)))");
    expect(src).toContain("return useMemo(() => (shown ? withTopicTitles(shown, held) : shown), [shown, held]);");
  });
});

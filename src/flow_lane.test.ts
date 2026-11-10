import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMentionSent } from "@abstractframework/panel-chat";

import { emptyAnswerLine, flowMentionSlugs, flowTurnBody, foldFlowAnswer, foldGoodbyeWords, pollRunToTerminal, queueCardLine, screenDiaryFences, type RunSummaryShape } from "./flow_lane";
import { STOPPED_USE_RESUME, openVisit, refusalCode, stoppedSentence, summonEntity } from "./stream_source";

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
    expect(out).toEqual({ kind: "terminal", status: "completed", output: { answer: "hi" }, error: null, author: null });
  });

  it("carries who answered: the summary's turn author (entity mentions 2026-11-08); an unknown kind is nobody", async () => {
    const author = { kind: "entity", name: "Nerin", entity_id: "ent-nerin", identity_ref: "entity:nerin#2", avatar: { style: "watch-halo", color: "#2a9d8f" } };
    const h = harness([{ status: "completed", output: { answer: "hi" }, error: null, author }]);
    const out = await pollRunToTerminal(h.fetchSummary, { deadlineMs: 60_000, ...h });
    expect(out.kind === "terminal" ? out.author : "not terminal").toEqual(author);
    const odd = harness([{ status: "completed", output: { answer: "hi" }, author: { kind: "robot", name: "x" } }]);
    const out2 = await pollRunToTerminal(odd.fetchSummary, { deadlineMs: 60_000, ...odd });
    expect(out2.kind === "terminal" ? out2.author : "not terminal").toBeNull();
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
    expect(out).toEqual({ kind: "terminal", status: "failed", output: undefined, error: "boom", author: null });
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

describe("the flow turn's @ mentions ride the summon (AbstractGateway 20e77103, the /runs/start semantics)", () => {
  const chips: ChatMentionSent[] = [
    { id: "nerin", name: "Nerin", kind: "entity", index: 1 },
    { id: "veya", name: "Veya", kind: "entity", index: 0 },
    { id: "nerin", name: "Nerin", kind: "entity", index: 2 },
  ];
  const base = { sessionId: "drawer-flow-s1", conversation: false };
  afterEach(() => vi.unstubAllGlobals());

  it("the chips as slugs in pick order, each once (never read from the text)", () => {
    expect(flowMentionSlugs(chips)).toEqual(["veya", "nerin"]);
    expect(flowMentionSlugs([])).toEqual([]);
  });

  it("the body carries them in that order; no chips, no key", () => {
    expect(flowTurnBody("hello @Veya and @Nerin", { ...base, mentions: flowMentionSlugs(chips) }).mentions).toEqual(["veya", "nerin"]);
    for (const none of [undefined, []]) expect("mentions" in flowTurnBody("hello", { ...base, mentions: none })).toBe(false);
    // The rest of the body is today's.
    expect(flowTurnBody("hello", base)).toEqual({ prompt: "hello", flow_id: "entity-chat", bundle_id: "entity-life", session_id: "drawer-flow-s1", input_data: { use_session_history: true } });
  });

  it("on the wire: POST /entities/{name}/summon carries mentions in order, and none without chips", async () => {
    vi.stubGlobal("window", globalThis);
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ run_id: "run-1" }), { status: 200 });
    }));
    await summonEntity("http://gw.test/", "castor", flowTurnBody("hi both", { ...base, mentions: flowMentionSlugs(chips) }), "tok");
    await summonEntity("http://gw.test/", "castor", flowTurnBody("hi", { ...base, mentions: flowMentionSlugs([]) }), "tok");
    expect(bodies[0].mentions).toEqual(["veya", "nerin"]);
    expect("mentions" in bodies[1]).toBe(false);
  });

  it("the hook and the drawer send them: the drawer's chips go to sendFlow, sendFlow into the body", () => {
    const hook = readFileSync(new URL("./use_flow_conversation.ts", import.meta.url), "utf8");
    const drawer = readFileSync(new URL("./chat_drawer.tsx", import.meta.url), "utf8");
    expect(hook).toContain("flowTurnBody(text, { sessionId, conversation: Boolean(conversationRef.current), queue: opts.queue, park: opts.park, mentions: opts.mentions })");
    expect(hook).toContain("return renderFlowOutcomeRef.current(outcome, r.run_id, entitiesAnswer);");
    expect(drawer).toContain("void sendFlow(flowText, { mentions: flowMentionSlugs(mentionsSent) })");
  });

  it("his silence to a message addressed to others: no bubble, no line, and the mentions follow; a degraded moment still says why", () => {
    const silent = foldFlowAnswer({ answer: "" });
    expect(emptyAnswerLine(silent, true)).toBeNull();
    expect(emptyAnswerLine(silent, false)).toEqual({ content: "The turn completed but served no readable answer — he said nothing this moment.", level: "info" });
    expect(emptyAnswerLine(foldFlowAnswer({ degraded: true, moment_error: "the recall failed" }), true)).toEqual({ content: "The moment could not be lived: the recall failed", level: "warn" });
    const hook = readFileSync(new URL("./use_flow_conversation.ts", import.meta.url), "utf8");
    // null = nothing pushed and the turn counts as landed (the mentions run after it).
    expect(hook).toMatch(/const line = emptyAnswerLine\(fold, entitiesAnswer\);\s*if \(!line\) return true;/);
  });
});

describe("a Stop that lands during a summon or a visit open (409 stopped_use_resume)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const refuse = async (status: number, body: unknown, call: () => Promise<unknown>) => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
    try {
      await call();
    } catch (e) {
      return e as Error & { status?: number };
    }
    throw new Error("the call did not refuse");
  };

  it("the visit door's {detail, code}: the gateway's sentence", async () => {
    const e = await refuse(409, { detail: "Stopped. Resume to visit.", code: "stopped_use_resume" }, () => openVisit("http://gw.test/", "castor", "tok"));
    expect(refusalCode(e)).toBe(STOPPED_USE_RESUME);
    expect(stoppedSentence(e)).toBe("Stopped. Resume to visit.");
  });

  it("the summon door's {detail: {reason_code, message, reasons}}: its message", async () => {
    const e = await refuse(
      409,
      { detail: { refused: true, reason_code: "stopped_use_resume", message: "Stopped. Resume him first.", reasons: ["#REFUSED summon: entity:castor is paused — the kill switch"] } },
      () => summonEntity("http://gw.test/", "castor", { prompt: "hi" }, "tok"),
    );
    expect(stoppedSentence(e)).toBe("Stopped. Resume him first.");
  });

  it("a busy seat is not a Stop: no stopped sentence", async () => {
    const e = await refuse(409, { detail: "a visit is open on castor" }, () => openVisit("http://gw.test/", "castor", "tok"));
    expect(refusalCode(e)).toBeNull();
    expect(stoppedSentence(e)).toBeNull();
    const other = await refuse(409, { detail: "in another conversation", code: "in_another_conversation" }, () => openVisit("http://gw.test/", "castor", "tok"));
    expect(stoppedSentence(other)).toBeNull();
  });

  it("the drawer: the sentence and 'Resume and visit' (the phase bar's act), never the busy seat's retry; the flow lane offers no queue", () => {
    const drawer = readFileSync(new URL("./chat_drawer.tsx", import.meta.url), "utf8");
    expect(drawer).toMatch(/const stopped = stoppedSentence\(e\);[\s\S]{0,700}if \(stopped\) \{\s*setSeatBusy\(false\);\s*setStoppedOffer\(true\);\s*setNote\(stopped\);\s*\} else if \(e\.status === 409\) \{/);
    expect(drawer).toMatch(/\{stoppedOffer \? \([\s\S]{0,300}props\.onResumeAndVisit\(\);[\s\S]{0,300}Resume and visit/);
    const hook = readFileSync(new URL("./use_flow_conversation.ts", import.meta.url), "utf8");
    expect(hook).toContain("if (e.status === 409 && !opts.queue && !stopped) setQueueOffer(text);");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarVisitHistory, completedVisitReply, flowConversationState, publicVisitHistoryOmitted, publicVisitMessages, visitAttention, visitAvatarStatus, visitQuestion } from "./avatar_visit";
import { answerVisit, decideVisit, getVisitConversation, guideVisit, openVisit, setGatewayToken } from "./stream_source";

afterEach(() => { vi.unstubAllGlobals(); setGatewayToken(null); });
const update = { id: "public-1", text: "A supported format was found.", run_id: "actor", session_id: "visit", source_call_ids: ["call-1"], iteration: 2 };

describe("avatar public entity boundary", () => {
  it("accepts only explicit public fields and retains source identity, never diary fences", () => {
    const messages = publicVisitMessages({ run_id: "visit", public_updates: [update, update, { ...update, id: "private", text: "```diary visibility=private\nSECRET" }, { ...update, id: "mixed", text: "Visible\n```diary\nSECRET\n```\nStill visible" }, { id: "raw", text: "raw output" }], public_messages: [{ id: "guidance", run_id: "actor", role: "user", kind: "guidance", text: "Keep the existing format." }, { id: "spoof", role: "assistant", kind: "thought", text: "SECRET" }] });
    expect(messages).toHaveLength(2);
    expect(JSON.stringify(messages)).not.toContain("SECRET");
    expect(messages[0].publicUpdate).toMatchObject({ runId: "actor", sessionId: "visit", sourceCallIds: ["call-1"], iteration: 2 });
    expect(messages[1]).toMatchObject({ role: "user", content: "Keep the existing format.", source: "user_guidance" });
  });
  it("screens avatar finals and excludes technical detail without changing the existing source", () => {
    const original = [{ id: "final", role: "assistant", content: "Public answer\n```diary\nSECRET\n```", reasoning: "SECRET reasoning", detail: { reply: "SECRET detail" } }, { id: "system", role: "system", content: "SECRET tool args" }];
    const rows = avatarVisitHistory(original, publicVisitMessages({ run_id: "visit", public_updates: [update] }), "visit");
    expect(rows.at(-1)?.content).toContain("Public answer");
    expect(JSON.stringify(rows)).not.toContain("SECRET");
    expect(original[0].reasoning).toContain("SECRET");
    expect(avatarVisitHistory(original, [], "visit", true)[0].kind).toBe("answer");
  });
  it("keeps essential questions and permissions separate with exact source target", () => {
    const pending = { run_id: "actor", wait_key: "q", reason: "user", prompt: "Which format?", details: { question: { id: "q-generation", purpose: "conversation", importance: "essential" } } };
    const state = { run_id: "visit", pending_question: pending };
    expect(visitQuestion(state)).toBe(pending);
    expect(visitAttention(state)).toEqual({ id: "actor:q-generation", kind: "question", importance: "essential" });
    expect(visitAttention({ run_id: "visit", pending_wait: { ...pending, reason: "tool_approval", details: { kind: "tool_approval" } } })?.kind).toBe("approval");
    expect(visitQuestion({ run_id: "visit", pending_wait: pending })).toBeNull();
    expect(visitAvatarStatus({ run_id: "visit", status: "paused" }, "idle", true)).toBe("paused");
    expect(visitAvatarStatus({ run_id: "visit", status: "running" }, "idle", true)).toBe("working");
    expect(visitAvatarStatus({ run_id: "visit", status: "waiting", ready_for_input: false }, "idle", true)).toBe("working");
  });
  it("restores a completed reply from served visit state after the original request disappears", () => {
    const state = { run_id: "visit", turn_complete: true, turn_n: 2, reply: "Public restored final\n```diary\nSECRET\n```" };
    const messages = completedVisitReply(state, []);
    expect(messages[0]).toMatchObject({ id: "visit:final:2", role: "assistant", kind: "final" });
    expect(JSON.stringify(messages)).not.toContain("SECRET");
    expect(completedVisitReply(state, messages)).toBe(messages);
    expect(completedVisitReply({ ...state, turn_complete: false }, [])).toEqual([]);
  });
  it("reads only public messages from the existing Flow view, never activities or private envelopes", () => {
    const state = flowConversationState({ root_run_id: "flow", session_id: "session", status: "running", messages: [{ ...update, role: "assistant", kind: "public_update" }, { id: "private", role: "assistant", kind: "thought", text: "SECRET" }], activities: [{ output: "SECRET" }], interaction: { kind: "ask_user", run_id: "child", wait_key: "q", prompt: "Which?", details: { question: { importance: "essential" } } } } as never);
    expect(publicVisitMessages(state!)[0].content).toBe(update.text);
    expect(JSON.stringify(state)).not.toContain("SECRET");
    expect(state!.pending_question).toMatchObject({ run_id: "child", wait_key: "q" });
  });
  it("restores ordered questions, real answers, expiry and retained replies with exact original identities", async () => {
    const at = (n: number) => [`2026-11-01T10:00:0${n}Z`, "actor", n];
    const questions = [
      { id: "actor:q1", text: "Which separator?", role: "assistant", kind: "question", run_id: "actor", source: "wait", wait_key: "ask:1", question: { id: "q-first", importance: "essential" }, step_ids: ["ask-first"], seqs: [2], order: at(2) },
      { id: "actor:answer1", text: "Use commas", role: "user", kind: "answer", run_id: "actor", source: "resume", wait_key: "ask:1", question_id: "q-first", order: at(3) },
      { id: "actor:q2", text: "Should I keep the header?", role: "assistant", kind: "question", run_id: "actor", source: "wait", wait_key: "ask:2", question: { id: "q-second", importance: "clarification" }, order: at(5) },
      { id: "actor:expired", text: "No answer arrived. Continuing with the declared fallback.", role: "system", kind: "question_outcome", run_id: "actor", source: "emit_event", question: { id: "q-second", outcome: "expired", fallback: "Keep the header" }, order: at(6) },
      { id: "actor:late", text: "Actually remove it", role: "user", kind: "retained_reply", run_id: "actor", source: "emit_event", question_id: "q-second", reply_status: "retained", reason: "question_expired", order: at(7) },
      { id: "fake-answer", text: "Keep the header", role: "user", kind: "answer", run_id: "actor", source: "emit_event", wait_key: "ask:2" },
      { id: "private-question", text: "Public prompt", role: "assistant", kind: "question", run_id: "actor", source: "wait", wait_key: "ask:3", question: { id: "private", fallback: "<think>SECRET</think>" } },
    ];
    const served = { run_id: "visit", public_updates: [{ ...update, order: at(4) }], public_messages: [{ id: "guidance", role: "user", kind: "guidance", text: "Keep CSV", run_id: "actor", order: at(1) }], public_questions: [...questions].reverse() };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(served), { status: 200 })));
    const reopened = publicVisitMessages(await getVisitConversation("", "castor", "visit"));
    expect(reopened.map((m) => m.kind)).toEqual(["guidance", "question", "answer", "public_update", "question", "question_outcome", "retained_reply"]);
    expect(reopened[1].questionContext).toMatchObject({ wait_key: "ask:1", question: { id: "q-first" }, step_ids: ["ask-first"], seqs: [2] });
    expect(reopened[2].questionContext?.question_id).toBe("q-first");
    expect(reopened.at(-1)?.questionContext).toMatchObject({ question_id: "q-second", reply_status: "retained", reason: "question_expired" });
    expect(reopened.find((m) => m.kind === "question_outcome")?.role).toBe("system");
    expect(reopened.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["Keep CSV", "Use commas", "Actually remove it"]);
    expect(JSON.stringify(reopened)).not.toContain("SECRET");
    const local = [{ id: "local", role: "user", kind: "answer", source: "local_question_answer", content: "Use commas", runId: "actor", questionContext: { wait_key: "ask:1", question_id: "q-first" } }];
    expect(avatarVisitHistory(local, [], "visit", true)).toEqual([]);
    expect(avatarVisitHistory(local, reopened, "visit", true).filter((m) => m.content === "Use commas")).toHaveLength(1);
    const flow = flowConversationState({ root_run_id: "flow", session_id: "session", status: "running", messages: [...questions], activities: [], interaction: null } as never);
    expect(publicVisitMessages(flow!).map((m) => m.kind)).toEqual(["question", "answer", "question", "question_outcome", "retained_reply"]);
  });
  it("discloses each server-side bound without claiming missing exchanges were loaded", () => {
    for (const field of ["public_updates_omitted", "public_messages_omitted", "public_questions_omitted", "conversation_runs_omitted"]) {
      expect(publicVisitHistoryOmitted({ run_id: "visit", [field]: 1 })).toBe(true);
    }
    expect(publicVisitHistoryOmitted({ run_id: "visit", public_updates_omitted: 0, public_messages_omitted: 0, public_questions_omitted: 0, conversation_runs_omitted: 0 })).toBe(false);
    expect(publicVisitHistoryOmitted(null)).toBe(false);
  });
});

describe("owned entity conversation routes", () => {
  it("keeps default opens unchanged; opts in only explicitly and binds answer/decision to the shown wait", async () => {
    const requests: Array<{ url: string; body: unknown; headers: unknown }> = [];
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn(async (url, options) => { requests.push({ url: String(url), body: JSON.parse(options.body), headers: options.headers }); return new Response(JSON.stringify({ accepted: true, run_id: "visit" }), { status: 200 }); }));
    setGatewayToken("owner-token");
    await openVisit("", "castor", null);
    await openVisit("", "castor", null, undefined, true);
    await guideVisit("", "castor", "visit", "quoted context + correction", "correction", null);
    const target = { run_id: "exact-child", wait_key: "exact-generation" };
    await answerVisit("", "castor", "visit", target, "choice-a", null);
    await decideVisit("", "castor", "visit", target, false, null);
    expect(requests.map((r) => r.url)).toEqual(["api/gateway/entities/castor/visit/open", "api/gateway/entities/castor/visit/open", "api/gateway/entities/castor/visit/visit/guidance", "api/gateway/entities/castor/visit/visit/answer", "api/gateway/entities/castor/visit/visit/decision"]);
    expect(requests[0].body).toEqual({});
    expect(requests[1].body).toEqual({ conversation: true });
    expect(requests[2].body).toEqual({ text: "quoted context + correction", display_text: "correction" });
    expect(requests[3].body).toEqual({ wait_key: "exact-generation", response: "choice-a", target_run_id: "exact-child" });
    expect(requests[4].body).toEqual({ wait_key: "exact-generation", approved: false });
    expect(requests.some((r) => r.url.includes("commands"))).toBe(false);
    expect(requests[2].headers).toMatchObject({ Authorization: "Bearer owner-token" });
  });
  it("reports the server refusal instead of falling through to a generic steer", async () => {
    vi.stubGlobal("window", globalThis);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ detail: { code: "busy", message: "No active actor" } }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(guideVisit("", "castor", "visit", "correction", "correction", null)).rejects.toThrow(/No active actor/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

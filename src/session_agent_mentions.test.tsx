/**
 * The session agent and entity mentions (operator 2026-11-10, flow lane only): a message that
 * carries entity mentions does not reach the session agent (the gateway skips his run unless
 * `mentions` holds the reserved slug "agent"); the `@` list offers the agent himself as a chip
 * (kind "agent", his display name, sent as "agent" in pick order); with entity chips only, one
 * line says he stays out of this message. A skipped turn is read from the gateway's markers, never
 * from a missing run: the summon's `agent: "not_addressed"` (live) and the turn row's
 * `agent_addressed: false` (a followed run): no wait, no bubble, no "served no readable answer".
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMention, ChatMentionSent } from "@abstractframework/panel-chat";

import { flowMentionSlugs, flowTurnBody, mentionsAddressEntities, pollRunToTerminal, summonSkippedAgent, turnAgentAddressed, type RunSummaryShape } from "./flow_lane";
import { useFlowConversation, type FlowConversationApi } from "./use_flow_conversation";
import { ChatComposer } from "./vendor/abstractchat/conversation";
import {
  AGENT_MENTION_SLUG,
  agentMentionCandidate,
  agentStaysOutLine,
  entityMentions,
  heldAfterRun,
  mentionCandidatesFor,
  mentionNotice,
  mentionResendPlan,
  runMentions,
  visitMentionProps,
  withSessionAgent,
  type HeldMentions,
} from "./visit_mentions";
import type { MentionWire } from "./stream_source";

const entity = (id: string, name: string, index: number): ChatMentionSent => ({ id, name, kind: "entity", index });
const agent = (index: number, name = "Castor"): ChatMentionSent => ({ id: AGENT_MENTION_SLUG, name, kind: "agent", index });
const chip = (kind: "entity" | "agent", id: string, name: string): ChatMention => ({ id, name, kind });
const ROWS = [{ name: "Leo", slug: "leo" }, { name: "Castor", slug: "castor" }, { name: "Mia", slug: "mia" }];

describe("the @ list of the flow lane offers the session agent", () => {
  it("his chip: his display name (else Agent), kind agent, the reserved slug", () => {
    expect(agentMentionCandidate("Castor")).toEqual({ id: "agent", name: "Castor", kind: "agent" });
    expect(agentMentionCandidate("  ")).toEqual({ id: "agent", name: "Agent", kind: "agent" });
    expect(agentMentionCandidate(null)).toEqual({ id: "agent", name: "Agent", kind: "agent" });
  });

  it("first, beside the entities (the visited one stays out of the entity list)", () => {
    const entities = mentionCandidatesFor(ROWS, "castor", "");
    expect(withSessionAgent(entities, "Castor", "").map((c) => `${c.kind}:${c.id}:${c.name}`)).toEqual(["agent:agent:Castor", "entity:leo:Leo", "entity:mia:Mia"]);
  });

  it("the query keeps him when his name or the reserved slug starts it (any case)", () => {
    expect(withSessionAgent([], "Castor", "CAS").map((c) => c.id)).toEqual(["agent"]);
    expect(withSessionAgent([], "Castor", "ag").map((c) => c.id)).toEqual(["agent"]);
    const leo = mentionCandidatesFor(ROWS, "castor", "le");
    expect(withSessionAgent(leo, "Castor", "le").map((c) => c.id)).toEqual(["leo"]);
  });

  it("his chip gets no 'will read this conversation's history' notice (he is already in it)", () => {
    expect(mentionNotice({ name: "Castor", kind: "agent" })).toBeNull();
    expect(mentionNotice({ name: "Leo", kind: "entity" })).toBe("Leo will read this conversation's history");
  });

  it("the drawer: the flow lane adds him, the visit lane (no session agent) does not", () => {
    const src = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
    expect(src).toContain('return brain === "flow" ? withSessionAgent(entities, entityName, query) : entities;');
  });
});

describe("chips to the summon's mentions: slugs in pick order, the agent as \"agent\"", () => {
  it("in pick order, each once, the agent's chip as the reserved slug whatever its label", () => {
    expect(flowMentionSlugs([entity("mia", "Mia", 2), agent(1), entity("leo", "Leo", 0)])).toEqual(["leo", "agent", "mia"]);
    expect(flowMentionSlugs([agent(0, "Agent"), entity("leo", "Leo", 1), agent(2)])).toEqual(["agent", "leo"]);
    expect(flowMentionSlugs([{ id: "castor", name: "Castor", kind: "agent", index: 0 }])).toEqual(["agent"]);
    expect(flowMentionSlugs([entity("leo", "Leo", 0)])).toEqual(["leo"]);
  });

  it("the summon body carries them as picked", () => {
    const body = flowTurnBody("hi", { sessionId: "s-1", conversation: false, mentions: flowMentionSlugs([agent(1), entity("leo", "Leo", 0)]) });
    expect(body.mentions).toEqual(["leo", "agent"]);
  });

  it("the entities answer when a slug names one; the agent's own slug alone is not one", () => {
    expect(mentionsAddressEntities(["leo"])).toBe(true);
    expect(mentionsAddressEntities(["agent", "leo"])).toBe(true);
    expect(mentionsAddressEntities(["agent"])).toBe(false);
    expect(mentionsAddressEntities([])).toBe(false);
    expect(mentionsAddressEntities(undefined)).toBe(false);
  });
});

describe("the mentions door asks entities only (the agent's chip rode the summon)", () => {
  it("runMentions never posts the agent's chip", async () => {
    const posted: string[] = [];
    const ok: MentionWire = { status: 200, body: { reply: "hello", mention_index: 0 }, code: null };
    const out = await runMentions([agent(0), entity("leo", "Leo", 1)], { post: async (m) => (posted.push(m.id), ok), onReply: () => undefined });
    expect(posted).toEqual(["leo"]);
    expect(out.answered).toEqual([entity("leo", "Leo", 1)]);
    expect(entityMentions([agent(0), entity("leo", "Leo", 1)])).toEqual([entity("leo", "Leo", 1)]);
  });

  it("a resend asks the held entities; the agent's chip alone makes a new message", () => {
    const held = heldAfterRun("s-1", "turn-1", "hi", "turn-1", { answered: [], unsent: [entity("leo", "Leo", 1)] }) as HeldMentions;
    expect(mentionResendPlan(held, "s-1", "hi", [agent(0), entity("leo", "Leo", 1)])).toEqual({ ask: [entity("leo", "Leo", 1)], alreadyAnswered: [] });
    expect(mentionResendPlan(held, "s-1", "hi", [agent(0)])).toBeNull();
  });

  it("the drawer runs no mention call when his chip is the only one", () => {
    const src = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
    const landed = src.indexOf("if (!landed || !sessionId) { chipsBack(); return; }");
    const only = src.indexOf("if (!entityMentions(mentionsSent).length) return;", landed);
    const run = src.indexOf("return sendMentions(sessionId, mentionMessageKey(turnRunId), flowText, mentionsSent, sentChips, turnRunId)", landed);
    expect(landed).toBeGreaterThan(0);
    expect(only).toBeGreaterThan(landed);
    expect(run).toBeGreaterThan(only);
  });
});

describe("the hint: he stays out of a message for entities only", () => {
  it("shown only when the chips name entities and not him", () => {
    expect(agentStaysOutLine([chip("entity", "leo", "Leo")], "Castor")).toBe("Castor stays out of this message.");
    expect(agentStaysOutLine([chip("entity", "leo", "Leo"), chip("entity", "mia", "Mia")], "")).toBe("The agent stays out of this message.");
    expect(agentStaysOutLine([chip("entity", "leo", "Leo"), chip("agent", "agent", "Castor")], "Castor")).toBeNull();
    expect(agentStaysOutLine([chip("agent", "agent", "Castor")], "Castor")).toBeNull();
    expect(agentStaysOutLine([], "Castor")).toBeNull();
  });

  const props = (over: Partial<Parameters<typeof visitMentionProps>[0]>) =>
    visitMentionProps({ sessionKey: "flow:s-1", candidates: async () => [], chips: [], onChipsChange: () => undefined, unavailable: null, status: null, ...over });
  const composer = (extra: object) => renderToStaticMarkup(<ChatComposer value="hello" onChange={() => undefined} onSend={() => undefined} {...extra} />);

  it("one line in the composer's status slot, after the last send's sentence", () => {
    const chips = [chip("entity", "leo", "Leo")];
    const html = composer(props({ chips, agentOut: agentStaysOutLine(chips, "Castor") }));
    expect(html.match(/pc-mention-notice--status/g)?.length).toBe(1);
    expect(html).toContain("<span>Castor stays out of this message.</span>");
    expect(props({ status: "Mia is in another conversation.", agentOut: "Castor stays out of this message." }).mentionStatus).toBe("Mia is in another conversation. Castor stays out of this message.");
    expect(props({ agentOut: null }).mentionStatus).toBeNull();
  });

  it("with his chip, or without chips, no hint", () => {
    const withAgent = [chip("entity", "leo", "Leo"), chip("agent", "agent", "Castor")];
    const html = composer(props({ chips: withAgent, agentOut: agentStaysOutLine(withAgent, "Castor") }));
    expect(html).toContain("@Castor");
    expect(html).not.toContain("stays out of this message");
    expect(composer(props({ agentOut: agentStaysOutLine([], "Castor") }))).not.toContain("pc-mention-notice--status");
  });

  it("the drawer gives it in the flow lane only", () => {
    const src = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
    expect(src).toContain('agentOut: brain === "flow" ? agentStaysOutLine(mentionChips, entityName) : null');
  });
});

describe("the gateway's markers (pinned): read them, never the absence of a run", () => {
  it("the summon's agent: \"not_addressed\" means skipped; \"started\" or no key means a run", () => {
    expect(summonSkippedAgent({ agent: "not_addressed", run_id: "turn-1" })).toBe(true);
    expect(summonSkippedAgent({ agent: "not_addressed" })).toBe(true);
    expect(summonSkippedAgent({ agent: "started", run_id: "run-1" })).toBe(false);
    expect(summonSkippedAgent({ run_id: "run-1" })).toBe(false);
    expect(summonSkippedAgent(null)).toBe(false);
  });

  it("the turn row's agent_addressed: false means not addressed; true or absent means addressed", () => {
    expect(turnAgentAddressed({ agent_addressed: false })).toBe(false);
    expect(turnAgentAddressed({ agent_addressed: true })).toBe(true);
    expect(turnAgentAddressed({})).toBe(true);
    expect(turnAgentAddressed(null)).toBe(true);
  });

  it("a followed run's terminal row carries it (agentAddressed: false), and only then", async () => {
    let t = 0;
    const follow = (row: RunSummaryShape) => pollRunToTerminal(async () => row, { deadlineMs: 60_000, aborted: () => false, now: () => t, sleep: async (ms) => { t += ms; } });
    expect(await follow({ status: "completed", output: null, agent_addressed: false })).toMatchObject({ kind: "terminal", status: "completed", agentAddressed: false });
    for (const row of [{ status: "completed", output: { answer: "hi" } }, { status: "completed", output: { answer: "hi" }, agent_addressed: true }]) {
      const out = await follow(row);
      expect(out.kind).toBe("terminal");
      expect("agentAddressed" in out).toBe(false);
    }
  });
});

describe("the flow lane renders a skipped turn: no wait, no bubble, no line", () => {
  afterEach(() => vi.unstubAllGlobals());

  type Call = { url: string; method: string; body: unknown };
  /** The hook as the drawer holds it (rendered once; its callbacks run outside the render). */
  function lane(answers: (url: string) => Response) {
    const calls: Call[] = [];
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), method: String(init.method || "GET"), body: init.body ? JSON.parse(String(init.body)) : null });
      return answers(String(url));
    }));
    const push = vi.fn();
    const busy: string[] = [];
    let api: FlowConversationApi | null = null;
    const Probe = () => {
      api = useFlowConversation({
        baseUrl: "http://gw.test/", entity: "castor", entityName: "Castor", token: "tok", push,
        setBusy: (b) => busy.push(b), setDraft: () => undefined,
        envelopesRef: { current: [] }, turnStartSeqRef: { current: 0 },
      });
      return null;
    };
    renderToStaticMarkup(<Probe />);
    return { api: api! as FlowConversationApi, calls, push, busy };
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const VIEW = { version: "replay_view_v1", root_run_id: "run-1", status: "completed", cursor: { token: "run-1:1", records: 1, runs: {} }, runs: [], interaction: null, messages: [], activities: [], artifacts: [] };

  it("live: agent \"not_addressed\" = the summon only, it landed, the recorded turn is the mentions' repeat_of", async () => {
    const { api, calls, push, busy } = lane(() => json({ agent: "not_addressed", run_id: "turn-1", session_id: "s-1" }));
    const settled = await api.sendFlow("hi Leo", { mentions: ["leo"] });
    expect(settled).toMatchObject({ landed: true, runId: "turn-1" });
    expect(settled.sessionId).toBeTruthy();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST http://gw.test/api/gateway/entities/castor/summon"]);
    expect((calls[0].body as { mentions?: unknown }).mentions).toEqual(["leo"]);
    expect(push).not.toHaveBeenCalled();
    expect(busy).toEqual(["turn", "idle"]);
  });

  it("live: a not_addressed answer without a run id still lands (no repeat_of to name)", async () => {
    const { api, calls, push } = lane(() => json({ agent: "not_addressed", session_id: "s-1" }));
    expect(await api.sendFlow("hi Leo", { mentions: ["leo"] })).toMatchObject({ landed: true, runId: null });
    expect(calls).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  });

  const followed = (row: Record<string, unknown>) => (url: string) => {
    if (url.endsWith("/summon")) return json({ run_id: "run-1", session_id: "s-1" });
    if (url.endsWith("/runs/run-1/view")) return json(VIEW);
    if (url.endsWith("/runs/run-1")) return json(row);
    return json({ detail: "Not Found" }, 404);
  };

  it("a followed run whose row says agent_addressed: false renders nothing, as live", async () => {
    const { api, calls, push } = lane(followed({ status: "completed", output: null, agent_addressed: false }));
    expect(await api.sendFlow("hello", {})).toMatchObject({ landed: true, runId: "run-1" });
    expect(calls.some((c) => c.url.endsWith("/runs/run-1"))).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("control: the same empty row without the marker says the turn served no answer", async () => {
    const { api, push } = lane(followed({ status: "completed", output: null }));
    expect(await api.sendFlow("hello", {})).toMatchObject({ landed: false });
    expect(push).toHaveBeenCalledWith({ role: "system", content: "The turn completed but served no readable answer — he said nothing this moment.", level: "info" });
  });

  it("@agent alone addresses him: his silence is the usual line (no entity answers instead)", async () => {
    const { api, push } = lane((url) => (url.endsWith("/summon") ? json({ agent: "started", run_id: "run-1", session_id: "s-1" }) : followed({ status: "completed", output: null })(url)));
    expect(await api.sendFlow("hello", { mentions: ["agent"] })).toMatchObject({ landed: false });
    expect(push).toHaveBeenCalledWith({ role: "system", content: "The turn completed but served no readable answer — he said nothing this moment.", level: "info" });
  });

  it("control: agent \"started\" is followed and his answer is his bubble", async () => {
    const { api, push } = lane((url) => (url.endsWith("/summon") ? json({ agent: "started", run_id: "run-1", session_id: "s-1" }) : followed({ status: "completed", output: { answer: "Hello." } })(url)));
    expect(await api.sendFlow("hello", { mentions: ["agent", "leo"] })).toMatchObject({ landed: true, runId: "run-1" });
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ role: "assistant", content: "Hello.", title: "Castor" }));
  });
});

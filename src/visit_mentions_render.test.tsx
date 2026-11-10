/**
 * "Who answered" on the left bubble and the composer's mention sentences, rendered with
 * react-dom/server (the package ships no DOM for tests); the drawer wiring is pinned on its
 * source (the visit chat is one large component with live transports).
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatMessageList, type DrawerMessage } from "./chat_message_list";
import { ChatComposer } from "./vendor/abstractchat/conversation";
import { MENTIONS_UNAVAILABLE, visitMentionProps } from "./visit_mentions";

const AUTHOR = { kind: "entity" as const, name: "Castor", entity_id: "ent-castor", identity_ref: "entity:castor#3", avatar: { style: null, color: "#2a9d8f" } };
const list = (messages: DrawerMessage[]) => renderToStaticMarkup(<ChatMessageList messages={messages} onDetail={() => undefined} />);
const header = (html: string) => html.match(/<div class="pc-chat-header">[\s\S]*?<\/div><\/div>/)?.[0] ?? html;

describe("the left bubble says who answered", () => {
  it("a reply with an author: its mark, its name and the entity tag", () => {
    const html = list([{ id: "m1", role: "assistant", content: "Hello from Castor.", title: "Castor", author: AUTHOR }]);
    expect(html).toContain('data-author="entity"');
    expect(html).toContain('class="pc-chat-role">Castor</span>');
    expect(html).toMatch(/pc-chat-author-kind[^>]*><span class="af-chip__label">entity<\/span>/);
    expect(html).toContain("pc-author-mark--entity");
    // A colour without a design: the initial disc in that colour.
    expect(html).toContain("--af-entity-color:#2a9d8f");
  });

  it("the author's name wins over the host's title (a mention's reply is not the visited entity)", () => {
    const html = list([{ id: "m1", role: "assistant", content: "Hi.", title: "Nerin", author: AUTHOR }]);
    expect(html).toContain('class="pc-chat-role">Castor</span>');
    expect(html).not.toContain(">Nerin<");
  });

  it("no author (an older gateway): exactly today's card", () => {
    const today = list([{ id: "m1", role: "assistant", content: "Hello.", title: "Nerin" }]);
    expect(list([{ id: "m1", role: "assistant", content: "Hello.", title: "Nerin", author: null }])).toBe(today);
    expect(today).not.toContain("data-author");
    expect(header(today)).toContain('class="pc-chat-role">Nerin</span>');
  });

  it("the person's own turn ignores an author", () => {
    const html = list([{ id: "u1", role: "user", content: "hi", author: AUTHOR }]);
    expect(html).not.toContain("data-author");
    expect(html).not.toContain("pc-chat-author-kind");
  });
});

describe("the composer's mention sentences", () => {
  const props = (over: Partial<Parameters<typeof visitMentionProps>[0]> = {}) =>
    visitMentionProps({ sessionKey: "visit:s-1", candidates: async () => [], chips: [], onChipsChange: () => undefined, unavailable: null, status: null, ...over });
  const composer = (extra: object) => renderToStaticMarkup(<ChatComposer value="hello" onChange={() => undefined} onSend={() => undefined} {...extra} />);

  it("an older gateway: the one sentence under the chips, never a silent fallback", () => {
    // The kit draws a chip inline, where its "@Name" sits in the text (panel-chat 0.9.12).
    const html = composer({ ...props({ chips: [{ id: "castor", name: "Castor", kind: "entity", start: 6 }], unavailable: MENTIONS_UNAVAILABLE }), value: "hello @Castor" });
    expect(html).toContain("@Castor");
    expect(html).toContain("pc-mention-chip--inline");
    expect(html).toContain(`<span>${MENTIONS_UNAVAILABLE}</span>`);
    expect(html).toContain("pc-mention-notice--unavailable");
  });

  it("the outcome of the last send above the field", () => {
    const html = composer(props({ status: "Castor is in another conversation." }));
    expect(html).toContain("pc-mention-notice--status");
    expect(html).toContain("Castor is in another conversation.");
  });

  it("without a session the composer has no mention parts at all", () => {
    const html = composer(visitMentionProps({ sessionKey: null, candidates: async () => [], chips: [{ id: "castor", name: "Castor", kind: "entity" }], onChipsChange: () => undefined, unavailable: MENTIONS_UNAVAILABLE, status: "x" }));
    expect(html).not.toContain("pc-mention");
    expect(html).not.toContain("aria-autocomplete");
    expect(html).toBe(composer({}));
  });
});

describe("the visit chat's wiring (source pins)", () => {
  const src = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");

  it("the composer sends with its picked mentions and takes the mention props", () => {
    expect(src).toContain("onSend={(s) => send(s.mentions)}");
    expect(src).toContain('{...visitMentionProps({ sessionKey: mentionSessionKey, candidates: mentionCandidates, chips: mentionChips, onChipsChange: setMentionChips, unavailable: mentionsUnavailable, status: mentionStatus, agentOut: brain === "flow" ? agentStaysOutLine(mentionChips, entityName) : null })}');
    expect(src).not.toContain("onSubmit={send}");
  });

  it("the mentions run after the person's turn landed, in both lanes, never invented sessions", () => {
    const visitTurn = src.indexOf("sendVisitTurn(baseUrl, entity, runId, text, token, speaker, attachments)");
    // The visit turn lives in the entity's home, not in the session: no repeat_of there.
    // Its mention ids name an id minted for this message (mentionMessageKey(null)).
    const visitMentions = src.indexOf("if (mentionsSent.length && sessionForMentions) return sendMentions(sessionForMentions, mentionMessageKey(null), words, mentionsSent, sentChips, null);");
    expect(visitTurn).toBeGreaterThan(0);
    expect(visitMentions).toBeGreaterThan(visitTurn);
    // The flow summon carries the chips as `mentions` (he answers only what is addressed to him).
    expect(src).toContain("void sendFlow(flowText, { mentions: flowMentionSlugs(mentionsSent) }).then(({ landed, sessionId, runId: turnRunId }) => {");
    // The flow lane's summoned run is the person's turn of the session: the mentions' repeat_of.
    expect(src).toContain("return sendMentions(sessionId, mentionMessageKey(turnRunId), flowText, mentionsSent, sentChips, turnRunId).finally(() => setBusy(\"idle\"));");
    // The visit's session is the door's (open answer / visit status), never minted here.
    expect(src).toContain('setVisitSession(typeof r.session_id === "string" && r.session_id ? { runId: r.run_id, sessionId: r.session_id } : null);');
    expect(src).toMatch(/const mentionSession = brain === "driver" \? \(runId && visitSession\?\.runId === runId \? visitSession\.sessionId : null\)/);
  });

  it("the @ list excludes the visited entity and mentions post the words as typed with their index", () => {
    expect(src).toContain("mentionCandidatesFor(await mentionRowsRef.current, entity, query, mentionRefusedRef.current)");
    // Each body carries its mention_id (mentionBody), from the message's key.
    expect(src).toContain("postMention(baseUrl, sessionId, mentionBody(text, m, repeatOf, message), token)");
    // A mirrored reply gets one small line, never the mirrored turn's own answer.
    expect(src).toContain("const line = mirrorLine(mirrors, nameOf);");
    expect(src).toContain('if (line) push({ role: "system", content: line });');
    // The flow lane resolves the summoned run as the person's turn.
    const hook = fs.readFileSync(path.join(__dirname, "use_flow_conversation.ts"), "utf8");
    expect(hook).toContain("turnRunId = r.run_id;");
    expect(hook).toContain(".then((landed): FlowTurnSettled => ({ landed, sessionId, runId: turnRunId }));");
    // No probe: a 404's code decides (entity_not_found vs a missing route).
    expect(src).not.toContain("probeMentionRoute");
  });

  it("the meet offer comes from a picked chip, never from the typed words (no-heuristics ruling)", () => {
    expect(src).toContain("const meetable = onConveneWith ? meetOffers(mentionChips) : [];");
    expect(src).toContain("onClick={() => onConveneWith(m.slug)}");
    expect(src).not.toContain("resolveMentions");
    expect(src).not.toContain("entity_handle");
    expect(src).not.toMatch(/\b(roster|localAddresses)\b/);
    const host = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");
    expect(host).not.toMatch(/localAddresses|rosterList/);
    expect(host).toContain("setMeetPreset({ a: entityName, b: otherSlug });");
  });

  /** The body of `send`'s resend branch (from its test to its own return). */
  const resendBranch = () => {
    const start = src.indexOf("if (held && resend) {");
    const end = src.indexOf("\n      return;\n    }\n", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  it("a resend asks only the held mentions: before any person's turn, with the held words, repeat_of and answers", () => {
    const sendAt = src.indexOf("const send = useCallback((picked: ChatMentionSent[] = []) => {");
    const plan = src.indexOf("const resend = mentionResendPlan(held, mentionSession, words, mentionsSent);", sendAt);
    expect(sendAt).toBeGreaterThan(0);
    expect(plan).toBeGreaterThan(sendAt);
    // Decided before the flow summon, the visit turn and the person's bubble of a new message.
    expect(src.indexOf("void sendFlow(flowText, ", sendAt)).toBeGreaterThan(plan);
    expect(src.indexOf("sendVisitTurn(baseUrl, entity, runId, text, token, speaker, attachments)", sendAt)).toBeGreaterThan(plan);
    expect(src.indexOf('push({ role: "user"', sendAt)).toBeGreaterThan(plan);
    // The held message is consumed by any send (a different one is a new message), words sent into
    // the work in progress included; a refused or empty send keeps it.
    expect(src.slice(sendAt, plan + 20)).toContain("heldMentionsRef.current = null;\n    const resend");
    expect(src.slice(sendAt, plan)).toContain("heldMentionsRef.current = null; void sendDuringWork(); return;");
    const branch = resendBranch();
    // The held key: every resent mention names the mention_id it was first sent with.
    expect(branch).toContain("sendMentions(held.sessionId, held.message, held.resend.text, resend.ask, askedChips, held.resend.repeatOf, held.answered, answeredLine ? [answeredLine] : [])");
    for (const never of ["sendVisitTurn", "sendFlow", "push(", "guideVisit", "flowConversationCommand"]) expect(branch).not.toContain(never);
    // Nothing left to ask (only entities that answered): said, nothing sent, the message still held.
    expect(branch).toContain("heldMentionsRef.current = held;");
  });

  it("each send's mentions are held after a stop, each entity once; a new conversation lets them go", () => {
    expect(src).toContain("const mentionsSent = orderedMentions(picked);");
    expect(src).toContain("heldMentionsRef.current = heldAfterRun(sessionId, message, text, repeatOf, result, answeredBefore);");
    const effect = src.indexOf("heldMentionsRef.current = null;\n  }, [mentionSessionKey]);");
    expect(effect).toBeGreaterThan(0);
  });

  it("the flow lane's key is kept for the whole conversation (the first-use notice shows once)", () => {
    expect(src).toContain("flowMentionKeyRef.current = flowMentionKey(flowMentionKeyRef.current, flowActive, flowSessionId, () => `new:${++flowMentionKeySeq.current}`);");
    expect(src).toContain('const mentionSessionKey = brain === "driver" ? (mentionSession ? `visit:${mentionSession}` : null) : flowMentionKeyRef.current;');
    expect(src).not.toContain('flow:${flowSessionId || "new"}');
  });
});

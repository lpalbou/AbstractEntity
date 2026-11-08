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
    const html = composer(props({ chips: [{ id: "castor", name: "Castor", kind: "entity" }], unavailable: MENTIONS_UNAVAILABLE }));
    expect(html).toContain("@Castor");
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
    expect(src).toContain("{...visitMentionProps({ sessionKey: mentionSessionKey, candidates: mentionCandidates, chips: mentionChips, onChipsChange: setMentionChips, unavailable: mentionsUnavailable, status: mentionStatus })}");
    expect(src).not.toContain("onSubmit={send}");
  });

  it("the mentions run after the person's turn landed, in both lanes, never invented sessions", () => {
    const visitTurn = src.indexOf("sendVisitTurn(baseUrl, entity, runId, text, token, speaker, attachments)");
    // The visit turn lives in the entity's home, not in the session: no repeat_of there.
    const visitMentions = src.indexOf("if (mentionsSent.length && sessionForMentions) return sendMentions(sessionForMentions, words, mentionsSent, sentChips, null);");
    expect(visitTurn).toBeGreaterThan(0);
    expect(visitMentions).toBeGreaterThan(visitTurn);
    expect(src).toContain("void sendFlow(flowText).then(({ landed, sessionId, runId: turnRunId }) => {");
    // The flow lane's summoned run is the person's turn of the session: the mentions' repeat_of.
    expect(src).toContain("return sendMentions(sessionId, flowText, mentionsSent, sentChips, turnRunId).finally(() => setBusy(\"idle\"));");
    // The visit's session is the door's (open answer / visit status), never minted here.
    expect(src).toContain('setVisitSession(typeof r.session_id === "string" && r.session_id ? { runId: r.run_id, sessionId: r.session_id } : null);');
    expect(src).toMatch(/const mentionSession = brain === "driver" \? \(runId && visitSession\?\.runId === runId \? visitSession\.sessionId : null\)/);
  });

  it("the @ list excludes the visited entity and mentions post the words as typed with their index", () => {
    expect(src).toContain("mentionCandidatesFor(await mentionRowsRef.current, entity, query, mentionRefusedRef.current)");
    expect(src).toContain("postMention(baseUrl, sessionId, { entity: m.id, text, mention_index: m.index, ...(repeatOf ? { repeat_of: repeatOf } : {}) }, token)");
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

  it("the castor@host meet offer is untouched", () => {
    expect(src).toContain("resolveMentions(draft, roster, localAddresses, entity)");
  });
});

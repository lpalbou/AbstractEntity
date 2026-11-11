/**
 * Operator round 6 (2026-11-11), Entity: a mentioned entity's answer on its way is a bubble in the
 * thread (its orb and name, three dots), replaced by its reply, never a line in the composer; the
 * person's message shows once before the replies (the mention mirrors add no user bubble). Rendered
 * with react-dom/server (no DOM in the tests).
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatMessageList, type DrawerMessage } from "./chat_message_list";
import { pendingAfterReply, pendingMentionMessage, pendingMentionsFor, PENDING_MENTION_ID, runMentions } from "./visit_mentions";
import type { MentionWire } from "./stream_source";

const LOOK = { style: "watch-halo", color: "#336699" };
const castor = { id: "castor", name: "Castor", kind: "entity" as const, index: 0, start: 4 };
const nerin = { id: "nerin", name: "Nerin", kind: "entity" as const, index: 1, start: 12 };
const agent = { id: "agent", name: "Laurent's agent", kind: "agent" as const, index: 2, start: 19 };
const chips = [{ id: "castor", name: "Castor", kind: "entity" as const, avatar: LOOK }, { id: "nerin", name: "Nerin", kind: "entity" as const, avatar: null }];
const drawer = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
const entity = (name: string) => ({ kind: "entity" as const, name, entity_id: null, identity_ref: null, avatar: null });

describe("an answer on its way is a bubble with its dots", () => {
  const pending = pendingMentionsFor("msg-1", [castor, nerin, castor, agent], chips);

  it("one per entity (each once, never the agent's chip), named and drawn as its reply will be", () => {
    expect(pending.map((p) => [p.key, p.author.name, p.author.avatar])).toEqual([["msg-1:0", "Castor", LOOK], ["msg-1:1", "Nerin", null]]);
    const m = pendingMentionMessage(pending[0]);
    expect([m.id, m.role, m.content, m.live?.label, m.author?.name]).toEqual([`${PENDING_MENTION_ID}msg-1:0`, "assistant", "", "answering", "Castor"]);
  });

  it("in the thread after the messages: its author and its three dots; replaced, not duplicated, by its reply", () => {
    const user: DrawerMessage = { id: "m1", role: "user", content: "hey @Castor @Nerin" };
    const out = renderToStaticMarkup(<ChatMessageList messages={[user]} onDetail={() => undefined} pendingMentions={pending} />);
    expect(out.match(/pc-working-dots"/g)?.length).toBe(2);
    expect(out.indexOf("Castor is answering")).toBeGreaterThan(out.indexOf('data-mid="m1"'));
    const afterCastor = pendingAfterReply(pending, castor);
    expect(afterCastor.map((p) => p.author.name)).toEqual(["Nerin"]);
    const replied: DrawerMessage = { id: "m2", role: "assistant", content: "Castor here.", author: entity("Castor") };
    const next = renderToStaticMarkup(<ChatMessageList messages={[user, replied]} onDetail={() => undefined} pendingMentions={afterCastor} />);
    expect(next.match(/pc-working-dots"/g)?.length).toBe(1);
    expect(next).not.toContain("Castor is answering");
    expect(renderToStaticMarkup(<ChatMessageList messages={[user]} onDetail={() => undefined} />)).not.toContain("pc-working-dots");
  });

  it("the drawer: bubbles from the ask, each gone with its reply, all gone when the run ends", () => {
    expect(drawer).toContain("setPendingMentions(pendingMentionsFor(message, sent, chips));");
    expect(drawer).toContain("setPendingMentions((cur) => pendingAfterReply(cur, m));");
    expect(drawer).toContain("}).finally(() => setPendingMentions([]));");
    expect(drawer).toContain("pendingMentions={pendingMentions}");
    expect(drawer).not.toContain("is answering");
  });
});

describe("a refusal that does not stop the run takes its bubble away at once (review F3)", () => {
  it("said before the next entity is asked; the drawer drops its bubble and shows its sentence then", async () => {
    const events: string[] = [];
    const wires = [
      { status: 409, body: { detail: "x", code: "in_another_conversation" }, code: "in_another_conversation" },
      { status: 404, body: { detail: "missing", code: "entity_not_found" }, code: "entity_not_found" },
      { status: 200, body: { run_id: "r", reply: "Here.", author: null, mention_index: 2, mirrors: [] }, code: null },
    ];
    const vega = { id: "vega", name: "Vega", kind: "entity" as const, index: 2, start: 20 };
    await runMentions([castor, nerin, vega], {
      post: async (m) => (events.push(`ask:${m.id}`), wires.shift()! as MentionWire),
      onReply: (m) => void events.push(`reply:${m.id}`),
      onSkipped: (m, sentence) => void events.push(`skip:${m.id}:${sentence}`),
    });
    expect(events.map((e) => e.split(":").slice(0, 2).join(":"))).toEqual(["ask:castor", "skip:castor", "ask:nerin", "skip:nerin", "ask:vega", "reply:vega"]);
    expect(events[1]).toBe("skip:castor:Castor is in another conversation.");
    const onSkipped = drawer.slice(drawer.indexOf("onSkipped: (m, sentence) => {"), drawer.indexOf("}).finally(() => setPendingMentions([]));"));
    expect(onSkipped).toContain("setPendingMentions((cur) => pendingAfterReply(cur, m));");
    expect(onSkipped).toContain("setMentionStatus(sentence);");
  });
});

describe("the person's message shows once before both replies", () => {
  it("two mentions: one user bubble, then each reply with its author (the mirror is a small line, not a bubble)", () => {
    const thread: DrawerMessage[] = [
      { id: "m1", role: "user", content: "hey @Castor @Nerin" },
      { id: "m2", role: "assistant", content: "Castor here.", author: entity("Castor") },
      { id: "m3", role: "system", content: "Also said to Laurent's agent." },
      { id: "m4", role: "assistant", content: "Nerin here.", author: entity("Nerin") },
    ];
    const out = renderToStaticMarkup(<ChatMessageList messages={thread} onDetail={() => undefined} />);
    expect(out.match(/pc-chat-item--user/g)?.length).toBe(1);
    expect(out.match(/pc-chat-item--assistant/g)?.length).toBe(2);
    // The drawer's replies push the entity's words (and a mirror line), never the person's again.
    const replies = drawer.slice(drawer.indexOf("onReply: (m, reply, author, mirrors) => {"), drawer.indexOf("}).finally(() => setPendingMentions([]));"));
    expect(replies).not.toContain('role: "user"');
    expect(replies).toContain('push({ role: "assistant", content: reply, title: m.name, ...(author ? { author } : {}) });');
  });
});

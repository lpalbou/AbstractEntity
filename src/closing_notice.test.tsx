/**
 * The visit's closing notice (operator test round 2, 2026-11-10): the head line while the reflection
 * runs and, on its own line in italic, the narrator's (no pronoun, no parentheses: 2026-11-10
 * evening); no act row until an act lands (the "watching his stream… (the Ledger tab keeps the full
 * record)" line is gone); the acts as they land, "He wrote in his book" rows included (he likes those);
 * the notice is the thread's last row, never a card floating over the messages.
 * Rendered with react-dom/server (no DOM in the tests).
 */
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { reflectionActivity } from "./chat_drawer";
import { ChatMessageList, type DrawerMessage } from "./chat_message_list";
import { CLOSING_HEAD, CLOSING_NARRATION, ClosingNotice } from "./closing_notice";
import type { ReplayEnvelope } from "./stream_types";

const env = (seq: number, family: string, extra: Partial<ReplayEnvelope> = {}): ReplayEnvelope =>
  ({ stream: "abstractmemory.replay", stream_version: 1, seq, family, observed_at: `2026-11-10T14:0${seq % 10}:00+00:00`, scope: "life", owner_id: "entity:castor", trace_id: null, turn_id: "t-1", run_id: "visit-castor-1", payload: {}, display: {}, ...extra }) as ReplayEnvelope;
/** "He wrote in his book" (a diary binding, as the stream serves it). */
const diary = (seq: number, gist: string) =>
  env(seq, "binding", { payload: { record_id: `ex:diary-${seq}`, source: "remember", search_state: "indexed", prompt_state: "inactive" }, display: { diary: true, kind: "diary", title: gist, gist, entry_id: `diary_${seq}` } } as Partial<ReplayEnvelope>);
/** Recall bookkeeping (a co_selected pair): never a reflection act. */
const pair = (seq: number) => env(seq, "event", { trace_id: "tr-1", payload: { kind: "co_selected", pair_ids: ["ex:a", "ex:b"] }, display: { pair: [{ title: "a" }, { title: "b" }] } } as Partial<ReplayEnvelope>);

const OLD_HINT = /watching his stream|Ledger tab keeps the full record/;
const html = (activity: ReturnType<typeof reflectionActivity>) => renderToStaticMarkup(<ClosingNotice activity={activity} />);

describe("the closing notice", () => {
  it("two lines, no pronoun: the head, then the narrator's line on its own, without parentheses", () => {
    expect(CLOSING_HEAD).toBe("Closing — reflection runs now");
    expect(CLOSING_NARRATION).toBe("looking back over the visit; feelings may move, a summary forms…");
    for (const words of [CLOSING_HEAD, CLOSING_NARRATION]) {
      expect(words).not.toMatch(/[()]/);
      expect(words).not.toMatch(/\b(he|his|him|she|her|it|its)\b/i);
    }
    const out = html([]);
    const head = out.indexOf('class="cd_closing_head"');
    const narration = out.indexOf('class="cd_closing_narration"');
    expect(head).toBeGreaterThan(0);
    expect(narration).toBeGreaterThan(head);
    expect(out.slice(head, narration)).toContain(CLOSING_HEAD);
    expect(out.slice(head, narration)).not.toContain(CLOSING_NARRATION);
    expect(out.slice(narration)).toContain(CLOSING_NARRATION);
    // Italic, dim, under the head's words (the CSS the notice imports).
    const css = fs.readFileSync(path.join(__dirname, "chat_notices.css"), "utf8");
    expect(css).toMatch(/\.cd_closing_narration \{[^}]*font-style: italic;/);
    expect(fs.readFileSync(path.join(__dirname, "closing_notice.tsx"), "utf8")).toContain('import "./chat_notices.css";');
  });

  it("nothing landed yet: the head and the narration, no act rows", () => {
    const out = html([]);
    expect(out).toContain(CLOSING_HEAD);
    expect(out).toContain('aria-live="polite"');
    expect(out).not.toMatch(OLD_HINT);
    expect(out).not.toContain("cd_closing_hint");
    expect(out).not.toContain("<ul");
  });

  it("his acts as they land, 'He wrote in his book' rows with their gist", () => {
    const stream = [diary(3, "before the close"), pair(5), diary(6, "the harbour visit, kept"), pair(7), diary(8, "what the tide tables taught me")];
    const acts = reflectionActivity(stream, 5);
    expect(acts.map((l) => l.title)).toEqual(["📖 He wrote in his book", "📖 He wrote in his book"]);
    const out = html(acts);
    expect(out).toContain(CLOSING_HEAD);
    expect(out.match(/<li>/g)?.length).toBe(2);
    expect(out).toContain("He wrote in his book");
    expect(out).toContain("the harbour visit, kept");
    expect(out).toContain("what the tide tables taught me");
    expect(out).not.toContain("before the close");
    expect(out).not.toMatch(OLD_HINT);
  });

  it("no close running: no acts", () => {
    expect(reflectionActivity([diary(6, "x")], null)).toEqual([]);
  });
});

describe("wiring", () => {
  const drawer = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
  it("the drawer hands the close to the thread while it runs (the chat view only), with the reflection's acts", () => {
    const list = drawer.slice(drawer.indexOf("<ChatMessageList"), drawer.indexOf("/>}", drawer.indexOf("<ChatMessageList")));
    expect(list).toContain('closing={busy === "closing" ? closingActivity : null}');
    expect(drawer).toContain('(busy === "closing" ? reflectionActivity(envelopes, closeSeqRef.current) : [])');
    // Never a card of its own outside the thread (it floated over the messages).
    expect(drawer).not.toContain("<ClosingNotice");
  });
  it("IN the chat: the thread's last row, in the messages' column, after the last message", () => {
    const messages: DrawerMessage[] = [
      { id: "m1", role: "user", content: "goodbye for now" },
      { id: "m2", role: "assistant", content: "until next time", title: "Castor" },
    ];
    const acts = reflectionActivity([diary(6, "the harbour visit, kept")], 5);
    const out = renderToStaticMarkup(<ChatMessageList messages={messages} onDetail={() => undefined} closing={acts} />);
    const thread = out.indexOf('class="pc-chat-thread cd_thread"');
    const last = out.indexOf('data-mid="m2"');
    const row = out.indexOf('<div class="cd_msg" data-role="closing"><div class="cd_closing"');
    expect(thread).toBe(5);
    expect(last).toBeGreaterThan(thread);
    expect(row).toBeGreaterThan(last);
    expect(out.slice(row)).toContain("He wrote in his book");
    expect(out.slice(row)).toContain("the harbour visit, kept");
    expect(out.endsWith("<div></div></div>")).toBe(true); // nothing after it but the scroll anchor
    expect(renderToStaticMarkup(<ChatMessageList messages={messages} onDetail={() => undefined} closing={null} />)).not.toContain("cd_closing");
  });
  it("the old second line is gone from the drawer and its style from the sheet", () => {
    expect(drawer).not.toMatch(OLD_HINT);
    expect(fs.readFileSync(path.join(__dirname, "entity.css"), "utf8")).not.toContain("cd_closing_hint");
  });
});

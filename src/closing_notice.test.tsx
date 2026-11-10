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

import { reflectionActivity, visitTurnCount } from "./chat_drawer";
import { ChatMessageList, type DrawerMessage } from "./chat_message_list";
import { CLOSING_HEAD, CLOSING_NARRATION, ClosingNotice, NOTHING_KEPT, closeKeepsNothing } from "./closing_notice";
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

describe("a visit without words keeps nothing (runtime 0.19.4: zero turns form nothing)", () => {
  const notice = { kind: "lesson", record_id: "ex:lesson-1", title: "a lesson" };
  const render = (turns: number | null, notices: unknown[] | null, acts: ReturnType<typeof reflectionActivity> = []) =>
    renderToStaticMarkup(<ClosingNotice activity={acts} turns={turns} notices={notices} />);

  it("zero turns and an answer without notices: one plain line, no narration, no act rows", () => {
    const out = render(0, []);
    expect(out).toContain(NOTHING_KEPT);
    expect(NOTHING_KEPT).toBe("Nothing to keep: no words were shared.");
    expect(out).not.toContain(CLOSING_HEAD);
    expect(out).not.toContain(CLOSING_NARRATION);
    expect(out).not.toContain("<li>");
    expect(out).not.toContain("cd_closing_spin");
  });

  it("one turn: the head and the narration, as before", () => {
    const out = render(1, []);
    expect(out).toContain(CLOSING_HEAD);
    expect(out).toContain(CLOSING_NARRATION);
    expect(out).not.toContain(NOTHING_KEPT);
  });

  it("zero turns but a notice, or an act in his stream: the data wins, the narration shows", () => {
    expect(render(0, [notice])).toContain(CLOSING_NARRATION);
    expect(render(0, [notice])).not.toContain(NOTHING_KEPT);
    const acts = reflectionActivity([diary(6, "kept anyway")], 5);
    expect(render(0, null, acts)).toContain("kept anyway");
    expect(render(0, null, acts)).not.toContain(NOTHING_KEPT);
  });

  it("the rule: zero served turns, no notice, no act; an unknown count never claims nothing", () => {
    expect(closeKeepsNothing(0, [], [])).toBe(true);
    expect(closeKeepsNothing(0, null, [])).toBe(true); // the close still runs: its answer will carry none
    expect(closeKeepsNothing(1, [], [])).toBe(false);
    expect(closeKeepsNothing(0, [notice], [])).toBe(false);
    expect(closeKeepsNothing(null, [], [])).toBe(false);
    expect(render(null, null)).toContain(CLOSING_NARRATION);
  });

  it("the turn count is served: the poll's turn_n for this run, or a reply's (the poll can lag)", () => {
    const reply = (run: string, n: number) => ({ id: `m${n}`, role: "assistant", content: "x", detail: { reply: "x", run_id: run, turn_n: n } }) as unknown as DrawerMessage;
    expect(visitTurnCount({ run_id: "v1", turn_n: 0 }, [], "v1")).toBe(0);
    expect(visitTurnCount({ run_id: "v1", turn_n: 0 }, [reply("v1", 1)], "v1")).toBe(1);
    expect(visitTurnCount({ run_id: "v0", turn_n: 0 }, [reply("v0", 3)], "v1")).toBeNull();
    expect(visitTurnCount(null, [], "v1")).toBeNull();
    expect(visitTurnCount({ run_id: "v1", turn_n: 0 }, [], null)).toBeNull();
    const src = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
    expect(src).toContain('closingTurns={busy === "closing" ? visitTurnCount(status, messages, runId) : null}');
    const list = fs.readFileSync(path.join(__dirname, "chat_message_list.tsx"), "utf8");
    expect(list).toContain("<ClosingNotice activity={closing} turns={closingTurns} />");
  });
});

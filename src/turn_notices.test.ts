/**
 * What a reply formed, as badges under its words (AbstractRuntime turn notices, 2026-11-09): each
 * lane reads the served list as data (visit lane `reply_notices`, flow lane the view answer's
 * `notices`), the avatar view keeps it, the thread renders it, and a badge opens what it names.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReplayView, ReplayViewTransport } from "@abstractframework/panel-chat";

import { VISIT_CLOSE_KIND, emptyNotice, foldedRecordRow, noticeTarget, noticesField, openNotice, viewReplyNotices } from "./turn_notices";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { avatarVisitHistory } from "./avatar_visit";
import { ChatMessageList, type DrawerMessage } from "./chat_message_list";
import { followRunToTerminal } from "./flow_lane";
import { visitReplyMessage } from "./chat_drawer";
import { VISIT_TURN_WITH_DIARY } from "./fixtures/visit_turn_reply";

const SRC = resolve(__dirname);
const diary = { kind: "diary", record_id: "ex:diary-0eb1c2", title: "the first durable visit" };
const lesson = { kind: "lesson", record_id: null, title: "Visits are durable", text: "A visit survives a restart.", staged: true };
const privateDiary = { kind: "diary", record_id: "ex:diary-77aa01", title: "", visibility: "private" };

function view(messages: ReplayView["messages"]): ReplayView {
  return {
    version: "replay_view_v1", root_run_id: "root", status: "completed", display_status: null,
    cursor: { token: "root:3", records: 3, runs: { root: 3 } }, runs: [{ run_id: "root", status: "completed" }],
    interaction: null, open_waits: [], messages, activities: [], artifacts: [], usage: null,
  } as ReplayView;
}
const answer = (id: string, text: string, notices: unknown) => ({ id, role: "assistant", kind: "answer", text, run_id: "root", notices } as ReplayView["messages"][number]);

describe("the served list is read as data", () => {
  it("noticesField: the notices, or nothing (an empty list, a log of strings, nothing served)", () => {
    expect(noticesField([diary, lesson, privateDiary])).toEqual({ notices: [diary, lesson, privateDiary] });
    expect(noticesField([])).toEqual({});
    expect(noticesField(["#FALLBACK realization refused"])).toEqual({});
    expect(noticesField(undefined)).toEqual({});
  });

  it("viewReplyNotices: every answer message's notices in view order; other messages and logs are not notices", () => {
    const v = view([
      { id: "root:p", role: "user", kind: "prompt", text: "hi", run_id: "root" } as ReplayView["messages"][number],
      answer("root:a1", "Kept.", [diary]),
      { id: "root:final", role: "assistant", kind: "final", text: "Kept.", run_id: "root", notices: [privateDiary] } as unknown as ReplayView["messages"][number],
      answer("root:a2", "And this.", [lesson]),
      answer("root:a3", "Log.", ["a log line"]),
    ]);
    expect(viewReplyNotices(v)).toEqual([diary, lesson]);
    expect(viewReplyNotices(null)).toEqual([]);
  });

  it("the flow lane's terminal outcome carries the view's notices", async () => {
    const v = view([answer("root:a1", "Kept.\n\nGood to see you.", [diary, lesson])]);
    const transport: ReplayViewTransport = {
      async getView() { return { notModified: false, view: JSON.parse(JSON.stringify(v)), etag: '"root:3"', bytes: 0 }; },
      async streamView() { return { bytes: 0 }; },
    } as unknown as ReplayViewTransport;
    let t = 0;
    const out = await followRunToTerminal("root", {
      view: transport, fetchSummary: async () => ({ status: "completed", output: { answer: "Kept.\n\nGood to see you." }, error: null }),
      deadlineMs: 60_000, aborted: () => false, now: () => t, sleep: async (ms: number) => { t += ms; },
    });
    expect(out).toMatchObject({ kind: "terminal", status: "completed", notices: [diary, lesson] });
    const none = await followRunToTerminal("root", {
      view: { ...transport, async getView() { return { notModified: false, view: view([answer("root:a1", "Hi.", null)]), etag: '"x"', bytes: 0 }; } } as unknown as ReplayViewTransport,
      fetchSummary: async () => ({ status: "completed", output: { answer: "Hi." }, error: null }),
      deadlineMs: 60_000, aborted: () => false, now: () => t, sleep: async (ms: number) => { t += ms; },
    });
    expect(none.kind === "terminal" && "notices" in none).toBe(false);
  });

  it("each lane hands the served list to its thread message (visit: reply_notices; flow: the outcome's notices)", () => {
    // The visit lane: the drawer pushes visitReplyMessage, which carries the served list as notices.
    const drawer = readFileSync(resolve(SRC, "chat_drawer.tsx"), "utf8");
    expect(drawer).toContain("push(visitReplyMessage(r, entityName, Date.now() - turnT0));");
    const reply = visitReplyMessage(VISIT_TURN_WITH_DIARY, "Castor", 1);
    expect(reply.notices).toEqual(VISIT_TURN_WITH_DIARY.reply_notices);
    expect(reply.detail?.reply_notices).toEqual(VISIT_TURN_WITH_DIARY.reply_notices);
    expect(visitReplyMessage({ ...VISIT_TURN_WITH_DIARY, reply_notices: [] }, "Castor", 1)).not.toHaveProperty("notices");
    const flow = readFileSync(resolve(SRC, "use_flow_conversation.ts"), "utf8");
    expect(flow).toMatch(/push\(\{ role: "assistant", content: answer, title: entityName, [^\n]*\.\.\.noticesField\(outcome\.notices\) \}\)/);
  });

  it("no app code reads a marker out of the reply text", () => {
    for (const file of ["chat_drawer.tsx", "chat_message_list.tsx", "use_flow_conversation.ts", "avatar_visit.ts", "flow_lane.ts", "turn_notices.ts", "stream_source.ts"]) {
      const src = readFileSync(resolve(SRC, file), "utf8");
      expect(src, file).not.toMatch(/\[kept in diary|\[learned:|\[kept interest|\[realized:|\[kept a private/);
    }
  });
});

describe("the badges render where the reply does", () => {
  const reply: DrawerMessage = { id: "m2", role: "assistant", title: "Castor", content: "Kept.\n\nGood to see you.", notices: [diary, lesson, privateDiary] };

  it("the chat thread: one badge per notice under the reply", () => {
    const html = renderToStaticMarkup(React.createElement(ChatMessageList, { messages: [reply], onDetail: () => undefined, onNoticeOpen: () => undefined }));
    expect(html).toContain('class="pc-chat-notices"');
    expect((html.match(/class="pc-chat-notice /g) || []).length).toBe(3);
    expect(html).toContain("the first durable visit");
    expect(html).toContain("private diary entry");
    expect(html).toContain("forming…");
    expect(html).not.toContain("[kept");
    // The drawer's opener reaches the card: a badge with a host opener is a plain button; without
    // one the kit makes it a closed disclosure of its own panel.
    expect(html).not.toContain("aria-expanded");
    const alone = renderToStaticMarkup(React.createElement(ChatMessageList, { messages: [reply], onDetail: () => undefined }));
    expect((alone.match(/aria-expanded="false"/g) || []).length).toBe(3);
  });

  it("the avatar view keeps an answer's notices (a person's message has none)", () => {
    const out = avatarVisitHistory([{ id: "u1", role: "user", content: "hi", notices: [diary] } as DrawerMessage, reply], [], "run-1");
    expect(out.find((m) => m.id === "m2")?.notices).toEqual([diary, lesson, privateDiary]);
    expect(out.find((m) => m.id === "u1")).not.toHaveProperty("notices");
  });
});

describe("a badge opens what it names", () => {
  const thread = [
    { id: "m1", kind: undefined },
    { id: "m2", kind: "answer" },
    { id: "m3", kind: undefined },
    { id: "m4", kind: VISIT_CLOSE_KIND },
  ];

  it("a record (a private diary entry too) opens in Detail by its graph id", () => {
    expect(noticeTarget(diary, "m2", thread)).toEqual({ kind: "record", graphId: "ex:diary-0eb1c2" });
    expect(noticeTarget(privateDiary, "m2", thread)).toEqual({ kind: "record", graphId: "ex:diary-77aa01" });
  });

  it("a staged one opens the close summary that follows its reply", () => {
    expect(noticeTarget(lesson, "m2", thread)).toEqual({ kind: "close", messageId: "m4" });
  });

  it("before the close (or a close of an earlier visit only) it shows its own panel", () => {
    expect(noticeTarget(lesson, "m2", thread.slice(0, 3))).toEqual({ kind: "panel" });
    expect(noticeTarget(lesson, "m5", [...thread, { id: "m5", kind: "answer" }])).toEqual({ kind: "panel" });
    expect(noticeTarget(lesson, undefined, thread)).toEqual({ kind: "panel" });
  });

  it("the drawer stamps its close summary so a staged badge can find it", () => {
    const drawer = readFileSync(resolve(SRC, "chat_drawer.tsx"), "utf8");
    expect(drawer).toMatch(/push\(\{ role: "system", kind: VISIT_CLOSE_KIND, content: parts\.length \? `Visit closed\./);
    expect(drawer).toMatch(/onNoticeOpen=\{openNotice\}/);
    expect(drawer).toMatch(/onNoticeOpen: openNotice,/);
    const view = readFileSync(resolve(SRC, "entity_view.tsx"), "utf8");
    expect(view).toMatch(/onOpenRecord=\{openInDetail\}/);
  });
});

describe("a badge whose record has not reached the view, and a badge with nothing to show (review S1, N1)", () => {
  const bound = (seq: number, id: string): ReplayEnvelope =>
    ({
      stream: "abstractmemory.replay", stream_version: 1, seq, family: "binding", observed_at: "2026-11-09T21:40:00+00:00", scope: "life", owner_id: "entity:castor",
      trace_id: null, turn_id: "t-1", run_id: "visit-1",
      payload: { record_id: id, source: "remember", search_state: "indexed", prompt_state: "inactive" },
      display: { record_id: id, kind: "diary", diary: true, title: "the first durable visit", gist: "the first durable visit" },
    }) as unknown as ReplayEnvelope;
  const fold = foldEnvelopes([bound(1, "ex:diary-0eb1c2")]);
  const thread = [{ id: "m2", kind: "answer" }];

  it("the fold row Detail opens, or null while the record has not been folded", () => {
    expect(foldedRecordRow(fold, "ex:diary-0eb1c2")).toBe("ex:diary-0eb1c2");
    expect(foldedRecordRow(fold, "ex:nope-1")).toBeNull();
    expect(foldedRecordRow(foldEnvelopes([]), "ex:diary-0eb1c2")).toBeNull();
  });

  it("a record not folded yet answers false: the badge opens its own panel (title and words), never Detail on the current recall", () => {
    const opened: string[] = [];
    const host = { openRecord: (id: string) => (foldedRecordRow(fold, id) === null ? false : (opened.push(id), true)), showMessage: () => {} };
    expect(openNotice({ kind: "diary", record_id: "ex:nope-1", title: "a record the app never received" }, "m2", thread, host)).toBe(false);
    expect(opened).toEqual([]);
    // Folded: Detail opens it and the badge opens nothing of its own.
    expect(openNotice(diary, "m2", thread, host)).toBeUndefined();
    expect(opened).toEqual(["ex:diary-0eb1c2"]);
  });

  it("a notice with no record, no title, no words and not staged opens nothing at all", () => {
    const empty = { kind: "question", record_id: null, title: "", text: "" };
    expect(emptyNotice(empty)).toBe(true);
    expect(noticeTarget(empty, "m2", thread)).toEqual({ kind: "nothing" });
    const calls: string[] = [];
    const host = { openRecord: () => (calls.push("record"), true), showMessage: () => calls.push("scroll") };
    expect(openNotice(empty, "m2", thread, host)).toBeUndefined();
    expect(calls).toEqual([]);
    // Anything to show keeps its panel or its record: words, a title, a record, a staged one.
    for (const n of [{ ...empty, text: "Why?" }, { ...empty, title: "Why do visits end?" }, { ...empty, record_id: "ex:diary-1" }, { ...empty, staged: true }]) expect(emptyNotice(n)).toBe(false);
    expect(openNotice({ ...empty, text: "Why?" }, "m2", thread, host)).toBe(false);
  });

  it("the page's opener answers whether it opened anything, with one stable callback; the drawer hands the answer back to the badge", () => {
    const view = readFileSync(resolve(SRC, "entity_view.tsx"), "utf8");
    expect(view).toContain("const openInDetail = useCallback((id: string): boolean => {");
    expect(view).toContain("const row = foldedRecordRow(foldRef.current, id);");
    expect(view).toContain("if (row === null) return false;");
    expect(view).toMatch(/return true;\n {2}\}, \[\]\);/);
    const drawer = readFileSync(resolve(SRC, "chat_drawer.tsx"), "utf8");
    expect(drawer).toContain("onOpenRecord(graphId: string): boolean;");
    expect(drawer).toContain("openNoticeIn(notice, message.id, avatarMode ? [] : messages, {");
    expect(drawer).toContain("openRecord: onOpenRecord,");
  });
});

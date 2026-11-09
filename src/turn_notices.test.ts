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

import { VISIT_CLOSE_KIND, noticeTarget, noticesField, viewReplyNotices } from "./turn_notices";
import { avatarVisitHistory } from "./avatar_visit";
import { ChatMessageList, type DrawerMessage } from "./chat_message_list";
import { followRunToTerminal } from "./flow_lane";

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
    const drawer = readFileSync(resolve(SRC, "chat_drawer.tsx"), "utf8");
    expect(drawer).toMatch(/detail: \{ \.\.\.\(r as ChatTurnResult\), think_ms: Date\.now\(\) - turnT0 \} as ChatTurnResult, \.\.\.noticesField\(r\.reply_notices\) \}\)/);
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

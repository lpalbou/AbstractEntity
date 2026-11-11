/**
 * A new visit starts a fresh thread (operator 2026-11-11 10:21: "i clicked visit and... it reopened
 * the last visit… if i reload the page, the visit is empty"). The drawer's thread used to keep the
 * last visit's whole conversation and its close, with the new visit's door line appended below; a
 * reload showed only the new visit. Now a visit other than the one the thread holds starts empty; the
 * same visit rejoined keeps its own. Rendered with react-dom/server (no DOM in the tests).
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { threadForOpenedVisit } from "./chat_drawer";
import { ChatMessageList, type DrawerMessage } from "./chat_message_list";

const visitA: DrawerMessage[] = [
  { id: "m1", role: "system", content: "The door opened: you are visiting Aletheia. This visit is a durable run (run-a)." },
  { id: "m2", role: "user", content: "What did you read today?" },
  { id: "m3", role: "assistant", content: "The harbour records.", title: "Aletheia" },
  { id: "m4", role: "system", kind: "visit_close", content: "Visit closed. 4 turns · what moved: 📖 He wrote in his book" },
];
const doorB: DrawerMessage = { id: "m5", role: "system", content: "The door opened: you are visiting Aletheia. This visit is a durable run (run-b)." };
const drawer = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");

describe("a new visit starts a fresh thread", () => {
  it("visit A closed, visit B opened: the thread holds only B's door line", () => {
    const thread = [...threadForOpenedVisit(visitA, "run-a", "run-b"), doorB];
    expect(thread).toEqual([doorB]);
    const out = renderToStaticMarkup(<ChatMessageList messages={thread} onDetail={() => undefined} />);
    expect(out).toContain("durable run (run-b)");
    expect(out).not.toContain("What did you read today?");
    expect(out).not.toContain("Visit closed.");
  });

  it("the same visit (a rejoin, an open answering the visit already held) keeps its own thread", () => {
    expect(threadForOpenedVisit(visitA, "run-a", "run-a")).toBe(visitA);
    expect(threadForOpenedVisit([], null, "run-a")).toEqual([]);
  });

  it("the drawer: an open of another visit resets the thread (and its pending bubbles, its turn panel); a rejoin records its visit", () => {
    const opened = drawer.slice(drawer.indexOf("const onOpened = (r: Awaited<ReturnType<typeof openVisit>>) => {"), drawer.indexOf("// Direction of the visit reads human-first"));
    expect(opened).toMatch(/if \(threadRunRef\.current !== r\.run_id\) \{\s*setMessages\(\(prev\) => threadForOpenedVisit\(prev, threadRunRef\.current, r\.run_id\) as DrawerMessage\[\]\);\s*setPendingMentions\(\[\]\);\s*setDetailTurn\(null\);\s*\}\s*threadRunRef\.current = r\.run_id;/);
    expect(opened.indexOf("threadRunRef.current = r.run_id;")).toBeLessThan(opened.indexOf("setRunId(r.run_id);"));
  });

  it("a rejoin owns the thread from its start, its transcript read or not: a failed read, then the SAME visit, keeps it (review 6b)", () => {
    const rehydrate = drawer.slice(drawer.indexOf("const rehydrate = useCallback("), drawer.indexOf("setMessages(rebuilt);"));
    const fetchAt = rehydrate.indexOf("getVisitTranscript(");
    const ownAt = rehydrate.indexOf("threadRunRef.current = ownRunId;");
    // Recorded before the read is sent (never only in its success).
    expect(ownAt).toBeGreaterThan(0);
    expect(ownAt).toBeLessThan(fetchAt);
    expect(rehydrate.slice(fetchAt)).not.toContain("threadRunRef.current =");
    // Another visit's thread goes when the rejoin starts; the same visit's early return only when
    // the thread is still that visit's.
    expect(rehydrate).toMatch(/const sameVisit = threadRunRef\.current === ownRunId;\s*if \(!sameVisit\) \{\s*setMessages\(\[\]\);\s*setPendingMentions\(\[\]\);\s*setDetailTurn\(null\);\s*\}/);
    expect(rehydrate).toContain("if (sameVisit && rehydratedRef.current.has(ownRunId)) {");
    // The operator's sequence: rejoin X (read fails: the warning line), words in X, a visit press
    // that gets X back: the thread is kept.
    const threadRun = "run-x"; // what the rejoin recorded at its start
    const thread: DrawerMessage[] = [
      { id: "r1", role: "system", level: "warn", content: "Rejoined the open visit; earlier turns could not be fetched (502) — reopen the tab to retry." },
      { id: "m1", role: "user", content: "still there?" },
      { id: "m2", role: "assistant", content: "Yes.", title: "Aletheia" },
    ];
    expect(threadForOpenedVisit(thread, threadRun, "run-x")).toBe(thread);
  });
});

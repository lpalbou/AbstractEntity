/**
 * THE TOPICS PANEL's states (react-dom/server; no DOM in the tests): the one
 * sentence while his topics are not served (first sleep to come; a gateway
 * before v2), loading and failed reads, then the list — authored titles and
 * summaries, counts, "being written…", the focused topic's members with the
 * provisional badge — folded on a phone. Never a keyword, never a label the
 * app made.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FIRST_SLEEP_SENTENCE, readCommunities, UNSERVED_SENTENCE, type CommunitiesRead } from "./communities";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { membershipOf } from "./topic_layout";
import { memberOpensIn, memoriesWord, NO_TOPICS, TOPICS_LOADING, TopicsPanel, topicOrder, topicsNote, waitingLine, type TopicsView } from "./topics_panel";

function binding(seq: number, id: string, kind: string, title: string, extra: Record<string, unknown> = {}): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "binding",
    observed_at: "2026-11-10T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:castor",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { record_id: id, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    display: { record_id: id, kind, title, graph_id: id, ...extra } as ReplayEnvelope["display"],
  } as ReplayEnvelope;
}

const FOLD = foldEnvelopes([
  binding(1, "ex:episode-1", "episode", "exchange: the harbour archive opens at nine"),
  binding(2, "ex:episode-2", "episode", "exchange: tide tables for the week"),
  binding(3, "ex:diary-3", "diary", "the mirrors held overnight", { diary: true }),
  binding(4, "ex:episode-4", "episode", "exchange: a placed newcomer"),
  binding(5, "ex:lesson-5", "lesson", "keep the record honest"),
]);

const comm = (key: string, members: string[], over: Record<string, unknown> = {}) => ({
  id: `ex:community-${key}-r3`,
  key,
  title: `Title ${key}`,
  summary: `Summary of ${key}.`,
  pending: [],
  members: members.map((id) => ({ id, via: "detected" })),
  provisional_ids: [],
  layout: { xy: [0, 0], radius: 1, seats: {} },
  ...over,
});

const READ = readCommunities({
  version: 2,
  version_seq: 102850,
  first_sleep_pending: false,
  communities: [
    comm("small", ["ex:lesson-5"], { title: null, pending: ["title"] }),
    comm("harbour", ["ex:episode-1", "ex:episode-2", "ex:diary-3"], { provisional_ids: ["ex:episode-4"], title: "The harbour archive", summary: "Where he goes to read the port's old ledgers." }),
  ],
});
const SERVED: TopicsView = { kind: "read", read: READ };

function render(view: TopicsView, over: Partial<React.ComponentProps<typeof TopicsPanel>> = {}): string {
  const rowsOf = READ.kind === "served" ? membershipOf(FOLD, READ.data).rowsOf : new Map();
  return renderToStaticMarkup(
    <TopicsPanel
      view={view}
      fold={FOLD}
      rowsOf={rowsOf}
      waiting={0}
      focused={null}
      open={true}
      onToggle={() => {}}
      onFocus={() => {}}
      onOpenMember={() => {}}
      onRetry={() => {}}
      colorOf={() => "#fff"}
      {...over}
    />,
  );
}

describe("not served: one sentence", () => {
  it("his first sleep has not formed topics yet", () => {
    const html = render({ kind: "read", read: { kind: "first_sleep" } });
    expect(FIRST_SLEEP_SENTENCE).toBe("His topics form at his next sleep.");
    expect(html).toBe(`<div class="gc_topics gc_topics_note" role="status">${FIRST_SLEEP_SENTENCE}</div>`);
  });

  it("a gateway before v2 says so — no client-side topics", () => {
    const html = render({ kind: "read", read: { kind: "unserved" } });
    expect(UNSERVED_SENTENCE).toBe("This gateway does not serve topics yet.");
    expect(html).toBe(`<div class="gc_topics gc_topics_note" role="status">${UNSERVED_SENTENCE}</div>`);
  });

  it("loading, a failed read (with retry), a wrong shape (named), none yet", () => {
    expect(render({ kind: "loading" })).toContain(TOPICS_LOADING);
    const failed = render({ kind: "error", message: "HTTP 503" });
    expect(failed).toContain("His topics could not be read — HTTP 503");
    expect(failed).toContain("gc_topics_error");
    expect(failed).toContain(">retry</button>");
    const wrong: CommunitiesRead = { kind: "malformed", problem: "community a: no layout" };
    expect(render({ kind: "read", read: wrong })).toContain("His topics could not be read: community a: no layout.");
    expect(topicsNote({ kind: "read", read: { kind: "served", data: { versionSeq: 1, communities: [] } } })).toEqual({ text: NO_TOPICS, error: false });
  });
});

describe("served: the list", () => {
  it("every topic, biggest first: authored title, summary, count — 'title being written…' while pending", () => {
    const html = render(SERVED);
    const titles = [...html.matchAll(/class="gc_tp_title[^"]*">([^<]*)</g)].map((m) => m[1]);
    expect(titles).toEqual(["The harbour archive", "title being written…"]);
    expect(html).toContain("Where he goes to read the port&#x27;s old ledgers.");
    expect(html).toContain(memoriesWord(4)); // 3 members + 1 provisional
    expect(html).toContain(memoriesWord(1));
    expect(html).toContain('class="gc_tp_title gc_tp_pending"');
    // The head counts the topics and the titles being written.
    expect(html).toMatch(/<span class="gc_tp_head_count">2<\/span><span class="gc_tp_head_pending">1 being written<\/span>/);
  });

  it("nothing is listed under a topic until it is focused or unfolded", () => {
    expect(render(SERVED)).not.toContain("gc_tp_member");
  });

  it("the focused topic lists its memories (titles, newest first) and marks the provisional one", () => {
    const html = render(SERVED, { focused: "harbour" });
    const members = [...html.matchAll(/data-member="([^"]+)"/g)].map((m) => m[1]);
    expect(members).toEqual(["ex:episode-4", "ex:diary-3", "ex:episode-2", "ex:episode-1"]);
    expect(html).toContain("the harbour archive opens at nine");
    expect(html).toContain("gc_tp_focused");
    const badges = [...html.matchAll(/gc_tp_provisional[^>]*><span class="af-chip__label">([^<]+)</g)].map((m) => m[1]);
    expect(badges).toEqual(["placed until his next sleep"]);
    const provisionalRow = html.slice(html.indexOf('data-member="ex:episode-4"'), html.indexOf('data-member="ex:diary-3"'));
    expect(provisionalRow).toContain("placed until his next sleep");
  });

  it("the head is a real disclosure: folded (a phone), the list is hidden", () => {
    const folded = render(SERVED, { open: false });
    expect(folded).toMatch(/<button type="button" class="gc_tp_head" aria-expanded="false" aria-controls="[^"]+">/);
    expect(folded).toMatch(/<div class="gc_tp_body" id="[^"]+" hidden="">/);
    expect(render(SERVED)).toMatch(/aria-expanded="true"/);
  });

  it("newer memories the version does not list are said, in his words", () => {
    expect(render(SERVED, { waiting: 3 })).toContain("3 newer memories join a topic at his next sleep.");
    expect(waitingLine(1)).toBe("1 newer memory joins a topic at his next sleep.");
    expect(waitingLine(0)).toBeNull();
  });

  it("the list is the kit's DisclosureList, never a keyword", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "topics_panel.tsx"), "utf8");
    expect(src).toContain('import { AfChip, DisclosureList, type DisclosureListHandle, type DisclosureRow, type DisclosureSelection } from "@abstractframework/ui-kit";');
    expect(src).toContain("<DisclosureList<TopicRowData>");
    expect(render(SERVED, { focused: "harbour" })).not.toMatch(/keyword|exemplar|louvain/i);
  });

  it("biggest first, ties by key; a diary member opens in the Book, any other in Detail", () => {
    if (READ.kind !== "served") throw new Error("fixture");
    expect(topicOrder(READ.data.communities).map((c) => c.key)).toEqual(["harbour", "small"]);
    expect(memberOpensIn(FOLD.nodes.get("ex:diary-3")!)).toBe("book");
    expect(memberOpensIn(FOLD.nodes.get("ex:episode-1")!)).toBe("detail");
  });
});

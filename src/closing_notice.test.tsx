/**
 * The visit's closing notice (operator test round 2, 2026-11-10): the head line while his reflection
 * runs; nothing under it until an act lands (the "watching his stream… (the Ledger tab keeps the full
 * record)" line is gone); the acts as they land, "He wrote in his book" rows included (he likes those).
 * Rendered with react-dom/server (no DOM in the tests).
 */
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { reflectionActivity } from "./chat_drawer";
import { CLOSING_HEAD, ClosingNotice } from "./closing_notice";
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
  it("nothing landed yet: the head line only, no second line", () => {
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
  it("the drawer shows it while the close runs (not in the avatar view), with the reflection's acts", () => {
    expect(drawer).toContain('{busy === "closing" && !avatarMode ? <ClosingNotice activity={closingActivity} /> : null}');
    expect(drawer).toContain('(busy === "closing" ? reflectionActivity(envelopes, closeSeqRef.current) : [])');
  });
  it("the old second line is gone from the drawer and its style from the sheet", () => {
    expect(drawer).not.toMatch(OLD_HINT);
    expect(fs.readFileSync(path.join(__dirname, "entity.css"), "utf8")).not.toContain("cd_closing_hint");
  });
});

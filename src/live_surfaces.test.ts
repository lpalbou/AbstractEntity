/**
 * Surfaces that read the gateway instead of the stream (the card, the
 * header state) follow the live stream (operator 2026-11-07: "I could only
 * see the new information after a refresh").
 */

import { describe, expect, it } from "vitest";

import { cardNeedsRead } from "./identity_card";
import { lastLifeChangeSeq } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";

const env = (seq: number, family: string) => ({ seq, family, payload: {} }) as unknown as ReplayEnvelope;

describe("the newest change to the entity", () => {
  it("is the newest memory, feeling, closure or lifecycle marker", () => {
    expect(lastLifeChangeSeq([env(1, "binding"), env(2, "event"), env(3, "valence"), env(4, "trace"), env(5, "snapshot")])).toBe(3);
    expect(lastLifeChangeSeq([env(1, "binding"), env(1.0001, "host"), env(2, "event")])).toBe(1.0001);
    expect(lastLifeChangeSeq([env(7, "closure")])).toBe(7);
  });

  it("recall bookkeeping alone changes nothing", () => {
    expect(lastLifeChangeSeq([env(1, "event"), env(2, "trace"), env(3, "snapshot")])).toBeNull();
    expect(lastLifeChangeSeq([])).toBeNull();
  });
});

describe("the card reads", () => {
  const key = "http://gw|nerin";
  it("on first show, and again when the life moved while shown", () => {
    expect(cardNeedsRead(null, key, null, true)).toBe(true);
    expect(cardNeedsRead({ key, revision: 10 }, key, 10, true)).toBe(false);
    expect(cardNeedsRead({ key, revision: 10 }, key, 12, true)).toBe(true);
  });

  it("never while hidden; catches up once shown", () => {
    expect(cardNeedsRead({ key, revision: 10 }, key, 12, false)).toBe(false);
    expect(cardNeedsRead(null, key, null, false)).toBe(false);
  });

  it("another entity is read afresh", () => {
    expect(cardNeedsRead({ key, revision: 10 }, "http://gw|castor", 10, true)).toBe(true);
  });
});

describe("card lines keep their identity across re-reads", () => {
  it("a line is keyed by its diary entry, else its words, uniquely per list", async () => {
    const { itemKey, itemKeys } = await import("./identity_card");
    expect(itemKey({ entry_id: "diary_1", statement: "x" }, 0)).toBe("e:diary_1");
    const before = itemKeys([{ entry_id: "diary_1" }, { entry_id: "diary_2" }]);
    const after = itemKeys([{ entry_id: "diary_0" }, { entry_id: "diary_1" }, { entry_id: "diary_2" }]);
    // an inserted question does not shift the others' identity
    expect(after.slice(1)).toEqual(before);
    expect(itemKeys(["same", "same"])).toEqual(["t:same", "t:same#1"]);
  });
});

describe("text a model or a page wrote never loads an image", () => {
  it("even a same-origin image (a diary record behind the session proxy) renders as a link", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { Words } = await import("./verbatim_view");
    const html = renderToStaticMarkup(React.createElement(Words, { text: "![x](api/gateway/entities/nerin/records/ex:diary-1/verbatim)", className: "t" }));
    expect(html).not.toContain("<img");
  });
});

describe("live envelopes merge by seq", () => {
  it("appends newer, inserts a late marker in order, drops duplicates, returns the same list when nothing is new", async () => {
    const { mergeEnvelopes } = await import("./stream_fold");
    const e = (seq: number) => ({ seq, family: "event", payload: {} }) as unknown as ReplayEnvelope;
    const held = [e(1), e(2), e(4)];
    const next = mergeEnvelopes(held, [e(5), e(2.0001), e(4), e(6)]);
    expect(next.map((x) => x.seq)).toEqual([1, 2, 2.0001, 4, 5, 6]);
    expect(held.map((x) => x.seq)).toEqual([1, 2, 4]); // the held list is never mutated
    expect(mergeEnvelopes(held, [e(2), e(4)])).toBe(held);
  });
});

describe("what he is doing now", () => {
  const env = (seq: number, family: string, extra: Record<string, unknown> = {}) =>
    ({ seq, family, observed_at: "2026-11-07T16:08:00+00:00", turn_id: null, payload: {}, display: {}, ...extra }) as unknown as ReplayEnvelope;
  it("a recall newer than the last moment means thinking; otherwise the last moment", async () => {
    const { nowState } = await import("./now_line");
    const episode = env(10, "binding", { turn_id: "t-0001", display: { kind: "episode", graph_id: "ex:episode-1" } });
    const recall = env(12, "trace", { payload: { need: { turn_id: "t-0002", participants: ["entity:nerin"] } } });
    expect(nowState([episode, recall])).toMatchObject({ kind: "thinking", turn: "t-0002", withSomeone: false });
    expect(nowState([recall, { ...episode, seq: 13 } as ReplayEnvelope])).toMatchObject({ kind: "moment", graphId: "ex:episode-1" });
    const visit = env(14, "trace", { payload: { need: { turn_id: "t-0001", participants: ["person:admin", "entity:nerin"] } } });
    expect(nowState([episode, visit])).toMatchObject({ kind: "thinking", withSomeone: true });
    expect(nowState([])).toEqual({ kind: "none" });
  });

  it("his lookups are counted in his rounds; a quoted older moment makes the count a floor", async () => {
    const { lookupWords, lookupsIn } = await import("./now_line");
    const plain = ["entity:nerin:", "cue", "", "nerin (thinking, unspoken):", "[used tool: web_search]", "[used tool: web_search]", "", "(what the tools returned:)", "[web_search] results", "", "nerin (thinking, unspoken):", "[used tool: fetch_url]", "", "(what the tools returned:)", "page", "", "nerin:", "My answer."].join("\n");
    expect(lookupWords(lookupsIn(plain, "nerin"))).toBe("2 web searches, 1 page read");
    const quoted = ["entity:nerin:", "cue", "", "nerin (thinking, unspoken):", "[used tool: read_memory]", "", "(what the tools returned:)", "[read_memory]", "Full words of memory #1:", "", "entity:nerin:", "old cue", "", "nerin (thinking, unspoken):", "[used tool: web_search]", "", "nerin:", "My answer."].join("\n");
    expect(lookupWords(lookupsIn(quoted, "nerin"))).toBe("at least 1 memory reread");
    expect(lookupWords({ items: [], partial: false })).toBe("no lookups");
  });
});

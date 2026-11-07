/**
 * The episode's Detail and the shared exchange layout, rendered (static
 * markup; the screens themselves are checked by the screenshot harness).
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { NodeState } from "./stream_fold";
import { parseLivedExchange } from "./episode_parse";
import { EpisodeBody, episodeSummary, HowHeGotThere, LivedExchangeView, lookupsFact, momentFact, momentTitle, notRunWords, speakerName } from "./episode_view";
import { cachedWordsAnswer, exchangeSpeakers, VerbatimTurns } from "./verbatim_view";
import { createFoldState } from "./stream_fold";
import { Inspector } from "./inspector";

const WEB = "Search results for: south asia inflation\n- ADB outlook\n  Inflation revised up to 5.7%.\n  (https://www.adb.org/outlook)\n- World Bank update\n  Growth slows to 6.3%.\n  (https://www.worldbank.org/sar)";
const OWN =
  "entity:nerin:\nyour own time continues\n\n" +
  "nerin (thinking, unspoken):\nI should check the regional figures.\n\n[used tool: web_search]\n[used tool: diary_read]\n[tool call ignored - too many this turn]\n\n" +
  `(what the tools returned:)\n[web_search]\n${WEB}\n\n[diary_read: content stays in your book/memory - reread with diary_read]\n\n` +
  "nerin:\nADB revised **inflation** up.";
const VISIT = "person:admin:\nHow are you?\n\nnerin:\nWell, thank you.";

function node(over: Partial<NodeState> = {}): NodeState {
  return {
    id: "row-1",
    graph_id: "ex:episode-0e1abd3555e77e963529a545ad",
    kind: "episode",
    title: "exchange: ADB attributes the weaker outlook and upward inflation revision to higher oil prices, freight…",
    token_estimate: 178,
    scope: "life",
    owner_id: "entity:nerin",
    first_seq: 48186,
    born_at: "2026-11-07T17:53:21Z",
    search_state: "indexed",
    prompt_state: "inactive",
    lifecycle: "inactive_candidate",
    source: "remember",
    selected_count: 3,
    last_selected_seq: null,
    last_admission: null,
    closed: null,
    entry_id: null,
    diary_type: null,
    diary: false,
    redacted: false,
    pinned: false,
    silenced: false,
    bookkeeping: false,
    maintenance: null,
    visit_id: null,
    signals: null,
    ...over,
  };
}

const facts = (extra: React.ReactNode) => <dl className="ei_facts">{extra}<dt>born</dt><dd>then</dd></dl>;

describe("the episode's Detail", () => {
  it("leads with what kind of moment it was, its lookups, the facts, then the summary, then the exchange", () => {
    const html = renderToStaticMarkup(<EpisodeBody node={node()} entity="nerin" state={{ phase: "ready", words: { text: OWN, note: null, turnId: "t-0006", born: false } }} renderFacts={facts} />);
    const order = ["A moment of his own time", "<dt>moment</dt><dd>his own time · tick 6</dd>", "<dt>lookups</dt><dd>2 — he searched the web once and read a diary entry · one more did not run</dd>", "<dt>born</dt>", "Summary", "ADB attributes the weaker outlook", "The exchange", "His own time began with", "nerin answered", "How he got there"];
    let at = -1;
    for (const piece of order) {
      const next = html.indexOf(piece);
      expect(next, piece).toBeGreaterThan(at);
      at = next;
    }
    expect(html).toContain("The title saved with the record (cut at 14 words when saved).");
    expect(html).toContain("The fuller summary arrives once this memory is recalled");
    expect(html).not.toContain("His one-line");
  });

  it("shows the record's full summary once a recall served it, in place of the title", () => {
    const digest = "person:admin: welcome to our world, how are you? nerin: Thank you—I'm here, attentive, and glad to meet you. How are you?";
    const html = renderToStaticMarkup(<EpisodeBody node={node({ digest })} entity="nerin" state={{ phase: "ready", words: { text: VISIT, note: null, turnId: "t-0001", born: false } }} renderFacts={facts} />);
    expect(html).toContain("Thank you—I&#x27;m here, attentive, and glad to meet you. How are you?");
    expect(html).toContain("The summary saved with the record, as it was saved.");
    expect(html).not.toContain("ADB attributes");
    expect(html).not.toContain("fuller summary arrives");
    expect(html.indexOf("Summary")).toBeLessThan(html.indexOf("The exchange"));
  });

  it("names who spoke the way the heading does", () => {
    const html = renderToStaticMarkup(<EpisodeBody node={node()} entity="nerin" state={{ phase: "ready", words: { text: VISIT, note: null, turnId: null, born: false } }} renderFacts={facts} />);
    expect(html).toContain("A conversation with admin");
    expect(html).toContain(">admin said<");
    expect(html).not.toContain("person:admin said");
  });

  it("shows only the facts the record gives while his words are read, and says why words are missing", () => {
    const loading = renderToStaticMarkup(<EpisodeBody node={node()} entity="nerin" state={{ phase: "loading" }} renderFacts={facts} />);
    expect(loading).toContain("A lived moment");
    expect(loading).not.toContain("<dt>moment</dt>");
    expect(loading).toContain("reading his words…");
    const none = renderToStaticMarkup(<EpisodeBody node={node()} entity="nerin" state={{ phase: "none", message: "No words are kept for this moment." }} renderFacts={facts} />);
    expect(none).toContain("No words are kept for this moment.");
  });

  it("names a conversation, a visit and a visit's start by who was there", () => {
    const visit = parseLivedExchange(VISIT, "nerin")!;
    expect(momentTitle(visit, false)).toBe("A conversation with admin");
    expect(momentTitle(visit, true)).toBe("A visit with admin");
    expect(momentFact(visit, true, "t-0002")).toBe("a visit · turn 2");
    expect(momentFact(visit, false, null)).toBe("a conversation");
    expect(lookupsFact(visit)).toBe("none — he answered without looking anything up");
    const door = parseLivedExchange("(the door):\nlaurent has arrived.\n\nnerin:\nWelcome.", "nerin")!;
    expect(momentTitle(door, false)).toBe("The start of a visit");
    expect(exchangeSpeakers(door)).toEqual([]);
    expect(exchangeSpeakers(visit)).toEqual(["person:admin"]);
    expect(exchangeSpeakers(parseLivedExchange(OWN, "nerin")!)).toEqual([]);
    expect(speakerName("entity:castor@4f2a")).toBe("castor");
  });

  it("says how honest the summary is", () => {
    expect(episodeSummary("exchange: one two three…")).toEqual({ text: "one two three…", cut: "words" });
    expect(episodeSummary("exchange: The commitment remains active.")).toEqual({ text: "The commitment remains active.", cut: null });
    expect(episodeSummary("Hello Mira — what did you look into with your tools recently, and would you c...")).toMatchObject({ cut: "short" });
    expect(episodeSummary("")).toEqual({ text: "", cut: null });
    // His words are Markdown: shown as such, not with their marks.
    const html = renderToStaticMarkup(<EpisodeBody node={node({ title: "exchange: The last things I remember are from **November 5**: - You asked me what…" })} entity="nerin" state={{ phase: "loading" }} renderFacts={facts} />);
    expect(html).toContain("<strong>November 5</strong>");
  });
});

describe("how he got there", () => {
  const ex = parseLivedExchange(OWN, "nerin")!;

  it("is folded by default, with the plain-words line and none of the raw markers", () => {
    const html = renderToStaticMarkup(<LivedExchangeView ex={ex} raw={OWN} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Before answering he searched the web once and read a diary entry. One lookup he asked for did not run.");
    expect(html).not.toContain("[used tool:");
    expect(html).not.toContain("(what the tools returned:)");
    expect(html).not.toContain("ADB outlook");
    expect(html).toContain("(…) the exact text, as saved");
    expect(html).toContain("<strong>inflation</strong>");
  });

  it("opens to his thinking set apart and each lookup in the turn panel's readable view", () => {
    const html = renderToStaticMarkup(<HowHeGotThere ex={ex} defaultOpen />);
    expect(html).toContain("What each one returned:");
    expect(html).toContain("His thinking, not said aloud");
    expect(html).toContain("I should check the regional figures.");
    expect(html).toContain("Searched the web for");
    expect(html).toContain("“south asia inflation”");
    expect(html).toMatch(/<ol class="tp_web">.*ADB outlook.*Inflation revised up to 5.7%.*adb.org.*World Bank update/s);
    expect(html).toContain("What it returned stays in his book and memory; it is not kept with this moment.");
    expect(html).toContain("One more lookup did not run: he had reached this turn&#x27;s limit.");
    expect(html).not.toContain("[used tool:");
  });

  it("is absent when he answered straight away", () => {
    expect(renderToStaticMarkup(<HowHeGotThere ex={parseLivedExchange(VISIT, "nerin")!} />)).toBe("");
  });

  it("says why a lookup did not run", () => {
    expect(notRunWords({ type: "not_run", name: "shell", reason: "refused" })).toBe("He asked for the tool shell, which is not available to him, so it did not run.");
    expect(notRunWords({ type: "not_run", name: "fetch_url", reason: "failed" })).toBe("He asked to use fetch_url without saying what to look up, so it did not run.");
  });
});

describe("the whole exchange wherever it is shown", () => {
  it("uses the same layout through VerbatimTurns", () => {
    const html = renderToStaticMarkup(<VerbatimTurns text={OWN} entity="nerin" />);
    expect(html).toContain("His own time began with");
    expect(html).toContain("How he got there");
    expect(html).not.toContain("thinking and lookups");
  });

  it("keeps other words as they were", () => {
    expect(renderToStaticMarkup(<VerbatimTurns text={"THEY SAID:\nhello\n\nI SAID:\nhi"} entity="mira" />)).toContain("THEY SAID:");
    expect(renderToStaticMarkup(<VerbatimTurns text={"(the door) is the door.\nplain words"} entity="nerin" />)).toContain("plain words");
  });
});

describe("a cached copy of a record's words", () => {
  it("answers when it keeps the turn, and a diary-shaped one always does (never read again)", () => {
    expect(cachedWordsAnswer(null, "ex:episode-1", "episode")).toBe(false);
    expect(cachedWordsAnswer({ text: "x", turn_id: "" }, "ex:episode-1", "episode")).toBe(true);
    expect(cachedWordsAnswer({ text: "x" }, "ex:episode-1", "episode")).toBe(false);
    expect(cachedWordsAnswer({ text: "x" }, "ex:diary-86444591", "episode")).toBe(true);
    expect(cachedWordsAnswer({ text: "x" }, "ex:memory-1", "diary")).toBe(true);
  });
});

describe("the Detail tab", () => {
  const detail = (n: NodeState, withSource = true) => {
    const fold = createFoldState();
    fold.nodes.set(n.id, n);
    return renderToStaticMarkup(
      <Inspector fold={fold} scrubSeq={99999} selectedId={n.id} onSelect={() => {}} verbatimSource={withSource ? { baseUrl: "http://gw", entity: "nerin" } : null} />,
    );
  };

  it("shows an episode as a lived moment, facts first", () => {
    const html = detail(node());
    expect(html).toContain("A lived moment");
    expect(html.indexOf("<dt>born</dt>")).toBeLessThan(html.indexOf("Summary"));
    expect(html.indexOf("Summary")).toBeLessThan(html.indexOf("The exchange"));
  });

  it("never treats a diary-shaped record as a moment to read, nor an exported file", () => {
    for (const html of [detail(node({ graph_id: "ex:diary-86444591ec14d1d97" })), detail(node({ diary: true }))]) {
      expect(html).not.toContain("The exchange");
      expect(html).toContain("His words in the book");
      expect(html).toContain("not read until you open them");
    }
    const exported = detail(node(), false);
    expect(exported).not.toContain("The exchange");
    expect(exported).toContain("The words as saved");
  });
});

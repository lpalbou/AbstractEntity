/**
 * A lived moment read in the runtime's own format. The fixtures are formed
 * the way abstractruntime identity/chat.py forms a turn (the verbatim
 * f-strings and `_at_rest_tool_results`, byte for byte), so a change in the
 * runtime's format shows up here as a broken fixture, not a silent guess.
 */
import { describe, expect, it } from "vitest";

import { askFromResult, howSentence, isDiaryShaped, isOwnSpeaker, lookupCounts, lookupsInWords, notRunCount, parseLivedExchange, readRoundWords, type Lookup } from "./episode_parse";

const BOOK = new Set(["diary_read", "diary_list", "search_memory"]);

/** chat.py `_at_rest_tool_results`. */
function atRest(elections: Array<[string, string]>): string {
  const parts: string[] = [];
  for (const [name, result] of elections) {
    if (BOOK.has(name)) {
      parts.push(`[${name}: content stays in your book/memory - reread with ${name}]`);
      continue;
    }
    if (result.trim()) parts.push(`[${name}]\n${result.trim()}`);
  }
  return parts.join("\n\n");
}

/** chat.py turn formation (6. FORM the turn). */
function form(speaker: string, userText: string, name: string, rounds: Array<{ phase: string; results?: string }>, reply: string): string {
  let v = `${speaker}:\n${userText}\n\n`;
  for (const r of rounds) {
    v += `${name} (thinking, unspoken):\n${r.phase}\n\n`;
    if (r.results && r.results.trim()) v += `(what the tools returned:)\n${r.results}\n\n`;
  }
  v += `${name}:\n${reply}`;
  return v;
}

const WEB_A = "Search results for: south asia inflation\n- ADB outlook\n  Inflation revised up to 5.7%.\n  (https://www.adb.org/outlook)";
const WEB_B = "Search results for: unicef stunting\n- JME 2025\n  56 million stunted children.\n  (https://data.unicef.org/jme/)";
const PAGE = "Fetched: https://example.org/report\nTitle: The report\n\nFirst paragraph.\n\nSecond paragraph.";

const ran = (r: { lookups: Lookup[] }) => r.lookups.filter((l): l is Extract<Lookup, { type: "ran" }> => l.type === "ran");

describe("a lived moment", () => {
  it("reads his own time: the cue, one round with his thinking and two searches, his answer", () => {
    const raw = form(
      "entity:nerin",
      "your own time continues",
      "nerin",
      [{ phase: "I should check the regional figures first.\n\n[used tool: web_search]\n[used tool: web_search]", results: atRest([["web_search", WEB_A], ["web_search", WEB_B]]) }],
      "ADB revised inflation up.",
    );
    const ex = parseLivedExchange(raw, "nerin")!;
    expect(ex.cueSpeaker).toBe("entity:nerin");
    expect(ex.ownTime).toBe(true);
    expect(ex.door).toBe(false);
    expect(ex.cue).toBe("your own time continues");
    expect(ex.rounds).toHaveLength(1);
    expect(ex.rounds[0].thinking).toBe("I should check the regional figures first.");
    expect(ran(ex.rounds[0]).map((l) => [l.name, l.returned, l.result])).toEqual([
      ["web_search", "text", WEB_A],
      ["web_search", "text", WEB_B],
    ]);
    expect(ex.rounds[0].unmatched).toBeNull();
    expect(ex.answerSpeaker).toBe("nerin");
    expect(ex.answer).toBe("ADB revised inflation up.");
    expect(ex.roundsText).toBe(raw.slice(raw.indexOf("nerin (thinking"), raw.lastIndexOf("\n\nnerin:")));
    expect(ex.reasoning).toBeNull();
  });

  it("reads a conversation with no lookups (no rounds, the speaker kept)", () => {
    const ex = parseLivedExchange(form("person:admin", "How are you?", "Ephemeral", [], "Well, thank you."), "Ephemeral")!;
    expect(ex.ownTime).toBe(false);
    expect(ex.cueSpeaker).toBe("person:admin");
    expect(ex.rounds).toEqual([]);
    expect(ex.roundsText).toBeNull();
    expect(ex.answer).toBe("Well, thank you.");
  });

  it("keeps rounds apart and pairs each result with its own lookup, an empty result kept as nothing", () => {
    const raw = form(
      "entity:nerin",
      "go on",
      "nerin",
      [
        { phase: "[used tool: web_search]\n[used tool: fetch_url]", results: atRest([["web_search", ""], ["fetch_url", PAGE]]) },
        { phase: "Now the second source.\n[used tool: web_search]", results: atRest([["web_search", WEB_B]]) },
      ],
      "Done.",
    );
    const ex = parseLivedExchange(raw, "nerin")!;
    expect(ex.rounds).toHaveLength(2);
    expect(ran(ex.rounds[0]).map((l) => [l.name, l.returned])).toEqual([
      ["web_search", "nothing"],
      ["fetch_url", "text"],
    ]);
    // A page keeps its blank lines; they do not end the result.
    expect(ran(ex.rounds[0])[1].result).toBe(PAGE);
    expect(ex.rounds[1].thinking).toBe("Now the second source.");
    expect(ran(ex.rounds[1])[0].result).toBe(WEB_B);
  });

  it("says a round whose results all came back empty returned nothing (the runtime writes no results head)", () => {
    const ex = parseLivedExchange(form("entity:nerin", "go on", "nerin", [{ phase: "[used tool: web_search]", results: atRest([["web_search", "  "]]) }], "Nothing found."), "nerin")!;
    expect(ran(ex.rounds[0]).map((l) => l.returned)).toEqual(["nothing"]);
  });

  it("marks a book tool's result as staying in his book, never as text", () => {
    const ex = parseLivedExchange(form("entity:nerin", "go on", "nerin", [{ phase: "[used tool: diary_read]\n[used tool: web_search]", results: atRest([["diary_read", "private words"], ["web_search", WEB_A]]) }], "ok"), "nerin")!;
    expect(ran(ex.rounds[0]).map((l) => [l.name, l.returned, l.result])).toEqual([
      ["diary_read", "in_book", ""],
      ["web_search", "text", WEB_A],
    ]);
  });

  it("names the lookups the door did not run", () => {
    const phase = "[used tool: web_search]\n[tool call refused: shell is not available]\n[tool call failed: fetch_url needs a body]\n[tool call ignored - too many this turn]";
    const ex = parseLivedExchange(form("entity:nerin", "go on", "nerin", [{ phase, results: atRest([["web_search", WEB_A]]) }], "ok"), "nerin")!;
    const r = ex.rounds[0];
    expect(r.thinking).toBe("");
    expect(r.lookups.filter((l) => l.type === "not_run")).toEqual([
      { type: "not_run", name: "shell", reason: "refused" },
      { type: "not_run", name: "fetch_url", reason: "failed" },
      { type: "not_run", name: null, reason: "ignored" },
    ]);
    expect(notRunCount(ex.rounds)).toBe(3);
  });

  it("never splits on the heads of an older moment that read_memory handed back", () => {
    const older = form("entity:nerin", "an older day", "nerin", [{ phase: "[used tool: web_search]", results: atRest([["web_search", WEB_B]]) }], "Older answer.");
    const result = `Full words of memory #71ec7934:\n${older}\norigin: formed 2026-11-07, lived conversation, during your own time`;
    const raw = form(
      "entity:nerin",
      "go on",
      "nerin",
      [
        { phase: "[used tool: read_memory]", results: atRest([["read_memory", result]]) },
        { phase: "[used tool: web_search]", results: atRest([["web_search", WEB_A]]) },
      ],
      "Now.",
    );
    const ex = parseLivedExchange(raw, "nerin")!;
    expect(ex.rounds).toHaveLength(2);
    expect(ran(ex.rounds[0]).map((l) => [l.name, l.result])).toEqual([["read_memory", result]]);
    expect(ran(ex.rounds[1]).map((l) => [l.name, l.result])).toEqual([["web_search", WEB_A]]);
    expect(ex.answer).toBe("Now.");
  });

  it("follows an older moment inside an older moment", () => {
    const oldest = form("entity:nerin", "oldest", "nerin", [{ phase: "[used tool: web_search]", results: atRest([["web_search", WEB_B]]) }], "Oldest answer.");
    const older = form("entity:nerin", "older", "nerin", [{ phase: "[used tool: read_memory]", results: atRest([["read_memory", `Full words of memory #aaaa1111:\n${oldest}`]]) }], "Older answer.");
    const result = `Full words of memory #bbbb2222:\n${older}`;
    const raw = form(
      "entity:nerin",
      "go on",
      "nerin",
      [
        { phase: "[used tool: read_memory]", results: atRest([["read_memory", result]]) },
        { phase: "[used tool: web_search]", results: atRest([["web_search", WEB_A]]) },
      ],
      "Now.",
    );
    const ex = parseLivedExchange(raw, "nerin")!;
    expect(ex.rounds).toHaveLength(2);
    expect(ran(ex.rounds[0])[0].result).toBe(result);
    expect(ran(ex.rounds[1])[0].result).toBe(WEB_A);
  });

  it("reads a cut older moment by the exact length its header names, even when its answer was cut away", () => {
    const older = form("entity:nerin", "older", "nerin", [{ phase: "[used tool: web_search]", results: atRest([["web_search", WEB_B]]) }], "Older answer that is long.");
    const cap = older.indexOf("\n\nnerin:\n") + 3; // the cut falls before the older answer's head
    const result = `Full words of memory #71ec7934 (first ${cap} of ${older.length} chars - the rest exists; ask again for the tail):\n${older.slice(0, cap)}\norigin: formed 2026-11-07, lived conversation`;
    const raw = form(
      "entity:nerin",
      "go on",
      "nerin",
      [
        { phase: "[used tool: read_memory]", results: atRest([["read_memory", result]]) },
        { phase: "[used tool: web_search]", results: atRest([["web_search", WEB_A]]) },
      ],
      "Now.",
    );
    const ex = parseLivedExchange(raw, "nerin")!;
    expect(ex.rounds).toHaveLength(2);
    expect(ran(ex.rounds[0])[0].result).toBe(result);
    expect(ran(ex.rounds[1])[0].result).toBe(WEB_A);
  });

  it("reads the older round head (no results were kept then)", () => {
    const raw = "person:admin:\nq?\n\nEphemeral (while looking things up):\n[used tool: web_search]\n\nEphemeral:\nanswer.";
    const ex = parseLivedExchange(raw, "Ephemeral")!;
    expect(ex.rounds).toHaveLength(1);
    expect(ran(ex.rounds[0]).map((l) => [l.name, l.returned])).toEqual([["web_search", "not_kept"]]);
    expect(ex.answer).toBe("answer.");
  });

  it("sets apart the reasoning older records kept after the answer", () => {
    const ex = parseLivedExchange("person:admin:\nHi.\n\nEphemeral:\nHi back.\n\n(thinking, unspoken)\nA warm greeting.", "Ephemeral")!;
    expect(ex.answer).toBe("Hi back.");
    expect(ex.reasoning).toBe("A warm greeting.");
  });

  it("knows a visit's announcement", () => {
    const ex = parseLivedExchange("(the door):\nlaurent has arrived.\n\nnerin:\nWelcome.", "nerin")!;
    expect(ex.door).toBe(true);
    expect(ex.ownTime).toBe(false);
    expect(ex.cue).toBe("laurent has arrived.");
  });

  it("is not a lived moment when the words are not shaped that way", () => {
    expect(parseLivedExchange("THEY SAID:\nhello\n\nI SAID:\nhi", "mira")).toBeNull();
    expect(parseLivedExchange("Just words in his book.", "nerin")).toBeNull();
    expect(parseLivedExchange("nerin:\nI said this first.", "nerin")).toBeNull();
    expect(parseLivedExchange("person:admin:\nno answer head here", "nerin")).toBeNull();
    expect(parseLivedExchange("person:admin:\nq\n\nnerin:\na", "")).toBeNull();
  });
});

describe("his own speaker (digest.py's self-prompted rule)", () => {
  it("is his name or entity:<name>, any case, without the @home suffix", () => {
    expect(isOwnSpeaker("entity:nerin", "nerin")).toBe(true);
    expect(isOwnSpeaker("entity:Nerin@4f2a", "nerin")).toBe(true);
    expect(isOwnSpeaker("NERIN", "nerin")).toBe(true);
    expect(isOwnSpeaker("person:admin", "nerin")).toBe(false);
    expect(isOwnSpeaker("entity:nerina", "nerin")).toBe(false);
  });
});

describe("the door's markers", () => {
  it("take every marker out of his words and keep his words", () => {
    const w = readRoundWords("First I look.\n[used tool: web_search]\n\n\n\nThen I read [used tool: fetch_url] it.");
    expect(w.ran).toEqual(["web_search", "fetch_url"]);
    expect(w.thinking).toBe("First I look.\n\nThen I read  it.");
  });
});

describe("in plain words", () => {
  const rounds = (names: string[]) => [{ thinking: "", unmatched: null, lookups: names.map((name) => ({ type: "ran" as const, name, result: "", returned: "nothing" as const })) }];

  it("counts by tool in the order each first ran", () => {
    expect(lookupCounts(rounds(["web_search", "fetch_url", "web_search"]))).toEqual([
      ["web_search", 2],
      ["fetch_url", 1],
    ]);
    expect(lookupsInWords([["web_search", 4]])).toBe("searched the web 4 times");
    expect(lookupsInWords([["web_search", 1], ["fetch_url", 2], ["read_memory", 1]])).toBe("searched the web once, read 2 web pages and read a memory in full");
    expect(lookupsInWords([["mystery_tool", 2]])).toBe("used mystery_tool 2 times");
    expect(lookupsInWords([])).toBe("");
  });

  it("says how he got there in one line", () => {
    expect(howSentence({ rounds: rounds(["web_search", "web_search", "web_search", "web_search"]), reasoning: null })).toBe("Before answering he searched the web 4 times.");
    const two = [...rounds(["web_search"]), ...rounds(["fetch_url"])];
    expect(howSentence({ rounds: two, reasoning: null })).toBe("Before answering he searched the web once and read a web page, over 2 passes.");
    expect(howSentence({ rounds: [{ thinking: "hm", unmatched: null, lookups: [{ type: "not_run", name: null, reason: "ignored" }] }], reasoning: null })).toBe(
      "Before answering he thought it through. One lookup he asked for did not run.",
    );
    expect(howSentence({ rounds: [], reasoning: "why" })).toBe("His private reasoning, not said aloud.");
  });

  it("reads what a lookup asked from its result's own head, never from guesses", () => {
    expect(askFromResult("web_search", WEB_A)).toEqual({ query: "south asia inflation" });
    expect(askFromResult("web_search", "No results found for: nothing here")).toEqual({ query: "nothing here" });
    expect(askFromResult("fetch_url", PAGE)).toEqual({ url: "https://example.org/report" });
    expect(askFromResult("fetch_url", "(could not read https://x.example/a: Empty response body)")).toEqual({ url: "https://x.example/a" });
    expect(askFromResult("read_memory", "Full words of memory #71ec7934:\nentity:nerin:")).toEqual({ tag: "#71ec7934" });
    expect(askFromResult("read_memory", "Full words of memory #71ec7934 (first 10000 of 30000 chars - the rest exists; ask again for the tail):\nx")).toEqual({ tag: "#71ec7934" });
    expect(askFromResult("web_search", "something else")).toBeNull();
    expect(askFromResult("list_files", "a\nb")).toBeNull();
  });
});

describe("a diary-shaped record", () => {
  it("is known by its flag, its kind or its id, never read on its own", () => {
    expect(isDiaryShaped({ diary: true, kind: "episode", graph_id: "ex:episode-1" })).toBe(true);
    expect(isDiaryShaped({ kind: "diary", graph_id: "ex:memory-1" })).toBe(true);
    expect(isDiaryShaped({ kind: "episode", graph_id: "ex:diary-86444591" })).toBe(true);
    expect(isDiaryShaped({ kind: "episode", graph_id: null, id: "diary-1" })).toBe(true);
    expect(isDiaryShaped({ kind: "episode", graph_id: "ex:episode-9d37bd91" })).toBe(false);
  });
});

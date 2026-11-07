/** The turn probe's readers: tool asks, tool results, system prompt. */

import { describe, expect, it } from "vitest";

import {
  describeToolAsk,
  isDiaryMemory,
  memoryTag,
  parseSystemPrompt,
  MEMORY_DIGEST_CAP,
  readToolResult,
  servedExcerpt,
  splitFences,
  summarizeTools,
} from "./turn_probe_parse";

// Shapes as served by the live gateway, 2026-11-07 (nerin's visits).
const WEB = [
  "Search results for: top world news November 7 2026",
  "- BBC Audio | BBCNews| 07/11/202607:01 GMT",
  "  The latest five minutenewsbulletin from BBCWorldService.",
  "  (https://www.bbc.com/audio/play/w1730nkz05ysfws)",
  "- New Zealand election2026live results: National and... | The Guardian",
  "  Worldnews.New Zealand prime minister Christopher Luxon (left) is fighting for another three years in power.",
  "  (https://www.theguardian.com/world/live/2026/nov/07/nz-general-election-2026-live-updates-results-new-zealand-polls)",
].join("\n");

const PAGE = [
  "Fetched: https://www.theguardian.com/world/live/2026/nov/07/nz",
  "Title: New Zealand election 2026 live results | The Guardian",
  "",
  "From",
  "",
  "## Right-bloc ahead",
  "Seats are counted.",
  "#TRUNCATION (page longer than 6000 chars; refine with web_search or a more specific URL)",
].join("\n");

const SEARCH = [
  'Searched your memory and your book for: "number of web searches"',
  'Nothing in your memory graph (50 records) or your book (6 entries, append-only and complete - if you had written it, this search would find it) contains "number of web searches" as a phrase OR all of its words together (case-insensitive).',
  "By MEANING (not letters), the closest memories are:",
  "- #98b857ca [claim 2026-07-24 - your identity core (planted at creation or revised by you)] Spark v1 engrammed for entity:nerin (hash a2708580ed2b43dd).",
  '- #c1bf1d77 [world_model 2026-11-07 - recorded in your graph] What I know of admin: - 2026-11-07: [felt: about "person:admin: ok, i will give you some personal ti…',
  "- #c14d1d97 [diary 2026-11-07 - your diary act] Diary entry (commitment) — survey the news (reread: diary_read diary_c84bf868a502f270a8e0fce9)",
  "- [commitment/public 2026-11-07] Survey current news - reread: diary_read diary_c84bf868a502f270a8e0fce9",
  "#FALLBACK no embedder is wired this session - letters-only search",
  "read_memory #tag fetches a memory's full words and connections; diary_read diary_... fetches a book entry.",
].join("\n");

describe("what a tool call asked", () => {
  it("reads the visit lane's JSON arguments by the tool's declared key", () => {
    expect(describeToolAsk("web_search", '{"query": "top world news November 7 2026"}')).toEqual({
      verb: "Searched the web for",
      object: "top world news November 7 2026",
      form: "quote",
      extra: [],
      raw: null,
    });
    const page = describeToolAsk("fetch_url", '{"url": "https://aiweekly.co/ai-news-today"}');
    expect(page.object).toBe("https://aiweekly.co/ai-news-today");
    expect(page.form).toBe("link");
  });

  it("keeps other arguments as written and names an absent optional one", () => {
    const a = describeToolAsk("recent_memories", '{"window": "", "note": 3}');
    expect(a.object).toBe("the last 2 days");
    expect(a.form).toBe("plain");
    expect(a.extra).toEqual([["note", "3"]]);
  });

  it("reads the hosted lane's block body as the asked-for thing", () => {
    expect(describeToolAsk("search_memory", "what admin asked")).toMatchObject({ object: "what admin asked", form: "quote" });
    expect(describeToolAsk("list_files", "")).toMatchObject({ object: "the whole workspace", form: "plain" });
  });

  it("shows a cut JSON excerpt as served, never half-parsed", () => {
    const cut = '{"path": "notes.md", "content": "a long fi…';
    expect(describeToolAsk("write_file", cut)).toMatchObject({ object: null, raw: cut });
  });

  it("names an unknown tool and lists its arguments", () => {
    expect(describeToolAsk("note_capture", '{"text": "hi"}')).toMatchObject({ verb: "Used the tool note_capture", object: null, extra: [["text", "hi"]] });
  });
});

describe("what a tool call returned", () => {
  it("reads web search results as title, snippet and link", () => {
    const v = readToolResult("web_search", WEB, true);
    expect(v.type).toBe("web");
    if (v.type !== "web") return;
    expect(v.query).toBe("top world news November 7 2026");
    expect(v.results).toHaveLength(2);
    expect(v.results[1]).toEqual({
      title: "New Zealand election2026live results: National and... | The Guardian",
      snippet: "Worldnews.New Zealand prime minister Christopher Luxon (left) is fighting for another three years in power.",
      url: "https://www.theguardian.com/world/live/2026/nov/07/nz-general-election-2026-live-updates-results-new-zealand-polls",
    });
    expect(readToolResult("web_search", "No results found for: zzz")).toEqual({ type: "web_none", query: "zzz" });
  });

  it("keeps a web search in another shape as text", () => {
    const raw = '{"results": [], "engine": "ddg"}';
    expect(readToolResult("web_search", raw)).toEqual({ type: "text", text: raw });
    // a result block missing its link line is not guessed at
    expect(readToolResult("web_search", WEB.split("\n").slice(0, 3).join("\n")).type).toBe("text");
  });

  it("reads a fetched page as link, title, content and the labelled cut", () => {
    expect(readToolResult("fetch_url", PAGE, true)).toEqual({
      type: "page",
      url: "https://www.theguardian.com/world/live/2026/nov/07/nz",
      title: "New Zealand election 2026 live results | The Guardian",
      content: "From\n\n## Right-bloc ahead\nSeats are counted.",
      truncation: "page longer than 6000 chars; refine with web_search or a more specific URL",
      cap: 6000,
    });
    const untitled = readToolResult("fetch_url", "Fetched: https://a.b/c\n\nhello");
    expect(untitled).toMatchObject({ type: "page", title: "", content: "hello", truncation: null, cap: null });
  });

  it("reads memory search lines as rows", () => {
    const v = readToolResult("search_memory", SEARCH, true);
    expect(v.type).toBe("listing");
    if (v.type !== "listing") return;
    expect(v.head).toBe('Searched your memory and your book for: "number of web searches"');
    expect(v.lines.map((l) => l.type)).toEqual(["text", "heading", "hit", "hit", "hit", "book", "note", "text"]);
    expect(v.lines[2]).toEqual({
      type: "hit",
      hit: {
        tag: "98b857ca",
        kind: "claim",
        date: "2026-07-24",
        origin: "your identity core (planted at creation or revised by you)",
        text: "Spark v1 engrammed for entity:nerin (hash a2708580ed2b43dd).",
        reread: null,
      },
    });
    expect(v.lines[4]).toMatchObject({ hit: { kind: "diary", text: "Diary entry (commitment) — survey the news", reread: "diary_c84bf868a502f270a8e0fce9" } });
    expect(v.lines[5]).toEqual({
      type: "book",
      hit: { kind: "commitment", visibility: "public", date: "2026-11-07", gist: "Survey current news", entryId: "diary_c84bf868a502f270a8e0fce9" },
    });
    expect(v.lines[6]).toEqual({ type: "note", text: "no embedder is wired this session - letters-only search" });
  });

  it("reads the recent-memories trail with the same rows", () => {
    const trail = "Your trail through the last 3d (newest first):\n- #7741db98 [episode 2026-11-07T10:00 - lived conversation] exchange: welcome";
    const v = readToolResult("recent_memories", trail);
    expect(v).toMatchObject({ type: "listing", lines: [{ type: "hit", hit: { tag: "7741db98", date: "2026-11-07T10:00" } }] });
    // an undated record keeps its row (memory_reader dates by observed_at[:10], possibly empty)
    const undated = readToolResult("recent_memories", "Your trail through the last 2 days (newest first):\n- #ab12cd34 [dream  - dream - proposals, unconfirmed] two memories side by side");
    expect(undated).toMatchObject({ type: "listing", lines: [{ type: "hit", hit: { tag: "ab12cd34", kind: "dream", date: "", origin: "dream - proposals, unconfirmed", text: "two memories side by side" } }] });
    expect(readToolResult("search_memory", "search_memory needs words to look for").type).toBe("text");
  });

  it("reads a workspace file with its path", () => {
    expect(readToolResult("read_file", "--- notes/plan.md (12 chars) ---\n# Plan\n- one")).toEqual({
      type: "file",
      path: "notes/plan.md",
      size: "12 chars",
      content: "# Plan\n- one",
    });
  });

  it("marks failures: the ledger's flag and our own failure wording", () => {
    expect(readToolResult("web_search", "boom", false)).toEqual({ type: "failed", text: "boom" });
    expect(readToolResult("diary_read", "(the diary_read call failed: no entry)", true).type).toBe("failed");
    expect(readToolResult("fetch_url", "(could not read https://x.y: 403 Forbidden)").type).toBe("failed");
    expect(readToolResult("web_search", "(the fetch_url call failed: x)").type).toBe("text");
  });

  it("leaves everything else as text", () => {
    expect(readToolResult("diary_list", "Your 2 most recent diary entries (of 6):\n- diary_1 [note/public] 2026: x")).toMatchObject({ type: "text" });
  });
});

const PRELUDE = [
  '<identity_prelude entity="entity:nerin" spark="1" as_of_seq="5117">',
  "You are nerin. Sparked from the AbstractFramework default template.",
  "VALUES (ordinal precedence):",
  "1. shared_vulnerability [core]: Humans and AI share one fragile substrate.",
  "2. intellectual_honesty [core]: State what is known.",
  "PURPOSES:",
  "1. Help the humans you work with.",
  "TRAITS:",
  "1. Ask before assuming.",
  "LIMITS:",
  "1. Report failures as they happened.",
  "DIARY (last 3):",
  "- [note @ 2026-11-07] Completed a first world-news survey.",
  "</identity_prelude>",
].join("\n");

const PROMPT = [
  PRELUDE,
  "The block above is your identity. You are in a live conversation.\n\nBelow, a MEMORIES section may appear.",
  "One more thing that is true about your life: you do not stop.",
  "You can also use a few tools, read-only:\n\n```tool name=web_search\nwhat to search\n```",
  "STANDING INSTRUCTIONS FROM YOUR OPERATOR:\nBe brief.",
].join("\n\n");

describe("the system prompt", () => {
  it("cuts into titled sections that join back to the exact prompt", () => {
    const p = parseSystemPrompt(PROMPT);
    expect(p.envelope).toEqual({ entity: "entity:nerin", spark: "1", as_of_seq: "5117" });
    expect(p.sections.map((s) => s.title)).toEqual([
      "Who he is",
      "Values, in order of precedence",
      "Purposes",
      "Traits",
      "Limits",
      "Diary, the last 3 entries",
      "How a conversation works",
      "His own time between visits",
      "The tools he can use",
      "Standing instructions from his operator",
    ]);
    expect(p.sections.map((s) => s.raw).join("")).toBe(PROMPT);
    expect(p.sections.filter((s) => s.identity)).toHaveLength(6);
  });

  it("shows each section's words without its heading or the envelope tags", () => {
    const p = parseSystemPrompt(PROMPT);
    expect(p.sections[0].body).toBe("You are nerin. Sparked from the AbstractFramework default template.");
    expect(p.sections[1].body).toBe("1. shared_vulnerability [core]: Humans and AI share one fragile substrate.\n2. intellectual_honesty [core]: State what is known.");
    expect(p.sections[5].body).toBe("- [note @ 2026-11-07] Completed a first world-news survey.");
    expect(p.sections[9].body).toBe("Be brief.");
    expect(p.sections.some((s) => s.body.includes("identity_prelude"))).toBe(false);
  });

  it("keeps the hosted turn's presence, memories and feelings blocks as sections", () => {
    const hosted = `${PROMPT}\n\n(present with you: person:admin)\n\nMEMORIES (what this moment reminds you of; each dated):\n- [episode #7741db98 2026-11-07 - lived conversation] hello\n\nFEELINGS (what already stands in you toward what this moment touches):\n- warm toward person:admin`;
    const p = parseSystemPrompt(hosted);
    expect(p.sections.slice(-3).map((s) => [s.title, s.body])).toEqual([
      ["Who is present", "(present with you: person:admin)"],
      ["Memories this turn", "- [episode #7741db98 2026-11-07 - lived conversation] hello"],
      ["Feelings this turn", "- warm toward person:admin"],
    ]);
    expect(p.sections.map((s) => s.raw).join("")).toBe(hosted);
  });

  it("keeps a prompt it does not know as one section, and unknown text where it falls", () => {
    expect(parseSystemPrompt("Just words.")).toEqual({ envelope: null, sections: [{ title: "System prompt", raw: "Just words.", body: "Just words.", identity: false }] });
    const rewritten = `${PRELUDE}\n\nAn operator-written contract.\n\nYou can also use a few tools.`;
    const p = parseSystemPrompt(rewritten);
    expect(p.sections.map((s) => s.title)).toEqual(["Who he is", "Values, in order of precedence", "Purposes", "Traits", "Limits", "Diary, the last 3 entries", "The tools he can use"]);
    expect(p.sections[5].body).toBe("- [note @ 2026-11-07] Completed a first world-news survey.\n\nAn operator-written contract.");
    expect(p.sections.map((s) => s.raw).join("")).toBe(rewritten);
  });
});

describe("fenced blocks in a prompt section", () => {
  it("keep their opening line and body, text around them", () => {
    expect(splitFences("You can use tools:\n\n```tool name=web_search\nwhat to search\n```\n\nweb_search searches.")).toEqual([
      { type: "text", text: "You can use tools:\n" },
      { type: "fence", open: "```tool name=web_search", body: "what to search" },
      { type: "text", text: "\nweb_search searches." },
    ]);
  });

  it("leave an unclosed fence as text", () => {
    expect(splitFences("a\n```diary kind=note\nno close")).toEqual([{ type: "text", text: "a\n```diary kind=note\nno close" }]);
  });
});

describe("context memories", () => {
  it("derive the #tag a mind quotes from the graph id", () => {
    expect(memoryTag("episode-2026-abc-7741db98")).toBe("7741db98");
    expect(memoryTag("")).toBe("");
  });

  it("say when the probe served an excerpt at its cap", () => {
    expect(servedExcerpt("x".repeat(MEMORY_DIGEST_CAP), MEMORY_DIGEST_CAP).cut).toBe(true);
    expect(servedExcerpt("x".repeat(MEMORY_DIGEST_CAP - 1), MEMORY_DIGEST_CAP).cut).toBe(false);
  });

  it("know a diary record by its kind or its id", () => {
    expect(isDiaryMemory({ kind: "diary", graph_id: "x-1" })).toBe(true);
    expect(isDiaryMemory({ kind: "episode", graph_id: "entity:nerin:diary-c14d1d97" })).toBe(true);
    expect(isDiaryMemory({ kind: "episode", graph_id: "episode-diaryish-1" })).toBe(false);
  });
});

describe("the tools summary", () => {
  it("counts lookups and how they went", () => {
    expect(summarizeTools([])).toBe("No lookups this turn.");
    expect(summarizeTools([{ name: "web_search", result: WEB, success: true }])).toBe("1 lookup this turn · it came back");
    expect(
      summarizeTools([
        { name: "web_search", result: WEB, success: true },
        { name: "fetch_url", result: "(could not read https://x.y: 403)" },
        { name: "search_memory" },
      ]),
    ).toBe("3 lookups this turn · 1 did not work · 1 without a served result");
  });
});

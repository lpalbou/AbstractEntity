/** The turn probe's readings, rendered (static markup; the package ships
 * no DOM for tests — the screens are driven by the screenshot harness). */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ count: 0 }));
vi.mock("./verbatim_view", async (importActual) => ({
  ...(await importActual<typeof import("./verbatim_view")>()),
  readRecordWords: () => {
    reads.count += 1;
    return Promise.resolve({ text: "", note: null });
  },
  VerbatimTurns: () => null,
}));

import { TurnDetailModal } from "./turn_detail_modal";
import { ContextMemory, memoryActionLabel, SystemPromptView, ToolCall } from "./turn_probe_views";

const SOURCE = { baseUrl: "http://gw", entity: "nerin" };
const WEB = "Search results for: news\n- One | A\n  first snippet\n  (https://a.example/1)\n- Two\n  second\n  (https://b.example/2)";

describe("a context memory", () => {
  it("offers its full words, and a diary record only behind a click that says it is recorded", () => {
    const episode = renderToStaticMarkup(<ContextMemory m={{ kind: "episode", graph_id: "ex:episode-abc7741db98", title: "exchange", digest: "hello" }} source={SOURCE} />);
    expect(episode).toContain("(…) his full words");
    expect(episode).toContain("#7741db98");
    const diary = renderToStaticMarkup(<ContextMemory m={{ kind: "episode", graph_id: "ex:diary-86444591ec14d1d97", title: "Diary entry" }} source={SOURCE} />);
    expect(diary).toContain("open the diary entry — opening it is recorded in his biography");
    expect(reads.count).toBe(0);
  });

  it("marks a digest served at the probe's cap as cut, and says when there is no address", () => {
    const cut = renderToStaticMarkup(<ContextMemory m={{ kind: "episode", graph_id: "g-1", digest: "x".repeat(280) }} source={SOURCE} />);
    expect(cut).toContain("x".repeat(280) + "…");
    const none = renderToStaticMarkup(<ContextMemory m={{ kind: "episode", digest: "short" }} source={SOURCE} />);
    expect(none).toContain("no record address");
    expect(none).not.toContain("short…");
  });
});

describe("the diary open button", () => {
  it("says a read is recorded unless this browser already holds the words", () => {
    expect(memoryActionLabel({ diary: true, cached: null, phase: "idle", shown: false })).toBe("(…) open the diary entry — opening it is recorded in his biography");
    expect(memoryActionLabel({ diary: true, cached: false, phase: "idle", shown: false })).toBe("(…) open the diary entry — opening it is recorded in his biography");
    expect(memoryActionLabel({ diary: true, cached: true, phase: "idle", shown: false })).toBe("(…) open the diary entry — already opened in this browser — no new read is recorded");
    expect(memoryActionLabel({ diary: true, cached: null, phase: "error", shown: true })).toBe("try again — opening it is recorded in his biography");
    expect(memoryActionLabel({ diary: false, cached: null, phase: "error", shown: true })).toBe("try again");
    expect(memoryActionLabel({ diary: true, cached: null, phase: "ready", shown: true })).toBe("fold");
    expect(memoryActionLabel({ diary: false, cached: null, phase: "idle", shown: false })).toBe("(…) his full words");
  });
});

// A same-origin image in a page, a tool result or the prompt would be
// fetched through the cookie-authenticated proxy: a diary record read,
// recorded in his biography. No image may ever load.
const DIARY_IMG = "![x](api/gateway/entities/nerin/records/ex:diary-86444591/verbatim)";

describe("no image ever loads", () => {
  it("in a fetched page", () => {
    const html = renderToStaticMarkup(<ToolCall t={{ name: "fetch_url", arg: '{"url": "https://a.b/c"}', result: `Fetched: https://a.b/c\nTitle: T\n\nbefore ${DIARY_IMG} after` }} />);
    expect(html).toContain("before");
    expect(html).not.toContain("<img");
  });

  it("in any other tool result", () => {
    const html = renderToStaticMarkup(<ToolCall t={{ name: "read_memory", arg: "#86444591", result: `Full words of memory #86444591:\n${DIARY_IMG}` }} />);
    expect(html).toContain("Full words of memory");
    expect(html).not.toContain("<img");
  });

  it("in a prompt section", () => {
    const html = renderToStaticMarkup(<SystemPromptView prompt={`<identity_prelude entity="e" spark="1" as_of_seq="1">\nYou are nerin. ${DIARY_IMG}\n</identity_prelude>`} />);
    expect(html).toContain("You are nerin.");
    expect(html).not.toContain("<img");
  });
});

describe("a tool call", () => {
  it("that returned nothing says so, without a success mark", () => {
    const html = renderToStaticMarkup(<ToolCall t={{ name: "web_search", arg: "x", result: "" }} />);
    expect(html).toContain("no result");
    expect(html).not.toContain("✓");
  });

  it("reads a web search as a sentence and a list of linked results", () => {
    const html = renderToStaticMarkup(<ToolCall t={{ name: "web_search", arg: '{"query": "news"}', result: WEB, success: true }} />);
    expect(html).toContain("Searched the web for");
    expect(html).toContain("“news”");
    expect(html).toContain("2 results");
    expect((html.match(/<li class="tp_web_item">/g) ?? []).length).toBe(2);
    expect(html).toContain('href="https://a.example/1" target="_blank" rel="noopener noreferrer"');
    expect(html).not.toContain("<pre");
  });

  it("makes a failure obvious and shows its words", () => {
    const html = renderToStaticMarkup(<ToolCall t={{ name: "fetch_url", arg: '{"url": "https://x.y"}', result: "403 Forbidden", success: false }} />);
    expect(html).toContain("tp_tool_failed");
    expect(html).toContain("It did not work");
    expect(html).toContain("403 Forbidden");
  });

  it("never links a non-web address", () => {
    const html = renderToStaticMarkup(<ToolCall t={{ name: "fetch_url", arg: "javascript:alert(1)", result: "(fetch_url needs an http(s) URL)" }} />);
    expect(html).not.toContain('href="javascript');
  });
});

describe("the system prompt", () => {
  const PROMPT = '<identity_prelude entity="entity:nerin" spark="1" as_of_seq="9">\nYou are nerin.\nVALUES (ordinal precedence):\n1. honesty [core]: say what is.\n</identity_prelude>\n\nYou can also use a few tools:\n\n```tool name=web_search\nwhat to search\n```';

  it("opens his identity and folds the framework's paragraphs", () => {
    const html = renderToStaticMarkup(<SystemPromptView prompt={PROMPT} />);
    expect(html).toContain("Who he is");
    expect(html).toContain("Values, in order of precedence");
    expect(html).toContain("honesty [core]: say what is.");
    expect(html).toContain("The tools he can use");
    expect(html).not.toContain("tool name=web_search");
    expect(html).not.toContain("identity_prelude entity");
  });
});

describe("the modal", () => {
  it("says what a rejoined turn does not carry instead of claiming nothing entered", () => {
    const html = renderToStaticMarkup(
      <TurnDetailModal turn={{ reply: "x", tools_ran: ["web_search"], tool_details: [{ name: "web_search", result: WEB }] }} entityName="Nerin" source={SOURCE} onClose={() => undefined} />,
    );
    expect(html).toContain("not served here");
    expect(html).not.toContain("No memories beyond his identity core");
  });
});

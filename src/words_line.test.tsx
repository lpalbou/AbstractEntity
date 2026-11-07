/** Every text through the shared renderer (operator ruling 2026-11-07):
 * the one-line wrapper, the link-click guard for clickable rows, the rule
 * that only `Words` reaches panel-chat's Markdown, and the converted
 * surfaces rendering Markdown instead of showing its markers. Static markup
 * (the package ships no DOM for tests). */
import React from "react";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatMessageList } from "./chat_message_list";
import { LedgerPanel } from "./ledger_panel";
import { LessonsPanel, WorldPanel } from "./lessons_world_panels";
import { NowLine } from "./now_line";
import type { FoldState, NodeState } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { NO_IMAGE } from "./verbatim_view";
import { fromLink, NO_IMAGE_PROPS, WordsLine } from "./words_line";

const BOLD = "I have **not yet opened** the reports";

describe("a short text", () => {
  it("renders through the shared renderer: Markdown drawn, no marker left", () => {
    const html = renderToStaticMarkup(<WordsLine text={BOLD} />);
    expect(html).toContain('class="pc-md wl_line"');
    expect(html).toContain("<strong>not yet opened</strong>");
    expect(html).not.toContain("**");
  });

  it("flows in its line when inline, and keeps an extra class", () => {
    const html = renderToStaticMarkup(<WordsLine text="*his* words" inline className="x_title" />);
    expect(html).toContain('class="pc-md wl_inline x_title"');
    expect(html).toContain("<em>his</em> words");
  });

  it("never loads an image, not even a same-origin one", () => {
    const html = renderToStaticMarkup(<WordsLine text="see ![x](api/gateway/entities/nerin/records/ex:diary-1/verbatim)" />);
    expect(html).not.toContain("<img");
    expect(html).toContain("image: x");
  });

  it("is never cut: the whole text reaches the renderer", () => {
    const long = "word ".repeat(400).trim();
    expect(renderToStaticMarkup(<WordsLine text={long} />)).toContain(long);
  });
});

describe("a click on a link inside a clickable row", () => {
  it("is the link's alone", () => {
    expect(fromLink({ target: { closest: (sel: string) => (sel === "a[href]" ? {} : null) } as unknown as EventTarget })).toBe(true);
  });

  it("is the row's when it landed elsewhere", () => {
    expect(fromLink({ target: { closest: () => null } as unknown as EventTarget })).toBe(false);
    expect(fromLink({ target: null })).toBe(false);
    // A text node has no closest(): never a link.
    expect(fromLink({ target: {} as EventTarget })).toBe(false);
  });
});

const SRC = resolve(__dirname);
const SOURCES = readdirSync(SRC)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(resolve(SRC, f), "utf8") }));

/** Every kit component that draws Markdown itself (panel-chat and its
 * vendored copies): each use must carry the no-image rule. */
const KIT_RENDERERS = ["Markdown", "ChatMessageCard", "ChatMessageContent", "ChatThread", "AvatarConversation", "WorkflowChat", "AssistantPanel", "DocsAssistantPanel", "DocsAssistantPanelContent", "AfFileViewer", "ArtifactPreviewModal", "AutomationPanelWithMarkdown"];
/** Kit functions that build such components: never called by the app. */
const KIT_BUILDERS = ["renderAutomationTurn", "renderAutomationText", "assistantDrawerPanel", "docsAssistantPanel"];

/** The JSX opening tag starting at `at` (`<Name …>` or `<Name … />`). */
function openingTag(text: string, at: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = at + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return text.slice(at, i + 1);
  }
  return text.slice(at);
}

function usesOf(name: string): Array<{ file: string; tag: string }> {
  const out: Array<{ file: string; tag: string }> = [];
  for (const { file, text } of SOURCES) {
    for (const m of text.matchAll(new RegExp(`<${name}\\b`, "g"))) out.push({ file, tag: openingTag(text, m.index ?? 0) });
  }
  return out;
}

describe("no image in any text is ever loaded", () => {
  it("only Words imports panel-chat's Markdown", () => {
    const offenders = SOURCES.filter(({ file, text }) => file !== "verbatim_view.tsx" && /import\s*\{[^}]*\bMarkdown\b[^}]*\}\s*from\s*["']@abstractframework\/panel-chat["']/.test(text)).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("every kit component that draws Markdown carries the rule", () => {
    const missing: string[] = [];
    let seen = 0;
    for (const name of KIT_RENDERERS) {
      for (const { file, tag } of usesOf(name)) {
        seen++;
        const ruled = name === "Markdown" ? /images="link"/.test(tag) && /inlineImage=\{NO_IMAGE\}/.test(tag) : /\.\.\.NO_IMAGE_PROPS\b/.test(tag);
        if (!ruled) missing.push(`${file}: <${name}`);
      }
    }
    expect(missing).toEqual([]);
    // Words itself, the chat list and the avatar conversation at least.
    expect(seen).toBeGreaterThanOrEqual(3);
    for (const name of KIT_BUILDERS) expect(SOURCES.filter(({ text }) => new RegExp(`\\b${name}\\(`).test(text)).map((s) => s.file)).toEqual([]);
  });

  it("the rule is Words' rule", () => {
    expect(NO_IMAGE_PROPS).toEqual({ images: "link", inlineImage: NO_IMAGE });
  });

  it("no image loads in the chat, his replies or a visitor's message", () => {
    const html = renderToStaticMarkup(
      <ChatMessageList
        messages={[
          { id: "a", role: "assistant", content: "here ![his](api/gateway/entities/nerin/records/ex:diary-1/verbatim)" },
          { id: "u", role: "user", content: "look ![mine](https://example.com/a.png)" },
          { id: "s", role: "system", content: "**Rejoined** the open visit" },
        ]}
        onDetail={() => undefined}
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("image: his");
    expect(html).toContain("image: mine");
    expect(html).toContain("<strong>Rejoined</strong>");
  });

  it("the Docs assistant is the one known gap: its kit drawer takes no image rule (yet)", () => {
    // The vendored DocsAssistantDrawer passes no images/messageProps to its
    // cards, so a same-origin image in a docs answer loads (kit gap, raised
    // for abstractuic). The day the kit accepts one, this fails: pass it.
    const dts = readFileSync(resolve(SRC, "vendor/abstractdocs/docs_assistant.d.ts"), "utf8");
    const props = dts.slice(dts.indexOf("export type DocsAssistantChatProps"), dts.indexOf("export declare function DocsAssistantDrawer"));
    expect(props).not.toMatch(/\b(images|inlineImage|messageProps)\?:/);
    expect(usesOf("DocsAssistantDrawer").map((u) => u.file)).toEqual(["entity_view.tsx"]);
  });
});

function env(seq: number, family: string, payload: Record<string, unknown>, display: Record<string, unknown>, extra: Partial<ReplayEnvelope> = {}): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family,
    observed_at: "2026-11-07T16:14:00+00:00",
    scope: "life",
    owner_id: "entity:nerin",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload,
    display,
    ...extra,
  } as ReplayEnvelope;
}

const MOMENT = env(5, "binding", { source: "remember", record_id: "ex:episode-1" }, { kind: "episode", title: `exchange: ${BOLD}`, graph_id: "ex:episode-1" });

describe("the ledger", () => {
  it("renders a row's words as Markdown", () => {
    const html = renderToStaticMarkup(<LedgerPanel envelopes={[MOMENT]} scrubIndex={0} onJump={() => undefined} onSelectSubject={() => undefined} showQuiet={false} onToggleQuiet={() => undefined} />);
    expect(html).toContain("He lived a moment");
    expect(html).toContain("<strong>not yet opened</strong>");
    expect(html).not.toContain("**not yet");
  });
});

describe("the Now line", () => {
  it("says what he is doing through the renderer", () => {
    // A turn that began a minute ago (past an hour it is no longer "thinking").
    const recall = env(6, "trace", { need: { turn_id: "t-3", participants: ["entity:nerin", "person:admin"] } }, {}, { observed_at: new Date(Date.now() - 60_000).toISOString() });
    const html = renderToStaticMarkup(<NowLine envelopes={[MOMENT, recall]} live source={null} onOpen={() => undefined} />);
    // The sentence itself is the renderer's paragraph, its emphasis drawn.
    expect(html).toMatch(/<p class="pc-md_p"><strong>Thinking<\/strong> — [^<]*, since \d\d:\d\d UTC/);
  });
});

function node(id: string, kind: string, title: string, extra: Partial<NodeState> = {}): NodeState {
  return { id, kind, title, born_at: "2026-11-07T10:00:00Z", first_seq: 1, selected_count: 0, bookkeeping: false, closed: null, redacted: false, graph_id: id, ...extra } as unknown as NodeState;
}

describe("Lessons and World", () => {
  it("render a lesson's and a card's words as Markdown", () => {
    const fold = {
      nodes: new Map<string, NodeState>([
        ["l1", node("l1", "lesson", "lesson: check the **primary** page first")],
        ["w1", node("w1", "world_model", "World model: the *Africa CDC* reports")],
        ["s1", node("s1", "episode", "a source")],
      ]),
      structural_edges: new Map([["e1", { source_graph_id: "w1", target_graph_id: "s1", relation: "derived_from" }]]),
      graph_to_row: new Map<string, string>(),
    } as unknown as FoldState;
    const lessons = renderToStaticMarkup(<LessonsPanel fold={fold} onSelect={() => undefined} />);
    expect(lessons).toContain("<strong>primary</strong>");
    const world = renderToStaticMarkup(<WorldPanel fold={fold} onSelect={() => undefined} />);
    expect(world).toContain("<em>Africa CDC</em>");
    expect(world).not.toContain("*Africa");
  });
});

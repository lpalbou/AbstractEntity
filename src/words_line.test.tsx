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

import { LedgerPanel } from "./ledger_panel";
import { LessonsPanel, WorldPanel } from "./lessons_world_panels";
import { NowLine } from "./now_line";
import type { FoldState, NodeState } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { fromLink, WordsLine } from "./words_line";

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

describe("only Words reaches panel-chat's Markdown", () => {
  it("no other source file imports it (Words is where images are refused)", () => {
    const dir = resolve(__dirname);
    const offenders = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== "verbatim_view.tsx")
      .filter((f) => /import\s*\{[^}]*\bMarkdown\b[^}]*\}\s*from\s*["']@abstractframework\/panel-chat["']/.test(readFileSync(resolve(dir, f), "utf8")));
    expect(offenders).toEqual([]);
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

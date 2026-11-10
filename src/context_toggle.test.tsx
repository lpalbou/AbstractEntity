/**
 * The graph toolbar's "Context" toggle (operator 2026-11-08): a kit toggle
 * chip labelled by what it shows, pressed = the recall highlight is on the
 * graph, disabled with a hint before any recall. Rendered with
 * react-dom/server (the package ships no DOM for tests); the wiring that
 * makes it the ONE control of the highlight is pinned on the source.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findVerbToggleLabels } from "@abstractframework/ui-kit";
import { describe, expect, it } from "vitest";

import { ContextToggle } from "./context_toggle";
import { CONTEXT_HINT_NONE, CONTEXT_TITLE, contextToggleView } from "./recall_emphasis";

const button = (html: string) => html.match(/<button[^>]*>/)![0];

describe("ContextToggle", () => {
  it("is labelled by what it shows, and its pressed state is the feature on", () => {
    const on = renderToStaticMarkup(<ContextToggle view={contextToggleView("ready", true)} onToggle={() => {}} />);
    expect(button(on)).toContain('aria-pressed="true"');
    expect(button(on)).not.toContain("disabled");
    expect(on).toContain(`title="Context: ${CONTEXT_TITLE}"`);
    expect(on).toMatch(/>Context<\/span><\/button>$/);
    const off = renderToStaticMarkup(<ContextToggle view={contextToggleView("ready", false)} onToggle={() => {}} />);
    expect(button(off)).toContain('aria-pressed="false"');
    // Same words whichever the state: the label never swaps to a verb.
    expect(off.replace('aria-pressed="false"', "")).toBe(on.replace('aria-pressed="true"', ""));
    expect(findVerbToggleLabels(fs.readFileSync(path.join(__dirname, "context_toggle.tsx"), "utf8"))).toEqual([]);
  });

  it("before any recall it is disabled, not pressed, and its hint says why", () => {
    const html = renderToStaticMarkup(<ContextToggle view={contextToggleView("none", true)} onToggle={() => {}} />);
    expect(button(html)).toContain('aria-pressed="false"');
    expect(button(html)).toContain("disabled");
    expect(html).toContain(`title="${CONTEXT_HINT_NONE}"`);
  });
});

describe("wiring: the toggle is the one control of the recall highlight", () => {
  const view = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");
  const canvas = fs.readFileSync(path.join(__dirname, "graph_canvas.tsx"), "utf8");

  it("the graph toolbar renders it and the canvas lights by its choice", () => {
    expect(view).toContain("<ContextToggle");
    expect(view).toContain("showContext={contextOn}");
    expect(view).toContain("contextToggleView(contextAvailability(fold, scrubSeq), contextOn)");
    expect(canvas).toContain("canvasRecall(fold, scrubSeq, selectedId, showContext)");
  });

  it("only the toggle writes the choice (Escape, an empty-canvas click or a selection never clear it)", () => {
    expect(view.match(/setContextOn\(/g)).toHaveLength(1);
    expect(view).toContain("writeContextChoice(sessionStore(), next)");
    expect(canvas).not.toMatch(/showContext\s*=|setContext/);
  });
});

describe("the graph's top row (backlog 0019: the clickable legend replaces the filter chips)", () => {
  const view = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "entity.css"), "utf8");
  const row = view.slice(view.indexOf('<div className="entity_lens_bar">'), view.indexOf("<GraphCanvas"));

  it("holds search, topics, Context and a focused topic's chip, in that order, and nothing else", () => {
    const at = ["🔍<span className=\"lens_search_label\">search</span>", "🗺<span className=\"lens_search_label\">topics</span>", "<ContextToggle", "onClick={() => setTopicFilter(null)}"].map((s) => row.indexOf(s));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(row.match(/<button\b/g)).toHaveLength(3);
  });

  it("the lens chips and the emphasized count are gone, with their state", () => {
    expect(view).not.toMatch(/LENSES|lensIds|GraphLens|setLens|"\.\/graph_lenses"/);
    expect(view).not.toMatch(/entity_lenses|lens_count|emphasized`/);
    expect(css).not.toMatch(/\.entity_lenses\b|\.lens_count\b/);
  });

  it("the emphasis is search ∩ the focused topic ∩ the legend's pick, framed by a search or a pick", () => {
    expect(view).toContain("if (searchIds !== null) sources.push(searchIds);");
    expect(view).toContain("if (topicFilter !== null && topicFilter.ids.size > 0) sources.push(topicFilter.ids);");
    expect(view).toContain("if (legendSet !== null) sources.push(legendSet);");
    expect(view).toContain("searchIds={emphasisIds}");
  });
});

describe("a focused topic's chip (backlog 0030: unpressing topics lets it go; one line)", () => {
  const view = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "entity.css"), "utf8");

  it("unpressing the topics toggle clears the focused topic", () => {
    const toggle = view.slice(view.indexOf('🗺<span className="lens_search_label">topics</span>') - 400, view.indexOf('🗺<span className="lens_search_label">topics</span>'));
    expect(toggle).toMatch(/const next = !showTopics;\s*setShowTopics\(next\);\s*if \(!next\) setTopicFilter\(null\);/);
  });

  it("one line: the title cut with an ellipsis, the whole title first in its hover, the ✕ kept", () => {
    const at = view.indexOf('className="lens_chip active tm_filter_chip"');
    expect(at).toBeGreaterThan(-1);
    const chip = view.slice(at, view.indexOf("</button>", at));
    expect(chip).not.toContain("gc_topic_chip_full");
    expect(chip).toContain('<span className="tm_filter_label">{topicFilter.label}</span> ✕');
    expect(chip).toContain("? `${topicFilter.label}\\n");
    expect(css).toMatch(/\.tm_filter_chip \{[^}]*max-width: 260px;[^}]*white-space: nowrap;/);
    expect(css).toMatch(/\.tm_filter_label \{[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/);
  });
});

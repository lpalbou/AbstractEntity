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

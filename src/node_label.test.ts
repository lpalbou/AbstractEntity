/**
 * Label-content pins (operator 15:06: labels must be readable AND their
 * CONTENT good — not just truncated better).
 */
import { describe, expect, it } from "vitest";

import { clipAtWord, nodeLabel, shapeLabel, summaryLabel } from "./node_label";

describe("shapeLabel", () => {
  it("drops mechanical record prefixes (the color already says the kind)", () => {
    expect(shapeLabel("exchange: the media server died overnight")).toBe("the media server died overnight");
    expect(shapeLabel("episode: restore drill went fine")).toBe("restore drill went fine");
  });

  it("drops type prefixes too — the kind is always encoded elsewhere (laurent dm#84)", () => {
    // FLIPPED from "keeps semantic prefixes": laurent dm#84 2026-07-20
    // ("do not show 'lesson:' for each card... just show the lesson") —
    // color/badge/panel-header carry the kind on every surface.
    expect(shapeLabel("lesson: single points of failure")).toBe("single points of failure");
    expect(shapeLabel("dream: twelve bridges again")).toBe("twelve bridges again");
    // Prefixes strip in CHAINS (formation residue seen live on his cards).
    expect(shapeLabel("lesson: gist: Factual errors about timeline")).toBe("Factual errors about timeline");
    expect(shapeLabel("World model: across-absence")).toBe("across-absence");
    expect(shapeLabel("world_model: admin")).toBe("admin");
    // Non-type words with colons stay — only known scaffolding strips.
    expect(shapeLabel("reembed: embedding space migrated")).toBe("reembed: embedding space migrated");
  });

  it("trims speaker scaffolding to the said thing", () => {
    expect(shapeLabel("person:laurent asked: how is the nas doing")).toBe("how is the nas doing");
    expect(shapeLabel("entity:castor said the backup finished")).toBe("the backup finished");
  });

  it("reads snake_case identity names as words", () => {
    expect(shapeLabel("shared_vulnerability")).toBe("shared vulnerability");
    expect(shapeLabel("intellectual_honesty")).toBe("intellectual honesty");
  });

  it("reads engram index-titles as words", () => {
    expect(shapeLabel("trait-0")).toBe("trait 0");
    expect(shapeLabel("purpose-1")).toBe("purpose 1");
  });

  it("folds multi-line digests to one line", () => {
    expect(shapeLabel("first line\n  second   line")).toBe("first line second line");
  });
});

describe("clipAtWord", () => {
  it("cuts at word boundaries, never mid-word", () => {
    expect(clipAtWord("the restore drill went fine yesterday", 20)).toBe("the restore drill…");
  });

  it("leaves short text alone", () => {
    expect(clipAtWord("dns (revised)", 26)).toBe("dns (revised)");
  });

  it("hard-cuts only when the first word alone exceeds the budget", () => {
    expect(clipAtWord("supercalifragilisticexpialidocious", 12)).toBe("supercalifra…");
  });
});

describe("nodeLabel", () => {
  it("composes shaping and word-clipping", () => {
    expect(nodeLabel("exchange: person:laurent asked: what happened to the media server last night", 30)).toBe(
      "what happened to the media…",
    );
  });
});

describe("summaryLabel (dm#46: type words are never labels)", () => {
  it("nulls the redacted stand-in regardless of title", () => {
    expect(summaryLabel("a real summary", true)).toBeNull();
  });

  it("nulls type stand-ins", () => {
    expect(summaryLabel("a diary entry")).toBeNull();
    expect(summaryLabel("diary entry")).toBeNull();
    expect(summaryLabel("a diary entry (content private)")).toBeNull();
  });

  it("nulls the diaryLabel date-tail placeholder", () => {
    expect(summaryLabel("diary · Jul 7 06:10 · #d1817a")).toBeNull();
    expect(summaryLabel("diary")).toBeNull();
  });

  it("nulls bare graph ids", () => {
    expect(summaryLabel("ex:memory-224f7d42abc")).toBeNull();
    expect(summaryLabel("ex:diary-0a1b2c3d")).toBeNull();
  });

  it("nulls empty/absent titles", () => {
    expect(summaryLabel("")).toBeNull();
    expect(summaryLabel(null)).toBeNull();
    expect(summaryLabel(undefined)).toBeNull();
  });

  it("passes real summaries through", () => {
    expect(summaryLabel("the restore drill went fine")).toBe("the restore drill went fine");
    expect(summaryLabel("What was the last thing we were turning over together?")).toBe(
      "What was the last thing we were turning over together?",
    );
    // A gist that HAPPENS to mention the word diary mid-sentence is content.
    expect(summaryLabel("wrote about the diary practice itself")).toBe("wrote about the diary practice itself");
  });
});

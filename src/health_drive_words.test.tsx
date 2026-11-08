/**
 * Health → Drive reads as counts in words (operator 2026-11-08: "it still
 * shows 0 interests or questions" when he had one of each — "0/1 resolved"
 * and "0/1 explored" read as zero). The bar stays; the hover title keeps
 * its explanation. Rendered with react-dom/server (no DOM in the tests).
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DriveRows, interestsWords, questionsWords } from "./health_panel";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("drive wording", () => {
  it("questions: nothing resolved names the open ones; otherwise the total and how many he resolved", () => {
    expect(questionsWords(1, 0)).toBe("1 open question · none resolved yet");
    expect(questionsWords(4, 0)).toBe("4 open questions · none resolved yet");
    expect(questionsWords(2, 1)).toBe("3 questions · 1 resolved");
    expect(questionsWords(0, 1)).toBe("1 question · 1 resolved");
  });

  it("interests: how many he holds and how many he explored", () => {
    expect(interestsWords(1, 0)).toBe("1 interest · none explored yet");
    expect(interestsWords(4, 2)).toBe("4 interests · 2 explored");
    expect(interestsWords(3, null)).toBe("3 interests");
  });
});

describe("DriveRows", () => {
  it("one question and one interest read as one of each, never as 0/1", () => {
    const html = renderToStaticMarkup(<DriveRows drive={{ open: 1, resolved: 0, interests: 1, explored: 0 }} />);
    const t = text(html);
    expect(t).toContain("1 open question · none resolved yet");
    expect(t).toContain("1 interest · none explored yet");
    expect(t).not.toMatch(/\d+\/\d+/);
    // The bars stay (an empty fill), and the hover titles keep their explanation.
    expect(html.match(/class="hp_drivebar"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="0 of 1 questions resolved"');
    expect(html).toContain("A resolves= election on a later entry moves a question here");
    expect(html).toContain("exploring never CLOSES an interest");
  });

  it("several, some resolved and explored", () => {
    const t = text(renderToStaticMarkup(<DriveRows drive={{ open: 2, resolved: 1, interests: 4, explored: 2 }} />));
    expect(t).toContain("3 questions · 1 resolved");
    expect(t).toContain("4 interests · 2 explored");
  });

  it("an older engine keeps the count and its pending note; empty rows say so in words", () => {
    const older = text(renderToStaticMarkup(<DriveRows drive={{ open: 0, resolved: 0, interests: 2, explored: null }} />));
    expect(older).toContain("2 interests · explored-tracking pending (older engine)");
    expect(older).toContain("none yet — questions form when something he met stays unanswered");
    const empty = text(renderToStaticMarkup(<DriveRows drive={{ open: 0, resolved: 0, interests: 0, explored: 0 }} />));
    expect(empty).toContain("none yet — interests are self-grown direction");
    expect(empty).not.toMatch(/\b0 (held|interests?)\b/);
  });

  it("all resolved / all explored still warn that nothing pulls him forward", () => {
    const t = text(renderToStaticMarkup(<DriveRows drive={{ open: 0, resolved: 2, interests: 1, explored: 1 }} />));
    expect(t).toContain("2 questions · 2 resolved · nothing open — no pull forward");
    expect(t).toContain("1 interest · 1 explored · all explored — no pull forward");
  });
});

/**
 * The code explainer (operator 2026-11-07): codes are not clickable; a 300 ms hover opens a card,
 * so does keyboard focus, and a 300 ms long-press on touch; leaving the code closes it.
 * The open/close rules run on a fake scheduler, so every timing is exact.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createExplainerController, EXPLAIN_DELAY_MS, ExplainedCode, ExplainerCard, scrollMovesAnchor, type ExplainVia } from "./code_explainer";

function rig() {
  let now = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let seq = 0;
  const events: Array<ExplainVia | null> = [];
  const ctl = createExplainerController((v) => events.push(v), {
    set: (fn, ms) => {
      timers.set(++seq, { at: now + ms, fn });
      return seq;
    },
    clear: (h) => void timers.delete(h as number),
  });
  const advance = (ms: number) => {
    now += ms;
    for (const [k, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      if (t.at <= now) {
        timers.delete(k);
        t.fn();
      }
    }
  };
  return { ctl, events, advance };
}

describe("createExplainerController", () => {
  it("the delay is 300 ms", () => {
    expect(EXPLAIN_DELAY_MS).toBe(300);
  });

  it("mouse hover opens after 300 ms, not before; leaving closes", () => {
    const { ctl, events, advance } = rig();
    ctl.pointerEnter("mouse");
    advance(299);
    expect(events).toEqual([]);
    advance(1);
    expect(events).toEqual(["hover"]);
    ctl.pointerLeave("mouse");
    expect(events).toEqual(["hover", null]);
    expect(ctl.state()).toBeNull();
  });

  it("leaving before 300 ms opens nothing", () => {
    const { ctl, events, advance } = rig();
    ctl.pointerEnter("mouse");
    advance(200);
    ctl.pointerLeave("mouse");
    advance(500);
    expect(events).toEqual([]);
  });

  it("touch never hovers; a 300 ms long-press opens and the card stays after the finger lifts", () => {
    const { ctl, events, advance } = rig();
    ctl.pointerEnter("touch");
    advance(1000);
    expect(events).toEqual([]);
    ctl.pointerDown("touch", 10, 10);
    expect(ctl.pressing()).toBe(true);
    advance(300);
    expect(events).toEqual(["press"]);
    ctl.pointerUp();
    ctl.pointerLeave("touch");
    expect(ctl.state()).toBe("press");
    // the next tap (on the code, or anywhere: dismiss) closes it
    ctl.pointerDown("touch", 10, 10);
    expect(events).toEqual(["press", null]);
  });

  it("a short tap or a scroll-like move opens nothing", () => {
    const { ctl, events, advance } = rig();
    ctl.pointerDown("touch", 0, 0);
    advance(150);
    ctl.pointerUp();
    advance(500);
    ctl.pointerDown("touch", 0, 0);
    ctl.pointerMove("touch", 0, 5); // inside the slop: still a press
    ctl.pointerMove("touch", 0, 25); // a scroll
    advance(500);
    expect(events).toEqual([]);
  });

  it("keyboard focus opens after the delay, a pointer focus does not; blur closes", () => {
    const { ctl, events, advance } = rig();
    ctl.focus(false);
    advance(500);
    expect(events).toEqual([]);
    ctl.focus(true);
    advance(300);
    expect(events).toEqual(["focus"]);
    ctl.blur();
    expect(events).toEqual(["focus", null]);
  });

  it("a mouse press closes an open card (the code has no click action); dismiss cancels a pending open", () => {
    const { ctl, events, advance } = rig();
    ctl.pointerEnter("mouse");
    advance(300);
    ctl.pointerDown("mouse", 0, 0);
    expect(events).toEqual(["hover", null]);
    ctl.pointerEnter("mouse");
    advance(100);
    ctl.dismiss();
    advance(500);
    expect(events).toEqual(["hover", null]);
  });
});

describe("the code and its card", () => {
  const content = { code: "FEA", name: "fear", color: "#e05555", summary: "How close his words are to threat language.", facts: [{ label: "This reply", value: "0.06" }], note: "Similarity, on one scale." };

  it("a code is a focusable label, never a button, with no click action and no native tooltip", () => {
    const html = renderToStaticMarkup(<ExplainedCode className="cm_gauge_code" explain={content}>FEA</ExplainedCode>);
    expect(html).toBe('<span class="cm_gauge_code cm_explained" tabindex="0">FEA</span>');
  });

  it("the card is the kit's structured tooltip: code, full name, one sentence, this reply's value, the note", () => {
    const html = renderToStaticMarkup(<ExplainerCard content={content} id="x" />);
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('class="af-tooltip cm_explainer" data-structured="true"');
    expect(html).toContain('<span class="cm_explainer_code">FEA</span><span class="cm_explainer_name">fear</span>');
    expect(html).toContain('<p class="af-tooltip__description">How close his words are to threat language.</p>');
    expect(html).toContain('<dt class="af-tooltip__label">This reply</dt><dd class="af-tooltip__value">0.06</dd>');
    expect(html).toContain('<p class="af-tooltip__note">Similarity, on one scale.</p>');
    expect(renderToStaticMarkup(<ExplainerCard content={{ ...content, note: undefined }} />)).not.toContain("af-tooltip__note");
  });
});

describe("scrollMovesAnchor: only a scroll that moves the code closes its card", () => {
  const anchor = { id: "code" };
  const ancestor = { contains: (n: unknown) => n === anchor };
  const elsewhere = { contains: () => false };
  it("the page or a scrolling ancestor of the code: close", () => {
    expect(scrollMovesAnchor(ancestor, anchor)).toBe(true);
  });
  it("a scroll elsewhere (the live ledger or chat auto-scrolling): stay open", () => {
    expect(scrollMovesAnchor(elsewhere, anchor)).toBe(false);
    expect(scrollMovesAnchor(null, anchor)).toBe(false);
    expect(scrollMovesAnchor({}, anchor)).toBe(false);
    expect(scrollMovesAnchor(ancestor, null)).toBe(false);
  });
  it("the component closes on scroll through this rule, not on every scroll", () => {
    const src = readFileSync(new URL("./code_explainer.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/if \(scrollMovesAnchor\(e\.target as Node \| null, anchorRef\.current\)\) ctl\.dismiss\(\);/);
    expect(src).toMatch(/window\.addEventListener\("scroll", onScroll, true\);/);
    expect(src).not.toMatch(/addEventListener\("scroll", mine/);
  });
});

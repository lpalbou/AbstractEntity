/** The live activity panel's pixels (backlog 0010): live rows with what he does now on top, the
 * earlier rows folded past five, clickable where something opens, then the turn folded into one
 * line. Static markup (no DOM in tests). Plus the drawer's wiring (source pin). */
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import fixture from "./fixtures/visit_turn_ledger.json";
import { withServedFields } from "./fixtures/visit_turn_fields";
import { NO_ACTIVITY, foldVisitTurn, visitTurnSlice, withTopicTitles } from "./live_activity";
import type { VisitLedgerRecord } from "./stream_source";
import { LIVE_ROWS, TurnActivityPanel } from "./turn_pulse_bars";

const TOPICS = fixture.visits.topics.records as unknown as VisitLedgerRecord[];
const fold = (records: VisitLedgerRecord[]) => {
  const s = visitTurnSlice(records);
  return foldVisitTurn(s.records, { begun: s.begun, complete: s.complete });
};
const open = () => true;

describe("live", () => {
  it("the rows, newest at the bottom; what he is doing now is the running rows (no line said twice)", () => {
    const html = renderToStaticMarkup(<TurnActivityPanel activity={fold(TOPICS.slice(0, 8))} live onOpenRecord={open} />);
    expect(html).toContain('data-live="true"');
    expect(html).not.toContain("la_head");
    expect(html.split("Recalled on purpose: his 10 latest book entries").length).toBe(2);
    const order = ["Recalled passively: 44 memories", "Step 1 · thought", "Recalled on purpose: “main topics”", "Recalled on purpose: his 10 latest book entries"].map((t) => html.lastIndexOf(t));
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);
    expect(html).toContain('data-kind="recall_active" data-state="running"');
    expect(html).toContain("claude-haiku-5-5");
  });

  it("between two acts the head line says he is working", () => {
    const html = renderToStaticMarkup(<TurnActivityPanel activity={fold(TOPICS.slice(0, 7))} live onOpenRecord={open} />);
    expect(html).toContain('<span class="la_now">Working…</span>');
  });

  it("starting: no row and no zero until the turn shows on his record", () => {
    const html = renderToStaticMarkup(<TurnActivityPanel activity={NO_ACTIVITY} live onOpenRecord={open} />);
    expect(html).toContain("Starting…");
    expect(html).not.toContain("la_rows");
    expect(html).not.toMatch(/\b0 memories\b/);
  });

  it("past five rows the earlier ones fold into one button", () => {
    const a = fold(TOPICS.slice(0, 18));
    expect(a.rows.length).toBeGreaterThan(LIVE_ROWS);
    const html = renderToStaticMarkup(<TurnActivityPanel activity={a} live onOpenRecord={open} />);
    expect(html).toContain(`${a.rows.length - LIVE_ROWS} earlier`);
    expect((html.match(/class="la_row"/g) || []).length).toBe(LIVE_ROWS);
    expect(html).not.toContain("Recalled passively: 44 memories"); // folded among the earlier
  });

  it("rows that open something are buttons; a step is not", () => {
    const html = renderToStaticMarkup(<TurnActivityPanel activity={fold(TOPICS.slice(0, 10))} live onOpenRecord={open} />);
    expect(html).toMatch(/<li class="la_row" data-kind="recall_passive" data-state="done"><button type="button" class="la_line la_line_open" aria-expanded="false"/);
    expect(html).toMatch(/<li class="la_row" data-kind="recall_active" data-state="done"><button/);
    expect(html).toMatch(/<li class="la_row" data-kind="thinking" data-state="done"><div class="la_line">/);
  });

  it("end-user words only: no ledger, run, step or call ids", () => {
    const html = renderToStaticMarkup(<TurnActivityPanel activity={fold(TOPICS)} live onOpenRecord={open} />);
    expect(html.toLowerCase()).not.toContain("ledger");
    for (const r of TOPICS) if (r.step_id) expect(html).not.toContain(r.step_id);
    expect(html).not.toContain("toolu_");
    expect(html).not.toContain("trace_");
  });
});

describe("with the served fields (runtime 1afbf68)", () => {
  const titles = new Map([
    ["ex:community-aaaa1111har0", "Harbour work"],
    ["ex:community-bbbb2222sea0", "The sea"],
    ["ex:community-dddd4444let0", "Old letters"],
  ]);
  it("live: the recall's topics by title, the step of his loop's cap, what a search found; never a topic key", () => {
    const html = renderToStaticMarkup(<TurnActivityPanel activity={withTopicTitles(fold(withServedFields(TOPICS).slice(0, 10)), titles)} live onOpenRecord={open} />);
    expect(html).toContain("Recalled passively: 44 memories · Harbour work, The sea, Old letters");
    expect(html).toContain("Step 2 of 50 · thinking…");
    expect(html).toContain("Recalled on purpose: “main topics” → 7 found");
    expect(html).not.toContain("ex:community-");
  });
  it("the folded line keeps the turn's counts", () => {
    const html = renderToStaticMarkup(<TurnActivityPanel activity={withTopicTitles(fold(withServedFields(TOPICS)), titles)} live={false} onOpenRecord={open} />);
    expect(html).toMatch(/Last turn: 2 steps · 2 memory searches · 44 memories came to mind · 1 formed · 56 s/);
  });
});

describe("after the turn", () => {
  it("folds into one line of what it did; the rows come back when opened", () => {
    const a = fold(TOPICS);
    const html = renderToStaticMarkup(<TurnActivityPanel activity={a} live={false} onOpenRecord={open} />);
    expect(html).toContain('data-live="false"');
    expect(html).toMatch(/Last turn: 2 steps · 2 memory searches · 44 memories came to mind · 1 formed · 56 s/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("la_rows");
  });
});

describe("the drawer's wiring", () => {
  const src = readFileSync(resolve(__dirname, "chat_drawer.tsx"), "utf8");
  it("the panel is live while a turn runs and the turn's summary once idle, from his visit's run", () => {
    expect(src).toContain("useLiveActivity({ baseUrl, entity, brain, visitRunId: runId, live: busy === \"turn\"");
    expect(src).toContain('<TurnActivityPanel activity={activity ?? NO_TURN_ACTIVITY} live onOpenRecord={props.onOpenRecord} />');
    expect(src).toContain('{busy === "idle" && !avatarMode && activity ? <TurnActivityPanel activity={activity} live={false} onOpenRecord={props.onOpenRecord} /> : null}');
    expect(src).not.toContain("TurnPulseBars");
  });
});

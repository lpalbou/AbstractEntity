/**
 * The Cognitive Monitor docked above the timeline (operator 2026-11-10, backlog 0018: "remove the
 * 'wave' side panel; put it as a button next to the timeline controls … the cognitive monitor lives
 * at the bottom with the temporal replay, evolving with the replay and per message, so nothing of
 * it at the top"). Rendered with react-dom/server; the wiring is pinned on the sources.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ScoredSample } from "./cognition_adapter";
import { createReplyFeed, type ReplyFeedValue } from "./cognition_wave_inline";
import { CognitionWavePanel, sampleAt } from "./cognition_wave_panel";
import { createFoldState } from "./stream_fold";
import { Timeline, type TimelineProps } from "./timeline";
import type { ReplayEnvelope } from "./stream_types";

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");
const VIEW = read("entity_view.tsx");
const DRAWER = read("chat_drawer.tsx");
const PANEL = read("cognition_wave_panel.tsx");
const INLINE = read("cognition_wave_inline.tsx");
const CSS = read("entity.css");

const sample = (seq: number | null, text: string): ScoredSample => ({ id: text, label: "visit", text, at: "", source: "visit", seq, scores: {} }) as unknown as ScoredSample;
const reply = (over: Partial<ReplyFeedValue> = {}): ReplyFeedValue => ({ latestReply: "the newest words", focusReply: null, focusAt: null, effort: null, effortKey: null, tools: null, ...over });

describe("the timeline's Monitor toggle", () => {
  const envelopes = [{ seq: 1, family: "event", observed_at: "2026-11-10T16:08:00+00:00", payload: {}, display: {} } as unknown as ReplayEnvelope];
  const render = (over: Partial<TimelineProps>) =>
    renderToStaticMarkup(
      <Timeline envelopes={envelopes} scrubIndex={0} playing={false} speed={5} live={false} liveAvailable inferredSessionSeqs={[]} onScrub={() => {}} onTogglePlay={() => {}} onSpeed={() => {}} onToggleLive={() => {}} monitorOpen={false} onToggleMonitor={() => {}} {...over} />,
    );
  const toggle = (html: string) => html.match(/<button[^>]*class="et_btn et_monitor"[^>]*>[^<]*<\/button>/)?.[0] ?? "";

  it("comes right after ● Live, labelled by what it opens, pressed = open (the label never changes)", () => {
    const off = render({});
    expect(off.indexOf("● Live")).toBeGreaterThan(-1);
    expect(off.indexOf('class="et_btn et_monitor"')).toBeGreaterThan(off.indexOf("● Live"));
    expect(off.indexOf('class="et_btn et_monitor"')).toBeLessThan(off.indexOf('class="et_pos"'));
    expect(toggle(off)).toContain('aria-pressed="false"');
    expect(toggle(off)).toContain(">🧠 Monitor</button>");
    const on = render({ monitorOpen: true });
    expect(toggle(on)).toContain('aria-pressed="true"');
    expect(toggle(on).replace('aria-pressed="true"', "")).toBe(toggle(off).replace('aria-pressed="false"', ""));
  });

  it("the page opens the monitor docked under the graph, beside the side panel, behind the content gate, mounted only while open", () => {
    expect(VIEW).toContain("monitorOpen={monitorOpen}");
    expect(VIEW).toContain("onToggleMonitor={() => setMonitorOpen((v) => !v)}");
    const dock = VIEW.indexOf('<section className="entity_monitor_dock" aria-label="Cognitive monitor">');
    // Inside the main area: after the graph's wrapper, before the side panel (a child of .entity_main).
    expect(dock).toBeGreaterThan(VIEW.indexOf("<GraphLegend "));
    expect(dock).toBeLessThan(VIEW.indexOf("<SideTabs"));
    expect(VIEW.slice(VIEW.indexOf("<GraphLegend "), dock)).toMatch(/\/>\s*<\/div>\s*\{\/\*/);
    expect(VIEW.slice(VIEW.lastIndexOf("{", dock), dock)).toContain("monitorOpen && !gatewayLocked && !(indexBase !== null && !entityName) ? (");
    const panel = VIEW.slice(dock, VIEW.indexOf("</section>", dock));
    for (const prop of ["scrubSeq={scrubSeq}", "live={live}", "replyFeed={replyFeed}"]) expect(panel).toContain(prop);
  });
});

describe("nothing of it at the top: no Wave tab, no monitor over the chat", () => {
  it("the side panel has no Wave tab", () => {
    expect(VIEW).not.toMatch(/id: "wave"|title: "Wave"/);
    expect(VIEW.match(/<CognitionWavePanel\b/g)).toHaveLength(1);
  });

  it("the chat drawer mounts no monitor; it publishes the reply in view into the feed", () => {
    expect(DRAWER).not.toContain("<CognitionWaveInline");
    expect(DRAWER).toContain("replyFeed.set(");
    expect(DRAWER).toContain("focusReply: focusMsg ? (focusMsg.content as string) : null,");
    expect(DRAWER).toContain("useEffect(() => () => replyFeed.set(null), [replyFeed]);");
    expect(VIEW).toContain("replyFeed={replyFeed}\n");
  });

  it("the monitor has no transport of its own (the timeline drives it) and no fold", () => {
    expect(PANEL).not.toMatch(/cw_controls|cw_ctl|setInterval|stepBy|setMode|"manual"/);
    expect(INLINE).not.toMatch(/cm_fold|FOLD_KEY|initialMonitorFolded|localStorage/);
    expect(CSS).not.toMatch(/\.cw_controls|\.cw_ctl|\.cm_fold/);
  });
});

describe("the monitor follows the timeline", () => {
  it("shows the last utterance formed at or before the position; nothing before his first", () => {
    const samples = [sample(10, "first"), sample(null, "unanchored"), sample(20, "second"), sample(30, "third")];
    expect(sampleAt(samples, 5)).toBeNull();
    expect(sampleAt(samples, 10)?.text).toBe("first");
    expect(sampleAt(samples, 29)?.text).toBe("second");
    expect(sampleAt(samples, 1e9)?.text).toBe("third");
  });

  const source = { baseUrl: "http://gw.test", entity: "castor" };
  const panel = (live: boolean, value: ReplyFeedValue | null) => {
    const feed = createReplyFeed();
    feed.set(value);
    return renderToStaticMarkup(<CognitionWavePanel fold={createFoldState()} source={source} scrubSeq={12} live={live} replyFeed={feed} />);
  };

  it("on the replay: his words at the timeline's position, read on demand with its button", () => {
    const html = panel(false, reply());
    expect(html).toContain("his words at the timeline&#x27;s position");
    expect(html).toContain('class="cw_pull_btn"');
    expect(html).toContain(">read his words</button>");
    // The framing is always said.
    expect(html).toContain("This reads the expressive character of his WORDS, not his inner state");
  });

  it("live with his conversation open: the reply in view, per message (no corpus button)", () => {
    const html = panel(true, reply());
    expect(html).toContain("the reply in view in his conversation");
    expect(html).not.toContain("cw_pull_btn");
  });

  it("live without a conversation: the timeline's position again", () => {
    const html = panel(true, null);
    expect(html).toContain("his words at the timeline&#x27;s position");
    expect(html).toContain('class="cw_pull_btn"');
  });
});

describe("the reply's score cache", () => {
  it("is kept per home across the reading's mounts (a reply already read is never embedded again)", () => {
    expect(INLINE).toContain("if (!readsRef.current) readsRef.current = homeReads(baseUrl, entity);");
    expect(INLINE).toContain("const key = JSON.stringify([baseUrl, entity]);");
  });
});

describe("the reply feed", () => {
  it("notifies its subscribers on a change only, and lets them go", () => {
    const feed = createReplyFeed();
    const heard = vi.fn();
    const leave = feed.subscribe(heard);
    const value = reply();
    feed.set(value);
    feed.set({ ...value });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(feed.get()).toBe(value);
    feed.set(reply({ focusReply: "older words", focusAt: "2026-11-10T15:00:00Z" }));
    expect(heard).toHaveBeenCalledTimes(2);
    leave();
    feed.set(null);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(feed.get()).toBeNull();
  });
});

describe("layout", () => {
  it("the side panel keeps its whole height: while open the main area is a grid, graph over monitor in the first column, the side panel down the second", () => {
    expect(CSS).toMatch(/\.entity_main:has\(> \.entity_monitor_dock\):not\(:has\(> \.side_tabs_emphasized\)\) \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) auto;\s*grid-template-rows: minmax\(0, 1fr\) auto;/);
    expect(CSS).toMatch(/\.entity_main:has\(> \.entity_monitor_dock\) > \.side_tabs \{\s*grid-column: 2;\s*grid-row: 1 \/ span 2;/);
    expect(CSS).toMatch(/\.entity_main:has\(> \.entity_monitor_dock\) > \.entity_canvas_wrap \{\s*grid-column: 1;\s*grid-row: 1;/);
    // No rule squeezes the side panel's tab strip for the monitor any more.
    expect(CSS).not.toMatch(/entity_monitor_dock\)?[^{]*\.st_rail/);
  });

  it("a bounded strip with its own scroll; on a phone one column in the graph's place, hidden under the avatar view", () => {
    expect(CSS).toMatch(/\.entity_monitor_dock \{\s*grid-column: 1;\s*grid-row: 2;\s*min-width: 0;\s*max-height: calc\(var\(--vh-full, 100vh\) \* 0\.38\);\s*overflow-y: auto;/);
    expect(CSS).toMatch(/\.cw_panel\.cw_dock \{[^}]*grid-template-columns: minmax\(220px, 300px\) minmax\(0, 1fr\);/);
    const phone = CSS.slice(CSS.indexOf(".cw_dock .cm_body {"));
    expect(phone).toMatch(/@media \(max-width: 767\.98px\) \{\s*\.cw_panel\.cw_dock \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(CSS).toContain(".entity_main:has(> .side_tabs_avatar) > .entity_monitor_dock { display: none; }");
    expect(CSS).toContain(".entity_main:has(> .side_tabs_emphasized) > .entity_monitor_dock {\n  display: none;");
    // A phone holds one pane at a time: the open monitor takes the graph's place above the tab strip.
    expect(CSS).toMatch(/@media \(max-width: 767\.98px\), \(max-height: 500px\) \{\s*\.entity_main:has\(> \.entity_monitor_dock\):not\(:has\(> \.side_tabs_emphasized\)\) \{\s*display: flex;\s*\}\s*\.entity_main:has\(> \.entity_monitor_dock\) > \.entity_canvas_wrap \{\s*display: none;\s*\}\s*\/\*[^*]*\*\/\s*\.entity_monitor_dock \{\s*flex: 1 1 0;/);
    expect(CSS).toMatch(/\.et_monitor\[aria-pressed="true"\] \{[^}]*border-color: var\(--ea-accent\);/);
  });
});

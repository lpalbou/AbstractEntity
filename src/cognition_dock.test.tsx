/**
 * The Cognitive Monitor in the timeline (operator 2026-11-10, backlog 0018: "put it as a button next to
 * the timeline controls … nothing of it at the top"; backlog 0032: "the monitor should open in the
 * empty space above", and of its title block, basis line, framing note, button and footnote:
 * "completely remove that"). Rendered with react-dom/server; the wiring is pinned on the sources.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ScoredSample } from "./cognition_adapter";
import { createReplyFeed, type ReplyFeedValue } from "./cognition_wave_inline";
import { CognitionWavePanel, keptCorpus, monitorShown, sampleAt, startCorpusRead, corpusKey } from "./cognition_wave_panel";
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
      <Timeline envelopes={envelopes} scrubIndex={0} playing={false} speed={5} live={false} liveAvailable inferredSessionSeqs={[]} onScrub={() => {}} onTogglePlay={() => {}} onSpeed={() => {}} onToggleLive={() => {}} monitorOpen={false} onToggleMonitor={() => {}} monitor={null} {...over} />,
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

  it("the page hands the timeline the monitor exactly when it is on screen; the toggle shows that state", () => {
    const at = VIEW.indexOf("<Timeline");
    const timeline = VIEW.slice(at, VIEW.indexOf("playhead={playhead}", at));
    expect(timeline).toContain("monitorOpen={monitorOnScreen}");
    expect(timeline).toContain("onToggleMonitor={avatarChat ? null : () => setMonitorOpen((v) => !v)}");
    expect(timeline).toMatch(/monitor=\{\s*monitorOnScreen \? \(\s*<CognitionWavePanel/);
    const panel = timeline.slice(timeline.indexOf("<CognitionWavePanel"));
    for (const prop of ["scrubSeq={scrubSeq}", "live={live}", "replyFeed={replyFeed}"]) expect(panel).toContain(prop);
    expect(VIEW).toContain("const monitorOnScreen = monitorShown({ open: monitorOpen, locked: gatewayLocked, roster: indexBase !== null && !entityName, avatar: avatarChat });");
    // Nothing of it in the main area, above the graph or under it.
    const main = VIEW.slice(VIEW.indexOf('<div className="entity_main"'), VIEW.indexOf("<Timeline"));
    expect(main).not.toMatch(/CognitionWavePanel|entity_monitor_dock/);
    // Another entity's page opens with it closed (its press is the act that reads).
    expect(VIEW).toMatch(/setSearchOpen\(false\);\s*setMonitorOpen\(false\);/);
  });

  it("on screen only when open, on his page, past the content gate, and not beside the avatar view", () => {
    const base = { open: true, locked: false, roster: false, avatar: false };
    expect(monitorShown(base)).toBe(true);
    expect(monitorShown({ ...base, open: false })).toBe(false);
    expect(monitorShown({ ...base, locked: true })).toBe(false);
    expect(monitorShown({ ...base, roster: true })).toBe(false);
    expect(monitorShown({ ...base, avatar: true })).toBe(false);
  });

  it("the open monitor is in the timeline's free space (right of the lanes, over their rows) and absent when closed", () => {
    const closed = render({});
    expect(closed).toContain('<div class="et_monitor_slot" style="grid-row:1 / span 5"></div>');
    expect(closed).not.toContain("et_monitor_open");
    const open = render({ monitorOpen: true, monitor: <span className="probe">the monitor</span> });
    expect(open).toContain('class="entity_timeline et_grid et_monitor_open"');
    expect(open).toContain('<div class="et_monitor_slot" style="grid-row:1 / span 5"><span class="probe">the monitor</span></div>');
    // It is the grid's first item, so the lanes flow round it.
    expect(open.indexOf("et_monitor_slot")).toBeLessThan(open.indexOf("et_lane_label"));
  });

  it("beside the avatar view the toggle waits, disabled, unpressed, and says why", () => {
    const blocked = toggle(render({ monitorOpen: false, onToggleMonitor: null }));
    expect(blocked).toContain("disabled");
    expect(blocked).toContain('aria-pressed="false"');
    expect(blocked).toContain('title="Cognitive monitor: not shown beside the avatar view"');
    expect(toggle(render({}))).not.toContain("disabled");
  });
});

describe("his words read once per home, on demand (the corpus read)", () => {
  const ready = (text: string) => ({ name: "ready" as const, samples: [sample(5, text)], warnings: [] });
  const deferred = () => {
    let resolve!: (v: ReturnType<typeof ready>) => void;
    const promise = new Promise<ReturnType<typeof ready>>((r) => (resolve = r));
    return { promise, resolve };
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("one read; a re-open while it runs waits on it and starts nothing; after it, a re-open shows it at once", async () => {
    const key = corpusKey({ baseUrl: "http://gw.test", entity: "reopen-castor" });
    const reads = vi.fn();
    const first = deferred();
    expect(keptCorpus(key)).toEqual({ name: "idle" });
    expect(startCorpusRead(key, () => (reads(), first.promise))).not.toBeNull();
    // Closed and opened again while it runs: "scoring", and a click there starts no second read.
    expect(keptCorpus(key)).toEqual({ name: "scoring" });
    expect(startCorpusRead(key, () => (reads(), first.promise))).toBeNull();
    first.resolve(ready("the harbour visit"));
    await settle();
    expect(reads).toHaveBeenCalledTimes(1);
    // Opened again after it: the kept read, rendered at once, no click.
    expect(keptCorpus(key)).toMatchObject({ name: "ready" });
    const html = renderToStaticMarkup(<CognitionWavePanel fold={createFoldState()} source={{ baseUrl: "http://gw.test", entity: "reopen-castor" }} scrubSeq={10} live={false} replyFeed={createReplyFeed()} />);
    expect(html).toContain('data-reading-state="ready"');
    expect(html).toContain('aria-label="Tone of the phrasing"');
    expect(reads).toHaveBeenCalledTimes(1);
    // A read for another home is its own.
    expect(startCorpusRead(corpusKey({ baseUrl: "http://gw.test", entity: "another" }), () => (reads(), Promise.resolve(ready("again"))))).not.toBeNull();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("moving along the timeline reads nothing: renders at many positions start no read, and no effect of the panel re-reads", () => {
    const key = corpusKey({ baseUrl: "http://gw.test", entity: "scrub-castor" });
    for (const seq of [0, 3, 9, 40, 1e6]) {
      renderToStaticMarkup(<CognitionWavePanel fold={createFoldState()} source={{ baseUrl: "http://gw.test", entity: "scrub-castor" }} scrubSeq={seq} live={false} replyFeed={createReplyFeed()} />);
    }
    expect(keptCorpus(key)).toEqual({ name: "idle" });
    // The read starts from the press only: the monitor mounts when opened and its one open effect
    // (keyed by the home, never by the position) starts the read when none is kept; runScore is
    // defined once and called from that effect only (an effect cannot run in a server render).
    expect(PANEL.match(/\brunScore\b/g)).toHaveLength(2);
    expect(PANEL).toMatch(/useEffect\(\(\) => \{\s*if \(keptCorpus\(key\)\.name === "idle"\) runScore\(\);\s*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\s*\}, \[key\]\);/);
    const effects = [...PANEL.matchAll(/useEffect\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\);/g)].map((m) => m[1]);
    expect(effects.length).toBeGreaterThan(0);
    for (const deps of effects) expect(deps).not.toMatch(/scrubSeq|runScore|fold/);
    expect(PANEL.match(/useEffect\(/g)).toHaveLength(effects.length);
  });
});

describe("nothing of it at the top: no Wave tab, no monitor over the chat", () => {
  it("the side panel has no Wave tab; the monitor is mounted once, in the timeline", () => {
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

  it("no title, no basis line, no framing note, no button, no footnote: the reading and a one-word state; the framing and the basis are the ⓘ's hover", () => {
    const html = panel(false, reply());
    expect(html).toMatch(/^<div class="cw_panel cw_compact" data-reading-state="idle">/);
    expect(html).not.toMatch(/<button|Cognitive Monitor|basis v|read his words|reads his diary|his words at the timeline|cw_framing|cw_pull/);
    expect(html).toContain('aria-label="Tone of the phrasing"');
    expect(html).toMatch(/<span class="cw_about" title="This reads the expressive character of his WORDS, not his inner state — a text performing calm scores calm\." aria-label="[^"]*">ⓘ<\/span>/);
  });

  it("live with his conversation open: the reply in view, per message", () => {
    expect(panel(true, reply())).toMatch(/^<div class="cw_panel cw_compact" data-reading-state="conversation">/);
  });

  it("live without a conversation: his words at the position again", () => {
    expect(panel(true, null)).toMatch(/^<div class="cw_panel cw_compact" data-reading-state="idle">/);
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
  it("in the timeline's third column over the lanes' rows, about 110 px tall at most; the main area is never a grid for it", () => {
    expect(CSS).toMatch(/\.et_monitor_slot \{\s*grid-column: 3;\s*min-width: 0;/);
    expect(CSS).toMatch(/\.cw_panel\.cw_compact \{[^}]*max-height: 110px;[^}]*overflow: hidden;/);
    expect(CSS).not.toMatch(/entity_monitor_dock|cw_dock|\.entity_main:has\(> \.entity/);
  });

  it("on a phone it takes the lanes' place, above the bar", () => {
    const phone = CSS.slice(CSS.indexOf("/* Phone (the lanes fill the width): the open monitor takes the lanes' place"));
    expect(phone).toMatch(/\.et_monitor_slot \{\s*grid-column: 1 \/ -1;\s*grid-row: auto !important;/);
    expect(phone).toMatch(/\.entity_timeline\.et_monitor_open \.et_lane_label:not\(\.et_time_label\),\s*\.entity_timeline\.et_monitor_open \.et_lane \{\s*display: none;/);
    expect(CSS).toMatch(/\.et_monitor\[aria-pressed="true"\] \{[^}]*border-color: var\(--ea-accent\);/);
  });
});

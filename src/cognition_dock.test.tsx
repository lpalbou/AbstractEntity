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
import { CognitionWavePanel, corpusPreflight, keptCorpus, monitorAbout, MonitorState, monitorShown, sampleAt, startCorpusRead, corpusKey, type Phase } from "./cognition_wave_panel";
import { EMBEDDINGS_UNCONFIGURED } from "./stream_source";
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

  it("Live, the Monitor toggle and the position: their own row above the transport (backlog 0036)", () => {
    const html = render({});
    const top = html.slice(html.indexOf('<div class="et_right_top">'), html.indexOf('<div class="et_right">'));
    expect(top).toContain("● Live");
    expect(top).toContain('class="et_btn et_monitor"');
    expect(top).toContain('class="et_pos"');
    const transport = html.slice(html.indexOf('<div class="et_right">'));
    expect(transport).toContain('aria-label="Back to the beginning"');
    expect(transport).toContain('aria-label="Playback speed"');
    expect(transport).not.toMatch(/● Live|et_monitor|et_pos/);
    // The CSS stacks them at the right: the controls' column, over the last two lanes' rows, then the bar's row.
    expect(CSS).toMatch(/\.entity_timeline\.et_grid > \.et_right_top \{\s*grid-column: 4;\s*grid-row: 4 \/ span 2;/);
    expect(CSS).toMatch(/\.entity_timeline\.et_grid > \.et_right \{\s*grid-column: 4;/);
    expect(CSS).toMatch(/\.entity_timeline\.et_grid \{\s*display: grid;\s*grid-template-columns: max-content minmax\(0, 1fr\) auto auto;/);
  });

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

  it("the open monitor is between the lanes and the controls, the block's full height (the lanes' rows and the bar's), and absent when closed", () => {
    const closed = render({});
    expect(closed).toContain('<div class="et_monitor_slot" style="grid-row:1 / span 6"></div>');
    expect(closed).not.toContain("et_monitor_open");
    const open = render({ monitorOpen: true, monitor: <span className="probe">the monitor</span> });
    expect(open).toContain('class="entity_timeline et_grid et_monitor_open"');
    expect(open).toContain('<div class="et_monitor_slot" style="grid-row:1 / span 6"><span class="probe">the monitor</span></div>');
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
    // The ⓘ is a code with its card (hover, focus, long-press): a keyboard reaches it.
    expect(html).toMatch(/<span class="cw_about cm_explained" tabindex="0">ⓘ<\/span>/);
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
  it("in the timeline's third column, the block's full height, never taller than the block (116 px); the main area is never a grid for it", () => {
    expect(CSS).toMatch(/\.et_monitor_slot \{\s*grid-column: 3;\s*min-width: 0;/);
    expect(CSS).toMatch(/\.cw_panel\.cw_compact \{[^}]*max-height: 116px;[^}]*overflow: visible;/);
    // The petal labels in the bloom's own small type (under the floor), so nine fit around it.
    expect(CSS).toMatch(/\.cw_compact \.cm_overlay \{\s*--ent-type-floor: 0px;/);
    // Its state is one line, whatever it says (the reason in the hover).
    expect(CSS).toMatch(/\.cw_state \{[^}]*white-space: nowrap;/);
    // A phone keeps the one row (smaller squares), never a wrapped column.
    const phone = CSS.slice(CSS.indexOf("/* Phone (the lanes fill the width): the open monitor takes the lanes' place"));
    expect(phone.slice(0, phone.indexOf("/* ---"))).not.toMatch(/flex-wrap: wrap|max-height: none/);
    // Its 84 px bloom keeps its petal codes inside the lanes' place: codes alone, the ring drawn in.
    expect(phone).toMatch(/\.cw_compact \.cm_overlay_num \{\s*display: none;/);
    expect(phone).toMatch(/\.cw_panel\.cw_compact \{\s*max-height: 88px;\s*overflow: hidden;/);
    // In the lanes' exact place: their five 16 px rows and four 2 px gaps.
    expect(phone).toMatch(/\.et_monitor_slot \{[^}]*height: 88px;/);
    expect(phone).toMatch(/\.entity_timeline\.et_grid \.et_lane_label \{\s*height: 16px;\s*line-height: 16px;/);
    // The five channels: a column of names (smaller) and values; only the gauge's codes span their box.
    expect(CSS).toMatch(/\.cm_tone_list \{\s*display: grid;\s*grid-template-columns: max-content max-content;/);
    expect(CSS).toMatch(/\.cm_tone_name \{[^}]*font-size: max\(10px, calc\(var\(--ent-type-floor, 12px\) - 2px\)\);/);
    expect(CSS).not.toMatch(/\.cw_compact \.cm_gauge_codes \{/);
    expect(CSS).toMatch(/\.cw_compact \.cm_gauge_box \.cm_gauge_codes \{\s*width: 100%;/);
    expect(CSS).not.toMatch(/entity_monitor_dock|cw_dock|\.entity_main:has\(> \.entity/);
  });

  it("on a phone it takes the lanes' place, above the bar", () => {
    const phone = CSS.slice(CSS.indexOf("/* Phone (the lanes fill the width): the open monitor takes the lanes' place"));
    expect(phone).toMatch(/\.et_monitor_slot \{\s*grid-column: 1 \/ -1;\s*grid-row: auto !important;/);
    expect(phone).toMatch(/\.entity_timeline\.et_monitor_open \.et_lane_label:not\(\.et_time_label\),\s*\.entity_timeline\.et_monitor_open \.et_lane \{\s*display: none;/);
    expect(CSS).toMatch(/\.et_monitor\[aria-pressed="true"\] \{[^}]*border-color: var\(--ea-accent\);/);
  });
});

describe("the monitor's one short line: every state says itself (backlog 0032 review F3)", () => {
  const src = { baseUrl: "http://gw.test" };
  const line = (phase: Phase, extra: Partial<React.ComponentProps<typeof MonitorState>> = {}) =>
    renderToStaticMarkup(<MonitorState phase={phase} source={src} conversation={false} nothingHere={false} {...extra} />);

  it("reading, nothing readable, nothing said here, an exported view", () => {
    expect(line({ name: "scoring" })).toBe('<span class="cw_note">reading…</span>');
    expect(line({ name: "empty", warnings: [] })).toBe('<span class="cw_note">nothing readable yet</span>');
    expect(line({ name: "ready", samples: [], warnings: [] }, { nothingHere: true })).toBe('<span class="cw_note">nothing said yet here</span>');
    expect(line({ name: "ready", samples: [], warnings: [] })).toBe("");
    expect(line({ name: "scoring" }, { source: null })).toBe('<span class="cw_note">exported view: not read</span>');
    // Live with a conversation the reading carries its own line.
    expect(line({ name: "scoring" }, { conversation: true })).toBe("");
  });

  it("no embeddings: one short line with the set-up link, the whole sentence in its hover", () => {
    const html = line({ name: "unconfigured", message: EMBEDDINGS_UNCONFIGURED });
    expect(html).toBe(`<span class="cw_note cw_note_error" data-monitor-note="embeddings" title="${EMBEDDINGS_UNCONFIGURED}">no embeddings · <a href="http://gw.test/console#defaults" target="_blank" rel="noreferrer">set up</a></span>`);
  });

  it("a failed read: could not read, the reason in its hover", () => {
    expect(line({ name: "error", message: "the embeddings route timed out", warnings: ["batch 0-32 failed"] })).toBe('<span class="cw_note cw_note_error" title="the embeddings route timed out · batch 0-32 failed">could not read</span>');
  });
});

describe("the ⓘ names what the codes are (backlog 0032 review F4)", () => {
  it("the five tone channels with their poles on one −1..+1 scale, the framing first, the basis last", () => {
    const about = monitorAbout("basis v1.0.0 · generic registers", null);
    expect(about.summary).toBe("This reads the expressive character of his WORDS, not his inner state — a text performing calm scores calm.");
    expect(about.facts).toEqual([
      { label: "warmth", value: "warm (+1) to discouraged (−1)" },
      { label: "tension", value: "urgent (+1) to unhurried (−1)" },
      { label: "reflection", value: "reflective (+1) to matter-of-fact (−1)" },
      { label: "structure", value: "structured (+1) to loosely associative (−1)" },
      { label: "certainty", value: "assured (+1) to hedging (−1)" },
    ]);
    expect(about.note).toContain("each from −1 to +1");
    expect(about.note).toContain("basis v1.0.0 · generic registers");
  });
});

describe("no embeddings: said at once, his book never opened (backlog 0032 review F2)", () => {
  const route = (answers: { embedding: unknown; embeddings: number }) => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const path = new URL(String(url), "http://gw.test").pathname;
      seen.push(path);
      if (path.endsWith("/embedding")) return new Response(JSON.stringify(answers.embedding), { status: 200 });
      if (path.endsWith("/embeddings")) return new Response(answers.embeddings === 200 ? JSON.stringify({ model: "m", data: [{ index: 0, embedding: [0.1] }] }) : "{}", { status: answers.embeddings });
      return new Response("{}", { status: 404 });
    });
    return seen;
  };

  it("the door resolves no embedder: unconfigured, nothing else is asked (no embed, no book)", async () => {
    const seen = route({ embedding: { pin: { model_id: "m" }, resolved_embedder: null, match: "unknown" }, embeddings: 503 });
    expect(await corpusPreflight("http://gw.test", "castor")).toEqual({ name: "unconfigured", message: EMBEDDINGS_UNCONFIGURED });
    expect(seen).toEqual(["/api/gateway/entities/castor/embedding"]);
    vi.unstubAllGlobals();
  });

  it("the embedding route refuses (503): unconfigured before any book read; another space: an error", async () => {
    let seen = route({ embedding: { pin: { model_id: "m" }, resolved_embedder: "m", match: "match" }, embeddings: 503 });
    expect(await corpusPreflight("http://gw.test", "castor")).toMatchObject({ name: "unconfigured" });
    expect(seen.some((p) => /diary|verbatim/.test(p))).toBe(false);
    seen = route({ embedding: { pin: { model_id: "a" }, resolved_embedder: "b", match: "mismatch" }, embeddings: 200 });
    expect(await corpusPreflight("http://gw.test", "castor")).toMatchObject({ name: "error" });
    seen = route({ embedding: { pin: { model_id: "m" }, resolved_embedder: "m", match: "match" }, embeddings: 200 });
    expect(await corpusPreflight("http://gw.test", "castor")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("the panel's read asks the preflight first, before the harvest", () => {
    const run = PANEL.slice(PANEL.indexOf("const runScore = useCallback("));
    expect(run.indexOf("await corpusPreflight(source.baseUrl, source.entity)")).toBeGreaterThan(-1);
    expect(run.indexOf("await corpusPreflight(")).toBeLessThan(run.indexOf("scoreEntityUtterances("));
  });

  it("a failed read is not kept: the next press tries again", async () => {
    const key = corpusKey({ baseUrl: "http://gw.test", entity: "retry-castor" });
    expect(startCorpusRead(key, async () => ({ name: "unconfigured", message: EMBEDDINGS_UNCONFIGURED }))).not.toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(keptCorpus(key)).toEqual({ name: "idle" });
    expect(startCorpusRead(key, async () => ({ name: "error", message: "x", warnings: [] }))).not.toBeNull();
  });
});

describe("the bloom's tree is back (backlog 0036)", () => {
  it("both readings draw the bloom with its petal labels, at the size the screen allows", () => {
    expect(PANEL).toContain("<BloomAxisOverlay width={bloom} height={bloom} emotions={current?.emotions ?? {}} />");
    expect(INLINE).toContain("<BloomAxisOverlay width={bloom} height={bloom} emotions={current.emotions} />");
    expect(INLINE).toMatch(/const BLOOM = 112;\s*const BLOOM_PHONE = 84;/);
    expect(INLINE).toContain("return useAfMedia(AF_MEDIA.sm) ? BLOOM_PHONE : BLOOM;");
  });
});

/**
 * The Cognitive Monitor in the timeline (operator 2026-11-10, backlog 0018: "nothing of it at the top";
 * backlog 0032: of its title block, basis line, framing note, button and footnote: "completely remove
 * that"; 2026-11-11 02:00, backlog 0040: three columns with no empty space, "remove the cognitive
 * monitor button and let it always on", following the time and his replies). Rendered with
 * react-dom/server; the wiring is pinned on the sources (effects do not run in a server render: the
 * mounted behaviour is scripts/check_cognition_browser.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ScoredSample } from "./cognition_adapter";
import { createReplyFeed, type ReplyFeedValue } from "./cognition_wave_inline";
import { CognitionWavePanel, corpusPreflight, keptCorpus, monitorAbout, monitorLines, monitorShown, sampleAt, startCorpusRead, corpusKey, type Phase } from "./cognition_wave_panel";
import { EMBEDDINGS_UNCONFIGURED } from "./stream_source";
import { createFoldState } from "./stream_fold";
import { LANES, Timeline, type TimelineProps } from "./timeline";
import type { ReplayEnvelope } from "./stream_types";

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), "utf8");
const VIEW = read("entity_view.tsx");
const DRAWER = read("chat_drawer.tsx");
const PANEL = read("cognition_wave_panel.tsx");
const INLINE = read("cognition_wave_inline.tsx");
const CSS = read("entity.css");
const TIMELINE = read("timeline.tsx");
const lifeFold = () => createFoldState();

const sample = (seq: number | null, text: string): ScoredSample => ({ id: text, label: "visit", text, at: "", source: "visit", seq, scores: {} }) as unknown as ScoredSample;
const reply = (over: Partial<ReplyFeedValue> = {}): ReplyFeedValue => ({ latestReply: "the newest words", focusReply: null, focusAt: null, effort: null, effortKey: null, tools: null, ...over });

describe("the timeline: three columns, the monitor always on (backlog 0040)", () => {
  const envelopes = [{ seq: 7, family: "event", observed_at: "2026-11-10T16:08:00+00:00", payload: {}, display: {} } as unknown as ReplayEnvelope];
  const render = (over: Partial<TimelineProps>) =>
    renderToStaticMarkup(
      <Timeline envelopes={envelopes} scrubIndex={0} playing={false} speed={5} live={false} liveAvailable inferredSessionSeqs={[]} onScrub={() => {}} onTogglePlay={() => {}} onSpeed={() => {}} onToggleLive={() => {}} monitor={null} {...over} />,
    );

  it("no Monitor button anywhere: Live and the position on their row, the transport on the next", () => {
    const html = render({ monitor: () => <span className="probe" /> });
    expect(html).not.toMatch(/🧠|et_monitor|aria-pressed|Monitor</);
    const top = html.slice(html.indexOf('<div class="et_right_top">'), html.indexOf('<div class="et_right">'));
    expect(top).toContain("● Live");
    expect(top).toContain('class="et_pos"');
    expect(top.match(/<button/g)).toHaveLength(1);
    const transport = html.slice(html.indexOf('<div class="et_right">'));
    expect(transport).toContain('aria-label="Back to the beginning"');
    expect(transport).toContain('aria-label="Playback speed"');
    expect(transport).not.toMatch(/● Live|et_pos/);
    expect(TIMELINE).not.toMatch(/monitorOpen|onToggleMonitor/);
    expect(VIEW).not.toMatch(/monitorOpen|setMonitorOpen|onToggleMonitor/);
  });

  it("the monitor's two places come from the monitor, at the seq drawn; behind the gate they stay, empty", () => {
    const seen: number[] = [];
    const html = render({ monitor: (seq) => (seen.push(seq), <><div className="et_readings">channels</div><div className="et_radar">bloom</div></>) });
    expect(seen).toEqual([7]);
    expect(html).toContain('<div class="et_readings">channels</div><div class="et_radar">bloom</div></div>');
    expect(render({})).toContain('<div class="et_readings"></div><div class="et_radar"></div></div>');
  });

  it("the grid: the lanes | the channels over Live over the transport | the bloom over the block's six rows", () => {
    expect(CSS).toMatch(/\.entity_timeline\.et_grid \{\s*display: grid;\s*grid-template-columns: max-content minmax\(0, 1fr\) max-content auto;/);
    expect(CSS).toMatch(/\.entity_timeline\.et_grid > \.et_readings \{\s*grid-column: 3;\s*grid-row: 1 \/ span 4;\s*align-self: end;\s*justify-self: stretch;/);
    // The channels as wide as the column: names at its left, values at its right edge (no empty space).
    expect(CSS).toMatch(/\.et_readings > \.cm_tone_list \{\s*flex: 1 1 0;\s*grid-template-columns: minmax\(0, 1fr\) max-content;/);
    expect(CSS).toMatch(/\.entity_timeline\.et_grid > \.et_right_top \{\s*grid-column: 3;\s*grid-row: 5;\s*justify-self: end;/);
    expect(CSS).toMatch(/\.entity_timeline\.et_grid > \.et_right \{\s*grid-column: 3;\s*grid-row: 6;\s*justify-self: end;/);
    expect(CSS).toMatch(/\.entity_timeline\.et_grid > \.et_radar \{\s*grid-column: 4;\s*grid-row: 1 \/ span 6;/);
    // Six rows: the five lanes and the bar.
    expect(LANES.length + 1).toBe(6);
    // The bloom's box is fixed: the block keeps one height whatever the monitor says.
    expect(CSS).toMatch(/\.et_radar \{\s*position: relative;\s*width: 210px;\s*height: 150px;/);
    expect(CSS).not.toMatch(/et_monitor|cw_compact|cw_panel|cw_state|cm_gauge/);
  });

  it("phone: the lanes and the bar on top, the full width; below, the channels with the bloom beside them, then Live, then the transport", () => {
    const phone = CSS.slice(CSS.indexOf("/* Phone (backlog 0040)"));
    expect(phone).toMatch(/\.entity_timeline\.et_grid \{\s*grid-template-columns: max-content minmax\(0, 1fr\) auto;/);
    expect(phone).toMatch(/\.entity_timeline\.et_grid > \.et_lane,\s*\.entity_timeline\.et_grid > \.et_track_wrap \{\s*grid-column: 2 \/ -1;/);
    expect(phone).toMatch(/\.entity_timeline\.et_grid > \.et_readings \{\s*grid-column: 1 \/ 3;\s*grid-row: 7;/);
    expect(phone).toMatch(/\.entity_timeline\.et_grid > \.et_radar \{\s*grid-column: 3;\s*grid-row: 7;/);
    expect(phone).toMatch(/\.entity_timeline\.et_grid > \.et_right_top,\s*\.entity_timeline\.et_grid > \.et_right \{\s*grid-column: 1 \/ -1;\s*justify-self: end;/);
    expect(phone).toMatch(/\.entity_timeline\.et_grid > \.et_right_top \{\s*grid-row: 8;/);
    expect(phone).toMatch(/\.entity_timeline\.et_grid > \.et_right \{\s*grid-row: 9;/);
    // No later rule puts the phone grid back on two columns.
    expect(CSS.slice(CSS.indexOf("/* Phone (backlog 0040)") + 30)).not.toMatch(/\.entity_timeline\.et_grid \{\s*grid-template-columns: max-content minmax\(0, 1fr\);/);
  });

  it("the page mounts it on his page past the content gate, at the seq the timeline draws; its read waits for his life and covers all of it", () => {
    const at = VIEW.indexOf("<Timeline");
    const timeline = VIEW.slice(at, VIEW.indexOf("playhead={playhead}", at));
    expect(timeline).toMatch(/monitor=\{\s*monitorOnScreen\s*\? \(seq\) => \(\s*<CognitionWavePanel/);
    const panel = timeline.slice(timeline.indexOf("<CognitionWavePanel"));
    for (const prop of ["lifeFold={lifeFold}", "ready={lifeLoaded}", "scrubSeq={seq}", "live={live}", "replyFeed={replyFeed}"]) expect(panel).toContain(prop);
    expect(VIEW).toContain("const monitorOnScreen = monitorShown({ locked: gatewayLocked, roster: indexBase !== null && !entityName });");
    expect(VIEW).toContain("const lifeLoaded = envelopes.length > 0 && bootProgress === null;");
    // His whole life: the page's fold when it is at the head, else one fold of the whole life.
    expect(VIEW).toMatch(/return cache && cache\.index === last && envelopes\[last\]\?\.seq === cache\.last_seq \? cache\.state : foldUpToIndex\(envelopes, last, null\)\.state;/);
    // Nothing of it in the main area, above the graph or under it.
    const main = VIEW.slice(VIEW.indexOf('<div className="entity_main"'), VIEW.indexOf("<Timeline"));
    expect(main).not.toMatch(/CognitionWavePanel|entity_monitor_dock/);
  });

  it("mounted unless his content is behind the content gate (beside the avatar view too)", () => {
    expect(monitorShown({ locked: false, roster: false })).toBe(true);
    expect(monitorShown({ locked: true, roster: false })).toBe(false);
    expect(monitorShown({ locked: false, roster: true })).toBe(false);
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
    const html = renderToStaticMarkup(<CognitionWavePanel lifeFold={lifeFold} ready source={{ baseUrl: "http://gw.test", entity: "reopen-castor" }} scrubSeq={10} live={false} replyFeed={createReplyFeed()} />);
    expect(html).toContain('<div class="et_radar" data-reading-state="ready">');
    expect(html).toContain('aria-label="Tone of the phrasing"');
    expect(reads).toHaveBeenCalledTimes(1);
    // A read for another home is its own.
    expect(startCorpusRead(corpusKey({ baseUrl: "http://gw.test", entity: "another" }), () => (reads(), Promise.resolve(ready("again"))))).not.toBeNull();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("moving along the timeline reads nothing: renders at many positions start no read, and no effect of the panel re-reads", () => {
    const key = corpusKey({ baseUrl: "http://gw.test", entity: "scrub-castor" });
    for (const seq of [0, 3, 9, 40, 1e6]) {
      renderToStaticMarkup(<CognitionWavePanel lifeFold={lifeFold} ready source={{ baseUrl: "http://gw.test", entity: "scrub-castor" }} scrubSeq={seq} live={false} replyFeed={createReplyFeed()} />);
    }
    expect(keptCorpus(key)).toEqual({ name: "idle" });
    // The read starts once his life has loaded: the one effect keyed by the home and the load (never by
    // the position) starts it when none is kept; runScore is defined once and called from that effect
    // only (an effect cannot run in a server render).
    expect(PANEL.match(/\brunScore\b/g)).toHaveLength(2);
    expect(PANEL).toMatch(/useEffect\(\(\) => \{\s*if \(ready && keptCorpus\(key\)\.name === "idle"\) runScore\(\);\s*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\s*\}, \[key, ready\]\);/);
    // Over his whole life, read at pull time: his replies and moments at stable picks, through the
    // browser's score cache (cognition_life_read.test.ts drives it).
    expect(PANEL).toContain("return await readLife(source, lifeFoldRef.current(), b, scoreStore(source, b.version));");
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
    return renderToStaticMarkup(<CognitionWavePanel lifeFold={lifeFold} ready source={source} scrubSeq={12} live={live} replyFeed={feed} />);
  };

  it("no title, no basis line, no framing note, no button, no footnote: the channels in the middle column, the bloom in the last; the framing and the basis are the ⓘ's hover", () => {
    const html = panel(false, reply());
    expect(html).toMatch(/^<div class="et_readings"><div class="cm_tone_list" role="group" aria-label="Tone of the phrasing">[\s\S]*<\/div><\/div><div class="et_radar" data-reading-state="idle"><div class="cm_canvas_box"/);
    expect(html).not.toMatch(/<button|Cognitive Monitor|basis v|read his words|reads his diary|his words at the timeline|cw_framing|cw_pull/);
    expect(html).toContain('aria-label="Tone of the phrasing"');
    // The ⓘ is a code with its card (hover, focus, long-press): a keyboard reaches it.
    expect(html).toMatch(/<span class="cw_about cm_explained" tabindex="0">ⓘ<\/span>/);
  });

  it("live with his conversation open: the reply in view, per message, in the same two places, the turn's conduct by name beside the channels", () => {
    const html = panel(true, reply({ effort: { think_ms: 40_100, tool_rounds: 0, memories_recalled: 44, memories_formed: 1 }, effortKey: "t1" }));
    expect(html).toMatch(/^<div class="et_readings"><div class="cm_tone_list cm_conduct_list" role="group" aria-label="Conduct of this turn">/);
    expect(html).toContain('<div class="cm_tone_list" role="group" aria-label="Tone of the phrasing">');
    expect(html).toContain('<div class="et_radar" data-reading-state="conversation">');
    for (const [name, value] of [["effort", "40.1s"], ["action", "0"], ["attention", "44+1"], ["rigor", "—"]]) {
      expect(html).toContain(`<span class="cm_tone_name">${name}</span><span class="cm_tone_val">${value}</span>`);
    }
    // No drawing of the gauge: its four reads are the list; the one canvas is the bloom's.
    expect(html).not.toMatch(/cm_gauge|conduct-gauge/);
    expect(html.match(/<canvas/g)).toHaveLength(1);
    expect(html).toContain('<canvas class="af-cognition-bloom__canvas"');
    expect(INLINE).not.toContain("AfConductGauge");
  });

  it("live without a conversation: his words at the position again", () => {
    expect(panel(true, null)).toContain('<div class="et_radar" data-reading-state="idle">');
    expect(panel(true, null)).not.toContain("Conduct of this turn");
  });

  it("follows the position from the one read: each seq shows the reading formed at or before it, no read started", async () => {
    const key = corpusKey({ baseUrl: "http://gw.test", entity: "follow-castor" });
    const at = (seq: number, warmth: number) => ({ ...sample(seq, `words at ${seq}`), scores: { warmth }, emotions: { joy: warmth } }) as unknown as ScoredSample;
    const reads = vi.fn(async () => ({ name: "ready" as const, samples: [at(5, 0.2), at(20, -0.4)], warnings: [] }));
    startCorpusRead(key, reads);
    await new Promise((r) => setTimeout(r, 0));
    const warmthAt = (seq: number) => {
      const html = renderToStaticMarkup(<CognitionWavePanel lifeFold={lifeFold} ready source={{ baseUrl: "http://gw.test", entity: "follow-castor" }} scrubSeq={seq} live={false} replyFeed={createReplyFeed()} />);
      return { value: html.match(/<span class="cm_tone_name">warmth<\/span><span class="cm_tone_val">([^<]*)<\/span>/)?.[1], html };
    };
    expect(warmthAt(3).value).toBe("—");
    expect(warmthAt(3).html).toContain('<span class="et_radar_note"><span class="cw_note">nothing said yet here</span></span>');
    expect(warmthAt(5).value).toBe("0.20");
    expect(warmthAt(19).value).toBe("0.20");
    expect(warmthAt(20).value).toBe("−0.40");
    expect(warmthAt(1e6).value).toBe("−0.40");
    // The bloom's register numbers follow too.
    expect(warmthAt(20).html).toMatch(/>joy<span class="cm_overlay_num">−0\.40<\/span>/);
    expect(reads).toHaveBeenCalledTimes(1);
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
  it("the bloom's box: its names in its own small type, the canvas centred; the note bottom right, the ⓘ top right, a refusal in its middle", () => {
    expect(CSS).toMatch(/\.et_radar \.cm_overlay \{\s*--ent-type-floor: 0px;/);
    expect(CSS).toMatch(/\.cm_bloom_canvas \{\s*position: absolute;\s*top: 0;/);
    expect(CSS).toMatch(/\.et_radar_note \{\s*position: absolute;\s*right: 0;\s*bottom: 0;[^}]*white-space: nowrap;/);
    expect(CSS).toMatch(/\.et_radar > \.cw_about \{\s*position: absolute;\s*top: 0;\s*right: 0;/);
    expect(CSS).toMatch(/\.et_radar_instead \{\s*position: absolute;\s*inset: 0;\s*display: grid;\s*place-items: center;/);
    // The five channels (and a visit's conduct): a column each of names (smaller) and values, side by side.
    expect(CSS).toMatch(/\.et_readings \{\s*display: flex;\s*align-items: flex-end;/);
    expect(CSS).toMatch(/\.cm_tone_list \{\s*display: grid;\s*grid-template-columns: max-content max-content;/);
    expect(CSS).toMatch(/\.cm_tone_name \{[^}]*font-size: max\(10px, calc\(var\(--ent-type-floor, 12px\) - 2px\)\);/);
    // A phone: a smaller box, the names alone around its bloom (numbers in the cards).
    const phone = CSS.slice(CSS.indexOf("/* Phone (backlog 0040)"));
    expect(phone).toMatch(/\.et_radar \{\s*width: 160px;\s*height: 120px;/);
    expect(phone).toMatch(/\.et_radar \.cm_overlay_num \{\s*display: none;/);
    expect(CSS).not.toMatch(/entity_monitor_dock|cw_dock|\.entity_main:has\(> \.entity/);
  });
});

describe("the monitor's one short line: every state says itself (backlog 0032 review F3)", () => {
  const src = { baseUrl: "http://gw.test" };
  const lines = (phase: Phase, { source = src as { baseUrl: string } | null, nothingHere = false } = {}) => {
    const { instead, note } = monitorLines(phase, source, nothingHere);
    return { instead: instead ? renderToStaticMarkup(instead) : null, note: note ? renderToStaticMarkup(note) : null };
  };

  it("over the bloom: reading, nothing readable, nothing said here; in its place: an exported view", () => {
    expect(lines({ name: "scoring" })).toEqual({ instead: null, note: '<span class="cw_note">reading…</span>' });
    expect(lines({ name: "empty", warnings: [] })).toEqual({ instead: null, note: '<span class="cw_note">nothing readable yet</span>' });
    expect(lines({ name: "ready", samples: [], warnings: [] }, { nothingHere: true })).toEqual({ instead: null, note: '<span class="cw_note">nothing said yet here</span>' });
    expect(lines({ name: "ready", samples: [], warnings: [] })).toEqual({ instead: null, note: null });
    expect(lines({ name: "idle" })).toEqual({ instead: null, note: null });
    expect(lines({ name: "scoring" }, { source: null })).toEqual({ instead: '<span class="cw_note">exported view: not read</span>', note: null });
  });

  it("no embeddings: one short line with the set-up link in the bloom's place, the whole sentence in its hover", () => {
    expect(lines({ name: "unconfigured", message: EMBEDDINGS_UNCONFIGURED })).toEqual({
      instead: `<span class="cw_note cw_note_error" data-monitor-note="embeddings" title="${EMBEDDINGS_UNCONFIGURED}">no embeddings · <a href="http://gw.test/console#defaults" target="_blank" rel="noreferrer">set up</a></span>`,
      note: null,
    });
  });

  it("a failed read: could not read in the bloom's place, the reason in its hover", () => {
    expect(lines({ name: "error", message: "the embeddings route timed out", warnings: ["batch 0-32 failed"] })).toEqual({
      instead: '<span class="cw_note cw_note_error" title="the embeddings route timed out · batch 0-32 failed">could not read</span>',
      note: null,
    });
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
    // What the automatic read covers (review round 6b F4): never his diary.
    expect(about.note).toContain("It reads his replies and moments, not his diary");
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

  it("the read asks the preflight first, before the harvest, and only when a pick is not scored yet", () => {
    const run = PANEL.slice(PANEL.indexOf("export async function readLife("), PANEL.indexOf("/** The ⓘ's card"));
    expect(run).toMatch(/if \(missing\.length > 0\) \{\s*\/\/ [^\n]*\n\s*const stop = await corpusPreflight\(source\.baseUrl, source\.entity\);/);
    expect(run.indexOf("await corpusPreflight(")).toBeLessThan(run.indexOf("scoreEntityUtterances("));
  });

  it("a failed read is not kept: the next visit to his page tries again", async () => {
    const key = corpusKey({ baseUrl: "http://gw.test", entity: "retry-castor" });
    expect(startCorpusRead(key, async () => ({ name: "unconfigured", message: EMBEDDINGS_UNCONFIGURED }))).not.toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(keptCorpus(key)).toEqual({ name: "idle" });
    expect(startCorpusRead(key, async () => ({ name: "error", message: "x", warnings: [] }))).not.toBeNull();
  });
});

describe("the bloom's tree is back, by name (backlog 0036)", () => {
  it("both readings draw the one named bloom (MonitorReading): a 150 px canvas (a ~114 px bloom) in a wider box, 120 on a phone", () => {
    expect(PANEL).toContain("return <MonitorReading state={phase.name} emotions={current?.emotions} scores={current?.scores} instead={instead} note={note} about={about} />;");
    expect(INLINE).toMatch(/<MonitorReading\s+state="conversation"\s+emotions=\{shown\?\.emotions\}\s+scores=\{shown\?\.scores\}/);
    expect(INLINE).toContain("<NamedBloom size={bloom} scores={bloomScores} emotions={emotions} />");
    expect(INLINE).toContain("<BloomAxisOverlay width={size.box} height={size.canvas} emotions={emotions ?? {}} />");
    expect(INLINE).toMatch(/const BLOOM = \{ canvas: 150, box: 210 \};\s*const BLOOM_PHONE = \{ canvas: 120, box: 160 \};/);
    expect(INLINE).toContain("return useAfMedia(AF_MEDIA.sm) ? BLOOM_PHONE : BLOOM;");
  });

  it("no 3-letter code in any label the monitor renders: the registers, the channels and the conduct go by name", async () => {
    const CODES = /\b(JOY|DIS|SUR|ANX|FEA|SAD|GRV|CAL|TEN|WAR|TSN|REF|STR|CER|EFF|ACT|ATT|RIG)\b/;
    const key = corpusKey({ baseUrl: "http://gw.test", entity: "named-castor" });
    const reading = { ...sample(5, "the harbour visit"), emotions: { joy: 0.3, calm: 0.1 }, scores: { warmth: 0.2 } } as unknown as ScoredSample;
    startCorpusRead(key, async () => ({ name: "ready", samples: [reading], warnings: [] }));
    await new Promise((r) => setTimeout(r, 0));
    const html = renderToStaticMarkup(<CognitionWavePanel lifeFold={lifeFold} ready source={{ baseUrl: "http://gw.test", entity: "named-castor" }} scrubSeq={10} live={false} replyFeed={createReplyFeed()} />);
    expect(html).toContain('class="cm_overlay"');
    for (const name of ["joy", "discovery", "surprise", "anxiety", "fear", "sadness", "gravity", "calm", "tenderness"]) expect(html).toContain(`>${name}<span class="cm_overlay_num">`);
    for (const name of ["warmth", "tension", "reflection", "structure", "certainty"]) expect(html).toContain(`<span class="cm_tone_name">${name}</span>`);
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(CODES);
    expect(html).not.toMatch(/title="[^"]*\b(JOY|CAL|DIS)\b/);
    // The conduct's four reads by name beside the channels (live with a conversation).
    expect(INLINE).toMatch(/<ExplainedCode key=\{a\.id\} className="cm_tone_item" style=\{\{ color: a\.color \}\} explain=\{conductExplainer\(a, cell\)\}>\s*<span className="cm_tone_name">\{a\.name\}<\/span>/);
    expect(INLINE).not.toMatch(/\{a\.code\}|mood\.axis\.code/);
  });
});

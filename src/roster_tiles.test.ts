// The home page's grid loads tile by tile (operator 2026-11-07: "reading the cards is extremely
// slow"): drawn from the roster at once, live reads per tile, entity tiles three at a time and kept.
// Each entity is the kit's EntityCard with its acts (operator 2026-11-10: Watch, Retry with the
// served reason, Resume) and the shared phase bar.
// The gateway is a mock answering on fake timers (no network, no live gateway).
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CARD_READ_CONCURRENCY, CARD_READ_RETRY_MS, CARD_READ_TTL_MS, createCardReads } from "./card_reads";
import { RosterEntityCard, fetchRosterTile, tileCardStatus, tileLife, tilePending, tilePhaseRead } from "./entities_index";
import { LOOP_CRASHED, phaseBody } from "./fixtures/phase_bodies";
import { phaseBarRead, type PhaseBarAct, type PhaseBarRead } from "./phase_bar";
import { PhaseBarControls } from "./phase_bar_controls";
import { createRosterLoader, tileVersion, type RosterCard, type RosterGateway, type RosterTile } from "./roster_tiles";
import type { EntitySummary } from "./stream_source";

const T0 = Date.parse("2026-11-07T10:00:00Z");
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type Row = { slug: string; state: string; changed_at: string };

/** An entity tile (`GET /entities/{name}/tile`, tile_version 1) as the gateway serves it. */
function tileOf(slug: string, over: Partial<RosterCard> = {}): RosterCard {
  return {
    tile_version: 1,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    slug,
    look: { style: "watch-halo", color: "#39a5d0" },
    born: "2026-10-08T10:00:00Z",
    age_days: 30,
    mind: { model: "gpt-5.6-terra", source: "entity" },
    now: { phase: "sleep", state: "awake", detail: "resting", busy: false, since: "2026-11-07T09:00:00Z", trouble: null },
    into_lately: [{ text: `interest of ${slug}`, at: "2026-11-06T10:00:00Z" }],
    on_its_mind: null,
    latest_lesson: null,
    last_moment: { kind: "wake", at: "2026-11-07T09:00:00Z" },
    counts: { open_questions: 1, lessons: 2, sleeps: 3 },
    ...over,
  };
}

/** Roster in 20 ms, loop and life in 10 ms, each tile in `cardMs[slug]` (default 15 ms). */
function mockGateway(rows: Row[], cardMs: Record<string, number> = {}, failCard: Set<string> = new Set()) {
  const calls = { list: 0, loop: [] as string[], life: [] as string[], card: [] as string[], inFlight: 0, maxInFlight: 0 };
  const state = { rows };
  const gw: RosterGateway = {
    async list(): Promise<EntitySummary[]> {
      calls.list += 1;
      await delay(20);
      return state.rows.map((r) => ({ name: r.slug, slug: r.slug, state: { state: r.state, changed_at: r.changed_at } }));
    },
    async loop(slug) {
      calls.loop.push(slug);
      await delay(10);
      return { running: false } as never;
    },
    async life(slug) {
      calls.life.push(slug);
      await delay(10);
      return phaseBarRead({ status: 200, body: phaseBody("sleep"), code: null });
    },
    async card(slug): Promise<RosterCard> {
      calls.card.push(slug);
      calls.inFlight += 1;
      calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight);
      try {
        await delay(cardMs[slug] ?? 15);
        if (failCard.has(slug)) throw new Error("The card could not be read (HTTP 500).");
        return tileOf(slug);
      } finally {
        calls.inFlight -= 1;
      }
    },
  };
  return { gw, calls, state };
}

function recorder() {
  const emissions: Array<{ at: number; tiles: RosterTile[] }> = [];
  const errors: Array<Error | null> = [];
  return {
    emissions,
    errors,
    tile: (slug: string) => emissions[emissions.length - 1]?.tiles.find((t) => t.summary.slug === slug),
    sink: { tiles: (t: RosterTile[]) => emissions.push({ at: Date.now(), tiles: t }), error: (e: Error | null) => errors.push(e) },
  };
}

const rows = (...slugs: string[]): Row[] => slugs.map((slug) => ({ slug, state: "asleep", changed_at: "2026-11-07T08:00:00Z" }));
const sync = (fn: () => void) => fn();

describe("the roster grid loads tile by tile (roster_tiles.ts)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("draws every tile from the roster before any live read or card answers", async () => {
    const m = mockGateway(rows("castor", "pollux", "ephemeral"), { castor: 6000, pollux: 6000, ephemeral: 6000 });
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(20);
    expect(r.emissions).toHaveLength(1);
    expect(r.emissions[0].at - T0).toBe(20);
    const first = r.emissions[0].tiles;
    expect(first.map((t) => t.summary.slug)).toEqual(["castor", "pollux", "ephemeral"]);
    expect(first.every((t) => t.cardStatus === "pending" && t.livePending && t.card === null)).toBe(true);
    expect(first[0].state).toEqual({ state: "asleep", changed_at: "2026-11-07T08:00:00Z" }); // the roster row's state
    // The live reads land 10 ms later, long before the cards.
    await vi.advanceTimersByTimeAsync(10);
    expect(r.tile("castor")?.livePending).toBe(false);
    expect(r.tile("castor")?.phase).toMatchObject({ kind: "served", bar: { phase: "sleep" } });
    expect(r.tile("castor")?.cardStatus).toBe("pending");
    loader.stop();
  });

  it("one slow card never holds the others back; at most three cards in flight", async () => {
    const names = ["ephemeral", "a", "b", "c", "d", "e", "f"];
    const m = mockGateway(rows(...names), { ephemeral: 6000 });
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    // Roster 20 ms, live reads 10 ms (a tile is queued after its live answers), three rounds of 15 ms.
    await vi.advanceTimersByTimeAsync(20 + 10 + 15 * 3 + 5);
    expect(m.calls.maxInFlight).toBe(CARD_READ_CONCURRENCY);
    expect(CARD_READ_CONCURRENCY).toBe(3);
    // Every quick card is in while ephemeral's is still on its way.
    for (const n of ["a", "b", "c", "d", "e", "f"]) expect(r.tile(n)?.cardStatus).toBe("loaded");
    expect(r.tile("ephemeral")?.cardStatus).toBe("pending");
    await vi.advanceTimersByTimeAsync(6000);
    expect(r.tile("ephemeral")?.cardStatus).toBe("loaded");
    expect(r.tile("ephemeral")?.card?.age_days).toBe(30);
    loader.stop();
  });

  it("a tile is read once its live answers arrived (the cheap reads first)", async () => {
    const m = mockGateway(rows("castor"));
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(25);
    expect(m.calls.life).toEqual(["castor"]);
    expect(m.calls.card).toEqual([]);
    await vi.advanceTimersByTimeAsync(6);
    expect(m.calls.card).toEqual(["castor"]);
    loader.stop();
  });

  it("a new served phase (its rev) reads the tile again, so its now line follows the bar", async () => {
    const m = mockGateway(rows("castor", "pollux"));
    let rev = 46;
    m.gw.life = async (slug) => {
      m.calls.life.push(slug);
      await delay(10);
      return phaseBarRead({ status: 200, body: phaseBody("sleep", { rev: slug === "castor" ? rev : 46 }), code: null });
    };
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls.card.sort()).toEqual(["castor", "pollux"]);
    rev = 47; // castor's phase moved; pollux's did not
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls.card.slice(2)).toEqual(["castor"]);
    // A failed life read keeps the newest seen rev: no extra read.
    m.gw.life = () => Promise.reject(new Error("HTTP 502"));
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls.card).toHaveLength(3);
    expect(tileVersion({ state: "awake", changed_at: "c1" }, phaseBarRead({ status: 200, body: phaseBody("idle"), code: null }))).toBe("c1|48");
    expect(tileVersion(null, { kind: "loading" })).toBe("|0");
    loader.stop();
  });

  it("keeps cards between refreshes: read again only after 5 minutes or when the state changed", async () => {
    const m = mockGateway(rows("castor", "pollux"));
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls.card.sort()).toEqual(["castor", "pollux"]);

    // A refresh 20 s later: roster and live reads again, no card.
    vi.setSystemTime(T0 + 20_000);
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls.list).toBe(2);
    expect(m.calls.loop.filter((s) => s === "castor")).toHaveLength(2);
    expect(m.calls.card).toHaveLength(2);

    // castor's state moved (state.changed_at): its card only is read again.
    m.state.rows = [{ slug: "castor", state: "awake", changed_at: "2026-11-07T10:00:30Z" }, rows("pollux")[0]];
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls.card.slice(2)).toEqual(["castor"]);

    // Past the 5-minute floor: both again.
    vi.setSystemTime(T0 + 20_000 + CARD_READ_TTL_MS + 1000);
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls.card.slice(3).sort()).toEqual(["castor", "pollux"]);
    loader.stop();
  });

  it("nothing blanks on a refresh: a tile keeps its card and live facts until newer answers replace them", async () => {
    const m = mockGateway(rows("castor"));
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    const before = r.emissions.length;
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(20); // the new roster answer, live reads still out
    const redrawn = r.emissions[before].tiles[0];
    expect(redrawn.cardStatus).toBe("loaded");
    expect(redrawn.card?.age_days).toBe(30);
    expect(redrawn.livePending).toBe(false);
    expect(redrawn.phase).toMatchObject({ kind: "served", bar: { phase: "sleep" } });
    expect(redrawn.loop).toEqual({ running: false });
    loader.stop();
  });

  it("a failed card leaves the roster facts and a short note; it is read again after a minute, not on every tick", async () => {
    const m = mockGateway(rows("castor", "pollux"), {}, new Set(["castor"]));
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.tile("castor")?.cardStatus).toBe("failed");
    expect(r.tile("castor")?.cardError).toContain("HTTP 500");
    expect(r.tile("castor")?.state?.state).toBe("asleep");
    expect(r.tile("pollux")?.cardStatus).toBe("loaded");
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls.card.filter((s) => s === "castor")).toHaveLength(1); // 20 s later: not yet
    vi.setSystemTime(Date.now() + CARD_READ_RETRY_MS);
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(m.calls.card.filter((s) => s === "castor")).toHaveLength(2);
    expect(m.calls.card.filter((s) => s === "pollux")).toHaveLength(1);
    loader.stop();
  });

  it("a live read that fails keeps the previous answer (no blanking, no phase from half the truth)", async () => {
    const m = mockGateway(rows("castor"));
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    m.gw.loop = () => Promise.reject(new Error("HTTP 502"));
    m.gw.life = () => Promise.reject(new Error("HTTP 502"));
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(100);
    expect(r.tile("castor")?.loop).toEqual({ running: false });
    expect(r.tile("castor")?.phase).toMatchObject({ kind: "served", bar: { phase: "sleep" } });
    loader.stop();
  });

  it("overlapping refreshes: the answers of a superseded tick are dropped", async () => {
    const m = mockGateway(rows("castor"));
    let n = 0;
    const list = m.gw.list.bind(m.gw);
    // The first roster answers late (after the second) and carries an older state.
    m.gw.list = async () => {
      n += 1;
      if (n === 1) {
        await delay(200);
        return [{ name: "castor", slug: "castor", state: { state: "awake", changed_at: "old" } }];
      }
      return list();
    };
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(400);
    expect(r.tile("castor")?.state?.state).toBe("asleep");
    expect(r.emissions.every((e) => e.tiles[0].state?.state !== "awake")).toBe(true);
    loader.stop();
  });

  it("a roster failure reaches the sink with its status (the sign-in prompt keys on 401/403)", async () => {
    const r = recorder();
    const err = Object.assign(new Error("entity list failed: HTTP 401"), { status: 401 });
    const loader = createRosterLoader({ gateway: { ...mockGateway([]).gw, list: () => Promise.reject(err) }, sink: r.sink, schedule: sync });
    await loader.refresh();
    expect(r.errors).toEqual([err]);
    expect(r.emissions).toHaveLength(0);
  });

  it("nothing reaches the sink after stop", async () => {
    const m = mockGateway(rows("castor"), { castor: 1000 });
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(20);
    const n = r.emissions.length;
    loader.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.emissions).toHaveLength(n);
  });
});

describe("card reads (card_reads.ts, app-agnostic)", () => {
  it("never queues an item twice nor reads it while its read is in flight", async () => {
    let calls = 0;
    let release: (v: string) => void = () => undefined;
    const reads = createCardReads<string>({ read: () => (calls++, new Promise((r) => (release = r))) });
    reads.want("a", "v1");
    reads.want("a", "v1");
    reads.want("a", "v2");
    expect(calls).toBe(1);
    release("x");
    await Promise.resolve();
    await Promise.resolve();
    expect(reads.entry("a")).toEqual({ value: "x", status: "loaded", error: "" });
  });

  it("forgets items that left the roster", async () => {
    const reads = createCardReads<string>({ read: async (k) => k });
    reads.want("a", "");
    await new Promise((r) => setTimeout(r, 0));
    reads.retain(["b"]);
    expect(reads.entry("a").status).toBe("pending");
  });
});

describe("the phase bar while a tile's live reads are on their way (tilePhaseRead)", () => {
  const served: PhaseBarRead = phaseBarRead({ status: 200, body: phaseBody("sleep"), code: null });
  it("claims no phase and keeps its controls waiting", () => {
    expect(tilePhaseRead({ phase: served, livePending: true })).toEqual({ kind: "loading" });
  });
  it("once answered: the served phase", () => {
    expect(tilePhaseRead({ phase: served, livePending: false })).toMatchObject({ kind: "served", bar: { phase: "sleep" } });
  });
  it("the grid draws the shared phase bar from it, without the kill switch (that stays on his page)", () => {
    const src = fs.readFileSync(path.join(__dirname, "entities_index.tsx"), "utf8");
    expect(src).toContain("const view = phaseBarView(tilePhaseRead(tile), ui, { resume: false });");
    expect(src).toContain("<PhaseBarControls");
    expect(src).toContain("showPower={false}");
    expect(src).not.toMatch(/AfPhaseRadio|startLoop|stopLoop|postEntityState/);
  });
});

describe("the roster card is the kit's EntityCard over the entity tile (operator 2026-11-10)", () => {
  const T = Date.parse("2026-11-07T12:00:00Z");
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
  });
  afterEach(() => vi.useRealTimers());
  const served = (phase: Parameters<typeof phaseBody>[0], over: Record<string, unknown> = {}): PhaseBarRead => phaseBarRead({ status: 200, body: phaseBody(phase, over), code: null });
  const tile = (over: Partial<RosterTile> = {}): RosterTile => ({
    summary: { name: "Castor", slug: "castor", avatar: { style: "watch-halo", color: "#39a5d0" } } as RosterTile["summary"],
    state: { state: "awake", changed_at: "2026-11-07T08:00:00Z" },
    loop: { phase: "stopped", running: false } as RosterTile["loop"],
    phase: served("idle"),
    livePending: false,
    card: tileOf("castor"),
    cardStatus: "loaded",
    cardError: "",
    ...over,
  });
  const CRASHED = served("idle", { ...LOOP_CRASHED, blocked: { ...LOOP_CRASHED.blocked } });
  const FAILURES = { phase: "stopped", running: false, stopped_by: "failures", updated_at: "2026-11-07T09:40:00Z" } as RosterTile["loop"];
  type El = React.ReactElement<Record<string, unknown>>;
  /** The words on the card, without the bar's hover tips (an indicator's tooltip holds the sentence). */
  const shown = (html: string) => html.replace(/<span class="ec_pb_tip"[^>]*>[^<]*<\/span>/g, " ").replace(/<[^>]+>/g, " ");
  const card = (t: RosterTile, extra: Partial<Parameters<typeof RosterEntityCard>[0]> = {}) => {
    const acts: PhaseBarAct[] = [];
    let opened = 0;
    const el = RosterEntityCard({ tile: t, tileUi: null, note: null, onOpen: () => void (opened += 1), onAct: (a) => void acts.push(a), onConfirm() {}, onCancel() {}, ...extra }) as El;
    return { el, props: el.props, acts, opened: () => opened, html: renderToStaticMarkup(el) };
  };

  it("the tile is read from GET /entities/{name}/tile (never the heavy /card compositor)", async () => {
    vi.useRealTimers();
    const urls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: string) => {
      urls.push(String(u));
      return new Response(JSON.stringify(tileOf("castor")), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      expect((await fetchRosterTile("http://gw", "castor")).slug).toBe("castor");
    } finally {
      globalThis.fetch = real;
    }
    expect(urls).toEqual(["http://gw/api/gateway/entities/castor/tile"]);
    const src = fs.readFileSync(path.join(__dirname, "entities_index.tsx"), "utf8");
    expect(src).toContain("card: (slug) => fetchRosterTile(baseUrl, slug),");
    expect(src).not.toContain("/card`");
  });

  it("calm: the kit card with a Watch button (his page), the tile's words, the shared phase bar", () => {
    const c = card(tile());
    expect(c.props.tile).toEqual(tileOf("castor"));
    expect(c.props.status).toBe("ready");
    expect(c.props.life).toEqual({ phase: "idle", stopped: false, sentence: "Awake and reachable; nothing of his own is running.", blocked: null });
    expect(c.html).toMatch(/<button type="button" class="af-entity-card__act af-entity-card__watch is-primary" aria-label="Watch Castor"[^>]*>[\s\S]*?<span>Watch<\/span>/);
    expect(c.html).toContain("interest of castor");
    expect(c.html).not.toContain("af-entity-card__life");
    expect(c.html).not.toContain("watch →");
    (c.props.onWatch as () => void)();
    (c.props.onOpen as () => void)();
    expect(c.opened()).toBe(2);
    const bar = c.props.actions as El;
    expect(bar.type).toBe(PhaseBarControls);
    expect(bar.props).toMatchObject({ showPower: false, showSentence: true, className: "eix_phase_bar" });
    expect(c.html).toContain('class="ec_phase_bar eix_phase_bar"');
  });

  it("own time stopped unexpectedly: the served sentence, the reason and Retry on the card; the bar does not repeat it", () => {
    const c = card(tile({ phase: CRASHED, loop: FAILURES }));
    expect(c.props.life).toMatchObject({ blocked: { code: "loop_crashed", action: "retry" } });
    expect(c.html).toContain('<span class="af-entity-card__life-sentence">His own time stopped unexpectedly. Retry to start it again.</span>');
    expect(c.html).toContain('<span class="af-entity-card__life-reason">It stopped after repeated failures (Nov 7); its memory is intact.</span>');
    expect(c.html).toMatch(/class="af-entity-card__act af-entity-card__retry is-primary"[^>]*>[\s\S]*?<span>Retry<\/span>/);
    expect(c.html).toContain("af-entity-card__watch");
    expect(shown(c.html).match(/His own time stopped unexpectedly\. Retry to start it again\./g)).toHaveLength(1);
    expect(c.html).not.toContain("ec_pb_blocked");
    (c.props.onRetry as () => void)();
    expect(c.acts).toEqual(["retry"]);
  });

  it("stopped: the served sentence and Resume on the card, no Watch; the bar's sentence steps aside", () => {
    const c = card(tile({ phase: served("stopped") }));
    expect(c.html).toMatch(/<div class="af-entity-card__life" data-tone="stopped" role="note"><p class="af-entity-card__life-text"><span class="af-entity-card__life-sentence">Stopped\. Nothing runs until you resume him\.<\/span><\/p><button type="button" class="af-entity-card__act af-entity-card__resume is-primary" aria-label="Resume Castor"/);
    expect(c.html).not.toContain("af-entity-card__watch");
    // Shown once (the bar's indicators keep it in their hover tips only).
    expect(shown(c.html).match(/Stopped\. Nothing runs until you resume him\./g)).toHaveLength(1);
    expect((c.props.actions as El).props.showSentence).toBe(false);
    (c.props.onResume as () => void)();
    expect(c.acts).toEqual(["resume"]);
  });

  it("in flight and answered: the card's act says so; a refusal as served under the box, the bar's own notes stay in the bar", () => {
    const stopped = tile({ phase: served("stopped") });
    const busy = card(stopped, { tileUi: { slug: "castor", ui: { busy: "resume", confirm: null } } });
    expect(busy.props.pending).toBe("resume");
    expect(busy.html).toMatch(/aria-busy="true" aria-label="Resuming Castor"[^>]*>[\s\S]*?<span>Resuming…<\/span>/);
    expect(card(stopped, { tileUi: { slug: "pollux", ui: { busy: "resume", confirm: null } } }).props.pending).toBe(null);
    expect(tilePending({ slug: "castor", ui: { busy: "personal", confirm: null } }, "castor")).toBe(null);
    const refused = card(stopped, { note: { text: "Only an admin can grant his own time, stop or resume him.", onCard: true, refused: true } });
    expect(refused.html).toContain('<p class="af-entity-card__notice" data-refused="true" role="alert">Only an admin can grant his own time, stop or resume him.</p>');
    expect(refused.html).not.toContain("ec_pb_note");
    const barNote = card(tile(), { note: { text: "Own time is off; he stays awake." } });
    expect(barNote.props.notice).toBe(null);
    expect((barNote.props.actions as El).props.note).toBe("Own time is off; he stays awake.");
  });

  it("while the live reads are on their way the card offers Watch only; the tile's own states", () => {
    const c = card(tile({ livePending: true, phase: served("stopped") }));
    expect(c.props.life).toBe(null);
    expect(tileLife({ kind: "failed", sentence: "x" })).toBe(null);
    expect(c.html).toContain("af-entity-card__watch");
    expect(tileCardStatus({ card: null, cardStatus: "pending", cardError: "" })).toBe("loading");
    expect(tileCardStatus({ card: null, cardStatus: "failed", cardError: "HTTP 500" })).toBe("unavailable");
    expect(tileCardStatus({ card: tileOf("castor"), cardStatus: "loaded", cardError: "HTTP 500" })).toBe("stale");
    const failed = card(tile({ card: null, cardStatus: "failed", cardError: "The card could not be read (HTTP 500)." }));
    expect(failed.html).toContain("Details unavailable right now");
    expect(failed.html).toContain('title="The card could not be read (HTTP 500)."');
  });

  it("the grid wires the card's Retry and Resume to the lifecycle route, one tile at a time, the answer on the card", () => {
    const src = fs.readFileSync(path.join(__dirname, "entities_index.tsx"), "utf8");
    expect(src).toContain('if (plan.kind === "retry" || plan.kind === "resume") {');
    expect(src).toContain("postLifecycle(baseUrl, slug, action, token)");
    expect(src).toContain(".then((wire) => adoptTileAnswer(slug, wire, act, true))");
    expect(src).toContain("onAct={(act) => actOnTile(tile, act)}");
    expect(src).toContain("setTileNote(out.sentence ? { slug, text: out.sentence, onCard, refused: !out.ok } : null);");
  });
});

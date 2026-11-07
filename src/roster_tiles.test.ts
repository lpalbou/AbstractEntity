// The home page's grid loads tile by tile (operator 2026-11-07: "reading the cards is extremely
// slow"): drawn from the roster at once, live reads per tile, cards three at a time and kept.
// The gateway is a mock answering on fake timers (no network, no live gateway).
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CARD_READ_CONCURRENCY, CARD_READ_TTL_MS, createCardReads } from "./card_reads";
import { CARD_FAILED_NOTE, RosterCardBody } from "./entities_index";
import { createRosterLoader, type RosterCard, type RosterGateway, type RosterTile } from "./roster_tiles";
import type { EntitySummary } from "./stream_source";

const T0 = Date.parse("2026-11-07T10:00:00Z");
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type Row = { slug: string; state: string; changed_at: string };

/** Roster in 20 ms, loop and life in 10 ms, each card in `cardMs[slug]` (default 15 ms). */
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
      return { phase: "sleep", state: "asleep", own_time_running: false };
    },
    async card(slug): Promise<RosterCard> {
      calls.card.push(slug);
      calls.inFlight += 1;
      calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight);
      try {
        await delay(cardMs[slug] ?? 15);
        if (failCard.has(slug)) throw new Error("The card could not be read (HTTP 500).");
        return { age_days: 30, discoveries: [`interest of ${slug}`] };
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
    expect(r.tile("castor")?.serverLife?.phase).toBe("sleep");
    expect(r.tile("castor")?.cardStatus).toBe("pending");
    loader.stop();
  });

  it("one slow card never holds the others back; at most three cards in flight", async () => {
    const names = ["ephemeral", "a", "b", "c", "d", "e", "f"];
    const m = mockGateway(rows(...names), { ephemeral: 6000 });
    const r = recorder();
    const loader = createRosterLoader({ gateway: m.gw, sink: r.sink, schedule: sync });
    void loader.refresh();
    await vi.advanceTimersByTimeAsync(20 + 15 * 3 + 5);
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
    expect(redrawn.serverLife?.phase).toBe("sleep");
    expect(redrawn.loop).toEqual({ running: false });
    loader.stop();
  });

  it("a failed card leaves the roster facts and a short note; the next tick retries", async () => {
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
    expect(m.calls.card.filter((s) => s === "castor")).toHaveLength(2);
    expect(m.calls.card.filter((s) => s === "pollux")).toHaveLength(1);
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

describe("the tile while its card is on its way", () => {
  it("holds the card's lines with quiet placeholders (no 'reading his card' text), a failure says so in a few words", () => {
    const src = fs.readFileSync(path.join(__dirname, "entities_index.tsx"), "utf8");
    expect(src).not.toContain("reading his card");
    expect(src).toContain('<span className="eix_sk eix_sk_meta" aria-hidden="true" />');
    expect(src).toContain('<span className="eix_sk eix_sk_upto" aria-hidden="true" />');
    expect(src).toContain("{CARD_FAILED_NOTE}");
    expect(CARD_FAILED_NOTE).toBe("details unavailable right now");
    const css = fs.readFileSync(path.join(__dirname, "entity.css"), "utf8");
    expect(css).toMatch(/\.eix_sk_meta \{[^}]*height:/);
    expect(css).toMatch(/\.eix_sk_upto \{[^}]*height:/);
    // The grid no longer waits for every entity's reads (the old Promise.all over the roster).
    expect(src).not.toMatch(/Promise\.all\(\s*entities\.map/);
  });

  it("a loaded card reads as before", () => {
    const html = renderToStaticMarkup(React.createElement(RosterCardBody, { card: { age_days: 12, discoveries: ["tides"], key_moments: { total: 4 } } }));
    expect(html).toContain("12d old");
    expect(html).toContain("tides");
    expect(html).toContain("4 key moments");
  });
});

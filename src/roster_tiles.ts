/**
 * The home page's "Summoned entities" grid, loaded tile by tile (operator 2026-11-07: "reading the
 * cards is extremely slow"; the approach of AbstractObserver 0.12.2's Board strip).
 *
 * The grid's reads differ wildly in cost:
 *   - the roster (`GET /entities`, ~20 ms) names every entity and carries its state (the same
 *     record `GET /state` serves): every tile is drawn from it at once;
 *   - the live reads (`/loop`, `/life_state`, ~10-20 ms each) give the phase bar its truth: read
 *     for every tile on every refresh, each tile updated when its own answers arrive;
 *   - the card (`/card`) is the heavy compositor (88 KB and 1-6 s for a long life such as
 *     ephemeral): read through `createCardReads` (card_reads.ts): three at a time, kept between
 *     refreshes, read again after 5 minutes or when the row's `state.changed_at` moves.
 * Nothing blanks on a refresh: a tile keeps what the previous tick knew until a newer answer
 * replaces it (a live read that fails keeps the previous answer; an answer from a tick that a newer
 * one superseded is dropped). The gateway-side fix (a light roster card) is gateway backlog 1012.
 */

import { createCardReads, type CardReadStatus, type CardReads } from "./card_reads";
import { adoptPhaseRead, type PhaseBarRead } from "./phase_bar";
import type { EntityStateInfo, EntitySummary, LoopStatus } from "./stream_source";

/** The slice of the card compositor the roster reads (the full shape belongs to the identity card). */
export interface RosterCard {
  age_days?: number;
  mind_substrate?: { provider?: string; model?: string };
  discoveries?: unknown[] | { interests?: unknown[] };
  capabilities?: { tools?: unknown[]; workspace_files?: number };
  sleep_stats?: { sleeps?: number; self_elected?: number; operator?: number; sleep_share?: number };
  key_moments?: { total?: number };
  moments?: Array<Record<string, unknown>>;
  likes_dislikes?: { likes?: Array<{ target?: string }> };
}

export interface RosterTile {
  summary: EntitySummary;
  /** The roster row's state (null when the row carries none). */
  state: EntityStateInfo | null;
  loop: LoopStatus | null;
  /** The served phase bar (`/life_state`, phase_bar.ts): loading until its first answer. */
  phase: PhaseBarRead;
  /** True until this tile's first live answers (loop + life state) arrived: the phase bar waits. */
  livePending: boolean;
  card: RosterCard | null;
  cardStatus: CardReadStatus;
  /** Why the card could not be read (the tile's tooltip). */
  cardError: string;
}

export interface RosterGateway {
  list(): Promise<EntitySummary[]>;
  loop(slug: string): Promise<LoopStatus>;
  /** The tile's phase bar (`GET /life_state` read by phase_bar.phaseBarRead). */
  life(slug: string): Promise<PhaseBarRead>;
  card(slug: string): Promise<RosterCard>;
}

export interface RosterSink {
  /** The tiles, roster order, a NEW array each time. */
  tiles(tiles: RosterTile[]): void;
  /** The roster read failed (the error carries `status` for 401/403); null after a good read. */
  error(error: (Error & { status?: number }) | null): void;
}

export interface RosterLoader {
  /** One tick: the roster (tiles emitted at once), then the live reads of every tile, cards queued
   * as needed. Resolves once the roster and the live reads settled; cards keep arriving after. */
  refresh(): Promise<void>;
  stop(): void;
}

export function createRosterLoader(opts: {
  gateway: RosterGateway;
  sink: RosterSink;
  /** How per-tile updates reach the sink (default: one emission per frame); tests pass a synchronous one. */
  schedule?: (fn: () => void) => void;
  now?: () => number;
  cardTtlMs?: number;
  cardRetryMs?: number;
  cardConcurrency?: number;
}): RosterLoader {
  const { gateway, sink } = opts;
  const schedule = opts.schedule ?? ((fn: () => void) => void setTimeout(fn, 16));
  let stopped = false;
  let tiles = new Map<string, RosterTile>();
  let order: string[] = [];
  let flushPending = false;
  /** The current tick: answers of an older one (refreshes overlap after an action) are dropped. */
  let generation = 0;

  const emitNow = () => {
    flushPending = false;
    if (stopped) return;
    sink.tiles(order.map((slug) => tiles.get(slug)!).filter(Boolean));
  };
  const emitSoon = () => {
    if (flushPending || stopped) return;
    flushPending = true;
    schedule(emitNow);
  };
  const patch = (slug: string, fields: Partial<RosterTile>) => {
    const tile = tiles.get(slug);
    if (!tile || stopped) return;
    tiles.set(slug, { ...tile, ...fields });
    emitSoon();
  };

  const cards: CardReads<RosterCard> = createCardReads<RosterCard>({
    read: (slug) => gateway.card(slug),
    onSettled: (slug) => patch(slug, cardPart(slug)),
    concurrency: opts.cardConcurrency,
    ttlMs: opts.cardTtlMs,
    retryMs: opts.cardRetryMs,
    now: opts.now,
  });
  const cardPart = (slug: string): Pick<RosterTile, "card" | "cardStatus" | "cardError"> => {
    const e = cards.entry(slug);
    return { card: e.value, cardStatus: e.status, cardError: e.error };
  };

  return {
    async refresh() {
      if (stopped) return;
      const tick = ++generation;
      let roster: EntitySummary[];
      try {
        roster = await gateway.list();
      } catch (e) {
        if (!stopped && tick === generation) sink.error(e as Error & { status?: number });
        return;
      }
      if (stopped || tick !== generation) return;
      const next = new Map<string, RosterTile>();
      for (const summary of roster) {
        const prev = tiles.get(summary.slug);
        next.set(summary.slug, {
          summary,
          state: summary.state ?? prev?.state ?? null,
          loop: prev?.loop ?? null,
          phase: prev?.phase ?? { kind: "loading" },
          livePending: prev ? prev.livePending : true,
          ...cardPart(summary.slug),
        });
      }
      tiles = next;
      order = roster.map((s) => s.slug);
      cards.retain(order);
      flushPending = false;
      sink.error(null);
      sink.tiles(order.map((slug) => tiles.get(slug)!));

      // Live reads first (cheap): all issued before any card so the browser serves them first.
      // A read that fails keeps the previous answer (undefined = not answered).
      const live = roster.map((s) =>
        Promise.all([gateway.loop(s.slug).catch(() => undefined), gateway.life(s.slug).catch(() => undefined)]).then(([loop, phase]) => {
          if (tick !== generation) return;
          const prev = tiles.get(s.slug);
          const prevPhase: PhaseBarRead = prev?.phase ?? { kind: "loading" };
          patch(s.slug, {
            loop: loop === undefined ? (prev?.loop ?? null) : loop,
            // The highest rev wins (contract §5); a read that failed keeps the previous answer.
            phase: phase === undefined ? prevPhase : adoptPhaseRead(prevPhase, phase),
            livePending: false,
          });
        }),
      );
      for (const s of roster) cards.want(s.slug, String(s.state?.changed_at ?? ""));
      await Promise.all(live);
    },
    stop() {
      stopped = true;
      cards.stop();
    },
  };
}

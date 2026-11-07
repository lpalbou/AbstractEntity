/**
 * The home page's "Summoned entities" grid, loaded tile by tile (operator 2026-11-07: "reading the
 * cards is extremely slow"; the approach of AbstractObserver 0.12.2's Board strip).
 *
 * The grid's reads differ wildly in cost:
 *   - the roster (`GET /entities`, ~20 ms) names every entity and carries its state (the same
 *     record `GET /state` serves): every tile is drawn from it at once;
 *   - the live reads (`/loop`, `/life_state`, ~10-20 ms each) give the phase radio its truth: read
 *     for every tile on every refresh, each tile updated when its own answers arrive;
 *   - the card (`/card`) is the heavy compositor (88 KB and 1-6 s for a long life such as
 *     ephemeral): read through `createCardReads` (card_reads.ts): three at a time, kept between
 *     refreshes, read again after 5 minutes or when the row's `state.changed_at` moves.
 * Nothing blanks on a refresh: a tile keeps what the previous tick knew until a newer answer
 * replaces it. The gateway-side fix (a light roster card) is gateway backlog 1012.
 */

import { createCardReads, type CardReadStatus, type CardReads } from "./card_reads";
import type { EntityStateInfo, EntitySummary, LoopStatus, ServerLifeState } from "./stream_source";

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
  /** Gateway-computed composite phase; null on older gateways (client derivation then). */
  serverLife: ServerLifeState | null;
  /** True until this tile's first live answers (loop + life state) arrived: the phase radio waits. */
  livePending: boolean;
  card: RosterCard | null;
  cardStatus: CardReadStatus;
  /** Why the card could not be read (the tile's tooltip). */
  cardError: string;
}

export interface RosterGateway {
  list(): Promise<EntitySummary[]>;
  loop(slug: string): Promise<LoopStatus>;
  life(slug: string): Promise<ServerLifeState | null>;
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
  cardConcurrency?: number;
}): RosterLoader {
  const { gateway, sink } = opts;
  const schedule = opts.schedule ?? ((fn: () => void) => void setTimeout(fn, 16));
  let stopped = false;
  let tiles = new Map<string, RosterTile>();
  let order: string[] = [];
  let flushPending = false;

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
    now: opts.now,
  });
  const cardPart = (slug: string): Pick<RosterTile, "card" | "cardStatus" | "cardError"> => {
    const e = cards.entry(slug);
    return { card: e.value, cardStatus: e.status, cardError: e.error };
  };

  return {
    async refresh() {
      if (stopped) return;
      let roster: EntitySummary[];
      try {
        roster = await gateway.list();
      } catch (e) {
        if (!stopped) sink.error(e as Error & { status?: number });
        return;
      }
      if (stopped) return;
      const next = new Map<string, RosterTile>();
      for (const summary of roster) {
        const prev = tiles.get(summary.slug);
        next.set(summary.slug, {
          summary,
          state: summary.state ?? prev?.state ?? null,
          loop: prev?.loop ?? null,
          serverLife: prev?.serverLife ?? null,
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
      const live = roster.map((s) =>
        Promise.all([gateway.loop(s.slug).catch(() => null), gateway.life(s.slug).catch(() => null)]).then(([loop, serverLife]) =>
          patch(s.slug, { loop, serverLife, livePending: false }),
        ),
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

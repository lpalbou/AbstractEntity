/**
 * Slow per-item reads, a few at a time and kept (operator 2026-11-07: "reading the cards is extremely
 * slow"). The same rules as AbstractObserver 0.12.2's Board strip (abstractobserver
 * src/ui/entity_tiles.ts), written without any app type so it can move into the kit as one shared
 * module (AbstractUIC backlog 0079): Observer and Entity both read a large, slow card per entity
 * next to a quick roster.
 *
 * - At most `concurrency` reads in flight (3: browsers open ~6 connections per host, three stay free
 *   for the quick reads, and two slow cards cannot hold back the third lane).
 * - A value is kept between refreshes and read again only when it is older than `ttlMs`
 *   (5 minutes) or when the item's `version` changed (an entity's `state.changed_at`).
 * - An item is never queued twice nor read while its read is in flight.
 * - A failed read keeps the older value (if any) and its read time, records the error, and is
 *   read again only after `retryMs` (1 minute): a card that fails slowly does not hold one of the
 *   three lanes on every refresh.
 * - `onSettled(key)` is called when a read finished, good or failed: the host redraws that item only.
 */

export const CARD_READ_CONCURRENCY = 3;
export const CARD_READ_TTL_MS = 5 * 60_000;
export const CARD_READ_RETRY_MS = 60_000;

export type CardReadStatus = "pending" | "loaded" | "failed";

export interface CardReadEntry<V> {
  /** The last value read (kept through a later failure), or null when none was read yet. */
  value: V | null;
  /** "pending" = nothing read yet; "loaded" = a value is known; "failed" = no value and the last read failed. */
  status: CardReadStatus;
  /** The last read's failure ("" after a good read). */
  error: string;
}

export interface CardReads<V> {
  /** Queue a read when the item has no value, its value is older than the TTL, or its version moved. */
  want(key: string, version: string): void;
  /** What is known of an item now. */
  entry(key: string): CardReadEntry<V>;
  /** Forget every item not listed (an entity gone from the roster). */
  retain(keys: Iterable<string>): void;
  /** Ends the reads: queued ones are dropped and late answers are ignored. */
  stop(): void;
}

export function createCardReads<V>(opts: {
  read(key: string): Promise<V>;
  onSettled?(key: string): void;
  concurrency?: number;
  ttlMs?: number;
  retryMs?: number;
  now?(): number;
}): CardReads<V> {
  const concurrency = Math.max(1, opts.concurrency ?? CARD_READ_CONCURRENCY);
  const ttl = opts.ttlMs ?? CARD_READ_TTL_MS;
  const now = opts.now ?? (() => Date.now());
  const retry = opts.retryMs ?? CARD_READ_RETRY_MS;
  const failedAt = new Map<string, number>();
  const values = new Map<string, { value: V; at: number; version: string }>();
  const errors = new Map<string, string>();
  const queue: Array<{ key: string; version: string }> = [];
  const queued = new Set<string>();
  const inFlight = new Set<string>();
  let stopped = false;

  const pump = () => {
    while (!stopped && inFlight.size < concurrency && queue.length) {
      const { key, version } = queue.shift()!;
      queued.delete(key);
      inFlight.add(key);
      let read: Promise<V>;
      try {
        read = opts.read(key);
      } catch (e) {
        read = Promise.reject(e);
      }
      read
        .then(
          (value) => {
            if (stopped) return;
            values.set(key, { value, at: now(), version });
            errors.delete(key);
            failedAt.delete(key);
          },
          (e: unknown) => {
            if (stopped) return;
            errors.set(key, String((e as Error)?.message || e || "the read failed"));
            failedAt.set(key, now());
          },
        )
        .finally(() => {
          inFlight.delete(key);
          if (stopped) return;
          opts.onSettled?.(key);
          pump();
        });
    }
  };

  const stale = (key: string, version: string): boolean => {
    const failed = failedAt.get(key);
    if (failed !== undefined && now() - failed < retry) return false;
    const known = values.get(key);
    if (!known) return true;
    if (now() - known.at >= ttl) return true;
    return known.version !== version;
  };

  return {
    want(key, version) {
      if (stopped || queued.has(key) || inFlight.has(key)) return;
      if (!stale(key, version)) return;
      queue.push({ key, version });
      queued.add(key);
      pump();
    },
    entry(key) {
      const known = values.get(key);
      const error = errors.get(key) || "";
      if (known) return { value: known.value, status: "loaded", error };
      return { value: null, status: error ? "failed" : "pending", error };
    },
    retain(keys) {
      const keep = new Set(keys);
      for (const k of [...values.keys()]) if (!keep.has(k)) values.delete(k);
      for (const k of [...errors.keys()]) if (!keep.has(k)) errors.delete(k);
      for (const k of [...failedAt.keys()]) if (!keep.has(k)) failedAt.delete(k);
      for (let i = queue.length - 1; i >= 0; i--) {
        if (!keep.has(queue[i].key)) {
          queued.delete(queue[i].key);
          queue.splice(i, 1);
        }
      }
    },
    stop() {
      stopped = true;
      queue.length = 0;
      queued.clear();
    },
  };
}

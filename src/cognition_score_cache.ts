/**
 * The monitor's score cache (review round 6b F4: "a reload with nothing new = 0 embedding calls and 0
 * record reads"): each record's reading, kept in this browser per gateway, entity and basis version, so
 * the automatic read embeds and reads only records it has not scored yet. Readings only: never the
 * words (`text`, `request` are dropped), the ids, seqs and scores the monitor draws.
 *
 * localStorage, read once when the read starts and written once when it ends with something new. A
 * browser that refuses it (private mode, blocked site data, full) keeps nothing: every load then reads
 * and embeds again, as before this cache — slower, never wrong.
 */
import type { ScoredSample } from "./cognition_adapter";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ScoreStore {
  /** The kept reading of a record, by the read's id. */
  get(id: string): ScoredSample | undefined;
  /** Keep exactly these readings (the current picks), replacing the rest. */
  save(samples: readonly ScoredSample[]): void;
}

const PREFIX = "abstractentity.monitor.scores:";

function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function scoreCacheKey(baseUrl: string, entity: string, basisVersion: string): string {
  return PREFIX + JSON.stringify([baseUrl, entity, basisVersion]);
}

export function scoreStore(home: { baseUrl: string; entity: string }, basisVersion: string, storage: KeyValueStorage | null = browserStorage()): ScoreStore {
  const key = scoreCacheKey(home.baseUrl, home.entity, basisVersion);
  let kept: Record<string, ScoredSample> = {};
  try {
    const raw = storage?.getItem(key);
    if (raw) kept = JSON.parse(raw) as Record<string, ScoredSample>;
  } catch {
    kept = {};
  }
  return {
    get: (id) => kept[id],
    save(samples) {
      kept = Object.fromEntries(
        samples.map((s) => {
          const { text: _text, request: _request, ...reading } = s;
          return [s.id, reading as ScoredSample];
        }),
      );
      try {
        storage?.setItem(key, JSON.stringify(kept));
      } catch {
        // Full or blocked: the next load reads these again.
      }
    },
  };
}

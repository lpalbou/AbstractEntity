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
  /** The kept reading of a record, by the read's id: undefined = never read here; null = read, and it
   * had no words to score (no verbatim, too short). */
  get(id: string): ScoredSample | null | undefined;
  /** Keep exactly these readings and these word-less ids (the current picks), replacing the rest. */
  save(samples: readonly ScoredSample[], wordless: readonly string[]): void;
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
  let kept: Record<string, ScoredSample | null> = {};
  try {
    const raw = storage?.getItem(key);
    if (raw) kept = JSON.parse(raw) as Record<string, ScoredSample | null>;
  } catch {
    kept = {};
  }
  return {
    get: (id) => (id in kept ? kept[id] : undefined),
    save(samples, wordless) {
      kept = Object.fromEntries([
        ...samples.map((s): [string, ScoredSample] => {
          const { text: _text, request: _request, ...reading } = s;
          return [s.id, reading as ScoredSample];
        }),
        ...wordless.map((id): [string, null] => [id, null]),
      ]);
      try {
        storage?.setItem(key, JSON.stringify(kept));
      } catch {
        // Full or blocked: the next load reads these again.
      }
    },
  };
}
